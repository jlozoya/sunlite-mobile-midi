import { app as electronApp } from "electron"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)

const __dirname = path.dirname(__filename)

const rendererDir = path.resolve(__dirname, "../renderer")

function getRuntimeResourcePath(fileName: string): string {
  if (electronApp.isPackaged) {
    return path.join(process.resourcesPath, fileName)
  }

  return path.resolve(__dirname, "../../resources", fileName)
}

function getWindowIconPath(): string {
  return getRuntimeResourcePath(process.platform === "win32" ? "icon.ico" : "icon.png")
}

function getApplicationVersion(): string {
  if (electronApp.isPackaged) return electronApp.getVersion()

  // In development getVersion() reports Electron's own version, not this app's.
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8"),
  ) as { version?: unknown }
  if (typeof manifest.version !== "string" || !manifest.version.trim()) {
    throw new Error("package.json no contiene una versión válida de la aplicación.")
  }
  return manifest.version
}

function getLoopMidiInstallerPath(): string {
  const devPath = path.resolve(__dirname, "../../resources/installers/loopMIDISetup.exe")
  const packagedPath = path.join(process.resourcesPath, "installers", "loopMIDISetup.exe")

  return electronApp.isPackaged ? packagedPath : devPath
}
export {
  __dirname as mainDirectory,
  rendererDir,
  getWindowIconPath,
  getApplicationVersion,
  getLoopMidiInstallerPath,
}
