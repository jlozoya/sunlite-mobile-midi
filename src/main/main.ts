import { app as electronApp, BrowserWindow, shell } from "electron"
import { UpdateManager } from "./update-manager.js"
import fs from "node:fs"
import express from "express"
import http from "node:http"
import path from "node:path"
import QRCode from "qrcode"
import type { AutomationMidiCommand } from "../shared/automation-types.js"
import { DEV_BACKEND_PORT_PARAM } from "../shared/websocket-url.js"
import { AutomationEngine } from "./automation/automation-engine.js"
import { ProDjLinkSidecar } from "./automation/prodj-link-sidecar.js"
import { RekordboxWindowCapture } from "./automation/rekordbox-window.js"
import { RouterService } from "./router-service.js"
import { findLoopMidiExecutable } from "../router/loop-midi.js"
import { WebSocketServer } from "ws"
import { isLightingSoftware, type LightingSoftware } from "../shared/lighting-software.js"
import type { ServerStatus } from "../shared/server-status.js"
import { getNetworkUrlCandidates, listenWithPortFallback } from "./server/network.js"
import { createMidiFeedbackStore } from "./persistence/midi-feedback-store.js"
import { createControllerStore } from "./persistence/controller-store.js"
import {
  MIDI_CHANNEL_ZERO_BASED,
  MIDI_OUTPUT_NAME,
  MIDI_INPUT_NAME,
} from "./midi/settings.js"
import {
  createMidiControllerService,
  type IncomingCommand,
} from "./midi/controller-service.js"
import {
  mainDirectory,
  rendererDir,
  getWindowIconPath,
  getLoopMidiInstallerPath,
} from "./runtime-paths.js"
import { createMidiBridgeService } from "./midi/bridge-service.js"
import { registerControllerRoutes } from "./server/controller-routes.js"
import { registerAutomationRoutes } from "./server/automation-routes.js"
import { registerRouterRoutes } from "./server/router-routes.js"
import { registerControllerSocket, broadcast } from "./server/controller-socket.js"
import { configureAutoUpdates } from "./electron/updates.js"
import { configureCapture } from "./electron/capture.js"

let lightingSoftware: LightingSoftware = "sunlite"

function lightingProfilePath(): string {
  const root = electronApp.getPath("userData")
  return lightingSoftware === "sunlite"
    ? root
    : path.join(root, "profiles", lightingSoftware)
}

function loadLightingSoftware(): void {
  try {
    const saved = JSON.parse(
      fs.readFileSync(
        path.join(electronApp.getPath("userData"), "lighting-software.json"),
        "utf8",
      ),
    )
    if (isLightingSoftware(saved.software)) lightingSoftware = saved.software
  } catch {
    /* Existing installations default to Sunlite. */
  }
}

function createAutomationEngine(): AutomationEngine {
  return new AutomationEngine(
    lightingProfilePath(),
    broadcastToAll,
    (command: AutomationMidiCommand) => handleCommand(command as IncomingCommand),
    lightingSoftware,
  )
}

let updateManager: UpdateManager | null = null

const DEFAULT_PORT = Number(process.env.PORT || 3000)

const controllerStore = createControllerStore(lightingProfilePath)
const { loadControllerCustomization } = controllerStore
const feedbackStore = createMidiFeedbackStore(lightingProfilePath)
const { cloneMidiFeedbackState, loadMidiFeedbackState } = feedbackStore

const midiController = createMidiControllerService({
  broadcastToAll,
  recordFeedback: (command) => automationEngine?.recordFeedback(command),
  getLightingSoftware: () => lightingSoftware,
  feedbackStore,
})
const { closeMidiConnection, handleCommand } = midiController
function refreshMidiConnection(force = false) {
  const status = midiController.refreshMidiConnection(force)
  if (serverStatus)
    serverStatus = { ...serverStatus, ...status, ...midiBridge.getStatus() }
  return serverStatus
}

const midiBridge = createMidiBridgeService({
  closeMidiConnection,
  refreshMidiConnection,
  getRouterService: () => routerService,
})
const { provisionMidiBridge } = midiBridge

let serverStatus: ServerStatus | null = null
let mainWindow: BrowserWindow | null = null
let automationEngine: AutomationEngine | null = null
let routerService: RouterService | null = null
let prodjLinkSidecar: ProDjLinkSidecar | null = null
let rekordboxCapture: RekordboxWindowCapture | null = null

