import { spawn, type ChildProcess } from "node:child_process"

// PrintWindow captures the window contents without compositing the system cursor.
// Keep this in a separate process so a stalled Rekordbox window cannot block Electron.
const captureScript = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class RekordboxWindowApi {
  [StructLayout(LayoutKind.Sequential)] public struct RECT {
    public int Left, Top, Right, Bottom;
  }
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out RECT rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr window, IntPtr dc, uint flags);
}
'@
Add-Type -AssemblyName System.Drawing
# GetWindowRect and PrintWindow must use physical pixels at every display scale.
# Otherwise the bitmap is too small and clips the right/bottom of Rekordbox.
try {
  $dpiAware = [RekordboxWindowApi]::SetProcessDpiAwarenessContext([IntPtr]::new(-4))
  # PowerShell may already have a process context fixed by its manifest.
  if (-not $dpiAware) {
    [void][RekordboxWindowApi]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
  }
} catch {
  [void][RekordboxWindowApi]::SetProcessDPIAware()
}
$window = [IntPtr]::new([long]WINDOW_HANDLE)
$output = [Console]::OpenStandardOutput()
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object MimeType -EQ 'image/jpeg' | Select-Object -First 1
$quality = New-Object System.Drawing.Imaging.EncoderParameters(1)
$quality.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
  [System.Drawing.Imaging.Encoder]::Quality, [long]65)
$bitmap = $null
$graphics = $null
$memory = New-Object System.IO.MemoryStream
try {
  while ([RekordboxWindowApi]::IsWindow($window)) {
    $started = [System.Diagnostics.Stopwatch]::StartNew()
    $rect = New-Object RekordboxWindowApi+RECT
    if (-not [RekordboxWindowApi]::GetWindowRect($window, [ref]$rect)) { break }
    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top
    if ($width -lt 320 -or $height -lt 180 -or $width -gt 4096 -or $height -gt 2160) {
      Start-Sleep -Milliseconds 250
      continue
    }
    if ($null -eq $bitmap -or $bitmap.Width -ne $width -or $bitmap.Height -ne $height) {
      if ($null -ne $graphics) { $graphics.Dispose() }
      if ($null -ne $bitmap) { $bitmap.Dispose() }
      $bitmap = New-Object System.Drawing.Bitmap($width, $height)
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    }
    $dc = $graphics.GetHdc()
    try { $captured = [RekordboxWindowApi]::PrintWindow($window, $dc, 2) }
    finally { $graphics.ReleaseHdc($dc) }
    if ($captured) {
      # Reuse the encoder buffer instead of allocating/copying a full JPEG each frame.
      $memory.SetLength(0)
      $memory.Position = 0
      $bitmap.Save($memory, $jpeg, $quality)
      $length = [BitConverter]::GetBytes([int]$memory.Length)
      $output.Write($length, 0, 4)
      $output.Write($memory.GetBuffer(), 0, [int]$memory.Length)
      $output.Flush()
    }
    # Aim for 60 fps when capture/encoding fit the budget; never queue old captures.
    $remaining = [int][Math]::Ceiling((1000.0 / 60) - $started.Elapsed.TotalMilliseconds)
    if ($remaining -gt 0) { Start-Sleep -Milliseconds $remaining }
  }
} finally {
  if ($null -ne $graphics) { $graphics.Dispose() }
  if ($null -ne $bitmap) { $bitmap.Dispose() }
  $quality.Dispose()
  $memory.Dispose()
}
`

const MAX_FRAME_BYTES = 2_000_000

export function startRekordboxNativeCapture(
  windowHandle: string,
  onFrame: (bytes: Uint8Array) => void,
  onExit: () => void,
): ChildProcess {
  if (!/^\d+$/.test(windowHandle)) throw new Error("Invalid window handle")

  const script = captureScript.replace("WINDOW_HANDLE", windowHandle)
  const child = spawn(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  )
  let pending = Buffer.alloc(0)
  let exited = false
  const finish = () => {
    if (exited) return
    exited = true
    onExit()
  }

  child.stdout?.on("data", (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk])
    while (pending.length >= 4) {
      const length = pending.readUInt32LE(0)
      if (length < 100 || length > MAX_FRAME_BYTES) {
        child.kill()
        return
      }
      if (pending.length < length + 4) return
      onFrame(pending.subarray(4, length + 4))
      pending = pending.subarray(length + 4)
    }
  })
  child.stderr?.resume()
  child.on("error", finish)
  child.on("exit", finish)
  return child
}
