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
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out RECT rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr window, IntPtr dc, uint flags);
}
'@
Add-Type -AssemblyName System.Drawing
$window = [IntPtr]::new([long]WINDOW_HANDLE)
$output = [Console]::OpenStandardOutput()
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object MimeType -EQ 'image/jpeg' | Select-Object -First 1
$quality = New-Object System.Drawing.Imaging.EncoderParameters(1)
$quality.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
  [System.Drawing.Imaging.Encoder]::Quality, [long]65)
$bitmap = $null
$graphics = $null
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
      $memory = New-Object System.IO.MemoryStream
      try {
        $bitmap.Save($memory, $jpeg, $quality)
        $bytes = $memory.ToArray()
        $length = [BitConverter]::GetBytes([int]$bytes.Length)
        $output.Write($length, 0, 4)
        $output.Write($bytes, 0, $bytes.Length)
        $output.Flush()
      } finally { $memory.Dispose() }
    }
    $remaining = 40 - $started.ElapsedMilliseconds
    if ($remaining -gt 0) { Start-Sleep -Milliseconds $remaining }
  }
} finally {
  if ($null -ne $graphics) { $graphics.Dispose() }
  if ($null -ne $bitmap) { $bitmap.Dispose() }
  $quality.Dispose()
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