function broadcastMidiFeedbackState() {
  broadcastToAll({ event: "midi-feedback-state", state: cloneMidiFeedbackState() })
}

let activeWebSocketServer: WebSocketServer | null = null

function broadcastToAll(payload: unknown) {
  if (activeWebSocketServer) {
    broadcast(activeWebSocketServer, payload)
  }
}

async function startControllerServer(): Promise<ServerStatus> {
  loadLightingSoftware()
  loadControllerCustomization()
  loadMidiFeedbackState()

  try {
    await provisionMidiBridge({ installIfMissing: electronApp.isPackaged })
  } catch (error) {
    midiBridge.reportError(error)
    console.warn("Automatic MIDI provisioning failed", error)
  }

  const appServer = express()
  const httpServer = http.createServer(appServer)
  const wss = new WebSocketServer({ server: httpServer })

  activeWebSocketServer = wss
  automationEngine = createAutomationEngine()
  rekordboxCapture = new RekordboxWindowCapture(
    electronApp.getPath("userData"),
    (bytes) => {
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send("rekordbox:frame", bytes)
    },
  )
  routerService = new RouterService(
    path.join(electronApp.getPath("userData"), "midi-router.config.json"),
    (payload) => broadcastToAll(payload),
    (command) => automationEngine?.recordManualCommand(command),
  )

  const projectRoot = path.resolve(mainDirectory, "../..")
  prodjLinkSidecar = new ProDjLinkSidecar({
    isPackaged: electronApp.isPackaged,
    resourcesPath: process.resourcesPath,
    projectRoot,
    onEvent: (event) => automationEngine?.handleDjLinkEvent(event),
    onStatus: (status) => automationEngine?.setBridgeStatus(status),
  })

  appServer.use(express.json())
  appServer.use(express.static(rendererDir))

  registerControllerRoutes(appServer, {
    getStatus: () => serverStatus,
    getLightingSoftware: () => lightingSoftware,
    isRecording: () => Boolean(automationEngine?.getStatus().recording),
    switchLightingSoftware,
    refreshMidiConnection,
    controllerStore,
    feedbackStore,
    midiBridge,
    broadcastToAll,
  })
  registerAutomationRoutes(appServer, {
    getEngine: () => automationEngine,
    getCapture: () => rekordboxCapture,
    getSidecar: () => prodjLinkSidecar,
  })
  registerRouterRoutes(appServer, {
    routerService,
    closeMidiConnection,
    refreshMidiConnection,
  })
  registerControllerSocket(wss, {
    refreshMidiConnection,
    midiController,
    controllerStore,
    feedbackStore,
    getEngine: () => automationEngine,
  })
  appServer.get("*", (_request, response) => {
    response.sendFile(path.join(rendererDir, "index.html"))
  })

  const port = await listenWithPortFallback(httpServer, DEFAULT_PORT)
  const networkUrlCandidates = getNetworkUrlCandidates(port)
  const lanUrls = networkUrlCandidates.map((candidate) => candidate.url)
  const localUrl = `http://127.0.0.1:${port}`
  const preferredLanUrl = networkUrlCandidates[0]?.url ?? localUrl
  const qrDataUrl = await QRCode.toDataURL(preferredLanUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  })

  const loopMidiInstallerPath = getLoopMidiInstallerPath()
  const loopMidiExecutablePath = findLoopMidiExecutable()

  serverStatus = {
    lightingSoftware,
    port,
    localUrl,
    lanUrls,
    networkUrlCandidates,
    preferredLanUrl,
    qrDataUrl,
    midiOutputName: null,
    expectedMidiOutputName: MIDI_OUTPUT_NAME,
    expectedMidiInputName: MIDI_INPUT_NAME,
    midiReady: false,
    feedbackReady: false,
    feedbackDisabledReason: midiController.getStatus().feedbackDisabledReason,
    midiChannel: MIDI_CHANNEL_ZERO_BASED + 1,
    availableMidiOutputs: midiController.getStatus().availableMidiOutputs,
    availableMidiInputs: midiController.getStatus().availableMidiInputs,
    midiInputName: null,
    loopMidiInstallerAvailable: fs.existsSync(loopMidiInstallerPath),
    loopMidiExecutablePath,
    loopMidiInstalled: Boolean(loopMidiExecutablePath),
    ...midiBridge.getStatus(),
  }

  refreshMidiConnection()
  prodjLinkSidecar.start()

  return serverStatus
}

