import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const rendererPort = Number(process.env.VITE_PORT || 5173)
const rendererUrl = `http://127.0.0.1:${rendererPort}`
const node = process.execPath
const children = new Set()

let electronProcess
let restartingElectron = false
let restartRequested = false
let restartTimer
let shuttingDown = false

function runNodeScript(script, args = [], options = {}) {
  const child = spawn(node, [path.join(projectRoot, script), ...args], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
    ...options,
  })

  children.add(child)
  child.once("exit", () => children.delete(child))
  return child
}

function startElectron() {
  if (shuttingDown) return

  electronProcess = runNodeScript("node_modules/electron/cli.js", ["dist/main/main.js"], {
    env: {
      ...process.env,
      SUNLITE_DEV_RENDERER_URL: rendererUrl,
    },
  })
}

function restartElectron() {
  if (shuttingDown) return
  if (restartingElectron) {
    restartRequested = true
    return
  }

  restartingElectron = true
  restartRequested = false

  if (!electronProcess || electronProcess.exitCode !== null) {
    restartingElectron = false
    startElectron()
    return
  }

  electronProcess.once("exit", () => {
    restartingElectron = false
    startElectron()
    if (restartRequested) scheduleElectronRestart()
  })
  electronProcess.kill("SIGTERM")
}

function scheduleElectronRestart() {
  clearTimeout(restartTimer)
  restartTimer = setTimeout(restartElectron, 300)
}

function waitForRenderer(timeoutMs = 30_000) {
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const response = await fetch(rendererUrl)
        if (response.ok) {
          resolve()
          return
        }
      } catch {
        // Vite is still starting.
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`Vite did not start at ${rendererUrl} within ${timeoutMs}ms`))
        return
      }

      setTimeout(poll, 150)
    }

    void poll()
  })
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  clearTimeout(restartTimer)

  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGTERM")
  }

  setTimeout(() => process.exit(exitCode), 250)
}

process.once("SIGINT", () => shutdown())
process.once("SIGTERM", () => shutdown())

const vite = runNodeScript("node_modules/vite/bin/vite.js")
vite.once("exit", (code) => {
  if (!shuttingDown) shutdown(code || 1)
})

const typeScript = runNodeScript("node_modules/typescript/bin/tsc", [
  "-p",
  "tsconfig.node.json",
  "--watch",
  "--preserveWatchOutput",
])
typeScript.once("exit", (code) => {
  if (!shuttingDown) shutdown(code || 1)
})

const compiledCodeWatcher = fs.watch(
  path.join(projectRoot, "dist"),
  { recursive: true },
  (_eventType, fileName) => {
    if (!electronProcess || !fileName?.endsWith(".js")) return
    if (fileName.startsWith(`renderer${path.sep}`)) return
    scheduleElectronRestart()
  },
)

try {
  await waitForRenderer()
  startElectron()
  console.info("Development mode ready. Press Ctrl+C to stop.")
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  compiledCodeWatcher.close()
  shutdown(1)
}