async function createWindow(status: ServerStatus) {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 860,
    minWidth: 420,
    minHeight: 680,
    show: false,
    title: "Sunlite Mobile MIDI",
    icon: getWindowIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      preload: path.join(mainDirectory, "preload.cjs"),
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (["https:", "http:"].includes(new URL(url).protocol)) void shell.openExternal(url)
    return { action: "deny" }
  })

  const rendererUrl = new URL(process.env.SUNLITE_DEV_RENDERER_URL || status.localUrl)
  if (process.env.SUNLITE_DEV_RENDERER_URL) {
    rendererUrl.searchParams.set(DEV_BACKEND_PORT_PARAM, String(status.port))
  }
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== rendererUrl.origin) event.preventDefault()
  })
  updateManager = configureAutoUpdates({
    getWindow: () => mainWindow,
    getAutomationStatus: () => automationEngine?.getStatus(),
    trustedUrl: process.env.SUNLITE_DEV_RENDERER_URL || serverStatus?.localUrl,
  })
  await mainWindow.loadURL(rendererUrl.toString())
  mainWindow.maximize()
  mainWindow.show()
}

const hasSingleInstanceLock = electronApp.requestSingleInstanceLock()
if (!hasSingleInstanceLock) electronApp.quit()
else
  electronApp.whenReady().then(async () => {
    try {
      const status = await startControllerServer()
      const trustedUrl = process.env.SUNLITE_DEV_RENDERER_URL || status.localUrl
      configureCapture({
        getWindow: () => mainWindow,
        getCapture: () => rekordboxCapture,
        trustedUrl,
      })
      await createWindow(status)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown startup error"
      console.error(message)

      const errorWindow = new BrowserWindow({
        width: 760,
        height: 420,
        title: "Sunlite Mobile MIDI - Startup Error",
        icon: getWindowIconPath(),
        autoHideMenuBar: true,
      })

      await errorWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(`
        <html>
          <body style="font-family: system-ui; padding: 24px; line-height: 1.5; background: #0f172a; color: #e2e8f0;">
            <h1>Startup error</h1>
            <pre style="white-space: pre-wrap; background: #111827; padding: 16px; border-radius: 12px;">${message}</pre>
          </body>
        </html>
      `)}`,
      )
    }
  })

electronApp.on("second-instance", () => {
  if (mainWindow?.isMinimized()) mainWindow.restore()
  mainWindow?.focus()
})

electronApp.on("before-quit", () => {
  updateManager?.stop()
  prodjLinkSidecar?.stop()
  rekordboxCapture?.dispose()
  routerService?.dispose()
  if (automationEngine?.getStatus().recording) automationEngine.stopSession()
  closeMidiConnection()
})

electronApp.on("window-all-closed", () => {
  prodjLinkSidecar?.stop()
  rekordboxCapture?.dispose()
  routerService?.dispose()
  if (automationEngine?.getStatus().recording) automationEngine.stopSession()
  closeMidiConnection()

  if (process.platform !== "darwin") {
    electronApp.quit()
  }
})

function switchLightingSoftware(software: LightingSoftware) {
  const previousSoftware = lightingSoftware
  let nextEngine: AutomationEngine
  try {
    lightingSoftware = software
    nextEngine = createAutomationEngine()
    fs.writeFileSync(
      path.join(electronApp.getPath("userData"), "lighting-software.json"),
      JSON.stringify({ software }),
      "utf8",
    )
  } catch (error) {
    lightingSoftware = previousSoftware
    throw error
  }
  automationEngine?.dispose()
  automationEngine = nextEngine
  loadControllerCustomization()
  feedbackStore.clear()
  if (serverStatus) serverStatus.lightingSoftware = software
  broadcastToAll({
    event: "controller-config",
    config: controllerStore.getCustomization(),
  })
  broadcastMidiFeedbackState()
  broadcastToAll({ event: "automation-status", status: automationEngine.getStatus() })
}
