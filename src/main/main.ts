import { app as electronApp, BrowserWindow, shell } from "electron"
import electronUpdater from "electron-updater"
import { spawn } from "node:child_process"
import fs from "node:fs"
import easymidi from "easymidi"
import express from "express"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import QRCode from "qrcode"
import { DEFAULT_CONTROLLER_CUSTOMIZATION, mergeControllerCustomization, type ControllerCustomization } from "../shared/controller-config.js"
import { WebSocketServer, type WebSocket } from "ws"


type AutoUpdaterLike = {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  setFeedURL: (options: { provider: "generic"; url: string }) => void
  on: (event: string, listener: (...args: unknown[]) => void) => void
  checkForUpdatesAndNotify: () => Promise<unknown>
}

const { autoUpdater } = electronUpdater as unknown as { autoUpdater: AutoUpdaterLike }

function getUpdateInfoVersion(info: unknown): string {
  if (info && typeof info === "object" && "version" in info) {
    const version = (info as { version?: unknown }).version
    if (typeof version === "string") {
      return version
    }
  }

  return "unknown"
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DEFAULT_PORT = 3000
const DEFAULT_MIDI_OUTPUT_NAME = "Sunlite Mobile In"
const DEFAULT_MIDI_INPUT_NAME = "Sunlite Mobile Out"
const MIDI_CHANNEL_ZERO_BASED = Number(process.env.MIDI_CHANNEL || 0)
const MIDI_OUTPUT_NAME = process.env.MIDI_OUTPUT_NAME || DEFAULT_MIDI_OUTPUT_NAME
const MIDI_INPUT_NAME = process.env.MIDI_INPUT_NAME || DEFAULT_MIDI_INPUT_NAME

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

function configureAutoUpdates() {
  if (!electronApp.isPackaged) {
    return
  }

  const updateFeedUrl = process.env.SUNLITE_UPDATE_FEED_URL

  if (updateFeedUrl) {
    autoUpdater.setFeedURL({
      provider: "generic",
      url: updateFeedUrl,
    })
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on("checking-for-update", () => {
    console.info("Checking for Sunlite Mobile MIDI updates")
  })

  autoUpdater.on("update-available", (info: unknown) => {
    console.info(`Sunlite Mobile MIDI update available: ${getUpdateInfoVersion(info)}`)
  })

  autoUpdater.on("update-not-available", () => {
    console.info("Sunlite Mobile MIDI is up to date")
  })

  autoUpdater.on("error", (error: unknown) => {
    console.warn("Sunlite Mobile MIDI update check failed", error)
  })

  autoUpdater.on("update-downloaded", (info: unknown) => {
    console.info(`Sunlite Mobile MIDI update downloaded: ${getUpdateInfoVersion(info)}. It will install on app quit.`)
  })

  setTimeout(() => {
    void autoUpdater.checkForUpdatesAndNotify().catch((error: unknown) => {
      console.warn("Sunlite Mobile MIDI update check failed", error)
    })
  }, 3000)
}


type MidiConnection = {
  outputName: string
  output: easymidi.Output
  inputName: string | null
  input: easymidi.Input | null
  midi: ReturnType<typeof createMidiSender>
}

type NetworkUrlCandidate = {
  interfaceName: string
  address: string
  url: string
  priority: number
  note: string
}

type ServerStatus = {
  port: number
  localUrl: string
  lanUrls: string[]
  networkUrlCandidates: NetworkUrlCandidate[]
  preferredLanUrl: string
  qrDataUrl: string
  midiOutputName: string | null
  midiInputName: string | null
  expectedMidiOutputName: string
  expectedMidiInputName: string
  midiReady: boolean
  feedbackReady: boolean
  feedbackDisabledReason: string | null
  midiChannel: number
  availableMidiOutputs: string[]
  availableMidiInputs: string[]
  loopMidiInstallerAvailable: boolean
  loopMidiExecutablePath: string | null
  loopMidiInstalled: boolean
}

type IncomingCommand =
  | { type: "note"; note: number; velocity?: number; offDelayMs?: number }
  | { type: "noteon"; note: number; velocity?: number }
  | { type: "noteoff"; note: number; velocity?: number }
  | { type: "cc"; controller: number; value: number }
  | { type: "program"; number: number }


type MidiPayload = Record<string, number>
type MidiSend = (messageType: string, payload: MidiPayload) => void
type ProcessEventEmitter = {
  on(event: "error", listener: (error: Error) => void): void
  on(event: "close", listener: (code: number | null) => void): void
}

function sendMidi(output: easymidi.Output, messageType: string, payload: MidiPayload) {
  ;(output.send as unknown as MidiSend)(messageType, payload)
}

function midiMessageToRecord(message: unknown): Record<string, unknown> {
  return message as unknown as Record<string, unknown>
}

let serverStatus: ServerStatus | null = null
let midiConnection: MidiConnection | null = null
let mainWindow: BrowserWindow | null = null
let controllerCustomization: ControllerCustomization = DEFAULT_CONTROLLER_CUSTOMIZATION
let feedbackDisabledReason: string | null = null

type MidiGuardEvent = { at: number; fingerprint: string }
type MidiPadFeedback = {
  velocity: number
  behaviorChannel: number
}

type MidiFeedbackState = {
  padStates: Record<number, MidiPadFeedback>
  ccValues: Record<number, number>
}

const MIDI_LOOP_GUARD_WINDOW_MS = 1000
const MIDI_LOOP_GUARD_MAX_TOTAL_MESSAGES = 24
const MIDI_LOOP_GUARD_MAX_REPEATED_MESSAGES = 8
let midiGuardEvents: MidiGuardEvent[] = []
let midiFeedbackState: MidiFeedbackState = { padStates: {}, ccValues: {} }
let midiFeedbackBroadcastTimer: NodeJS.Timeout | null = null

function cloneMidiFeedbackState(): MidiFeedbackState {
  return {
    padStates: Object.fromEntries(
      Object.entries(midiFeedbackState.padStates).map(([note, state]) => [note, { ...state }]),
    ),
    ccValues: { ...midiFeedbackState.ccValues },
  }
}

function getMidiFeedbackStatePath(): string {
  return path.join(electronApp.getPath("userData"), "midi-feedback-state.json")
}

function normalizeStoredMidiFeedbackState(value: unknown): MidiFeedbackState {
  if (!value || typeof value !== "object") {
    return { padStates: {}, ccValues: {} }
  }

  const source = value as Partial<MidiFeedbackState> & { padVelocities?: Record<string, unknown> }

  function normalizeMidiNumberRecord(record: unknown): Record<number, number> {
    if (!record || typeof record !== "object") {
      return {}
    }

    const normalized: Record<number, number> = {}

    for (const [key, rawValue] of Object.entries(record as Record<string, unknown>)) {
      const midiKey = clampMidiValue(key)
      const midiValue = clampMidiValue(rawValue)
      normalized[midiKey] = midiValue
    }

    return normalized
  }

  function normalizePadStates(record: unknown): Record<number, MidiPadFeedback> {
    if (!record || typeof record !== "object") {
      return {}
    }

    const normalized: Record<number, MidiPadFeedback> = {}

    for (const [key, rawValue] of Object.entries(record as Record<string, unknown>)) {
      const note = clampMidiValue(key)

      if (rawValue && typeof rawValue === "object") {
        const item = rawValue as Partial<MidiPadFeedback>
        const velocity = clampMidiValue(item.velocity)

        if (velocity > 0) {
          normalized[note] = {
            velocity,
            behaviorChannel: clampApcLedBehaviorChannel(item.behaviorChannel),
          }
        }

        continue
      }

      const legacyVelocity = clampMidiValue(rawValue)
      if (legacyVelocity > 0) {
        normalized[note] = { velocity: legacyVelocity, behaviorChannel: 6 }
      }
    }

    return normalized
  }

  const padStates = normalizePadStates(source.padStates ?? source.padVelocities)

  return {
    padStates,
    ccValues: normalizeMidiNumberRecord(source.ccValues),
  }
}

function clampApcLedBehaviorChannel(value: unknown): number {
  const numericValue = Number(value)

  if (Number.isNaN(numericValue)) {
    return 6
  }

  return Math.max(0, Math.min(15, Math.round(numericValue)))
}

function loadMidiFeedbackState(): MidiFeedbackState {
  const statePath = getMidiFeedbackStatePath()

  try {
    if (!fs.existsSync(statePath)) {
      midiFeedbackState = { padStates: {}, ccValues: {} }
      return cloneMidiFeedbackState()
    }

    const raw = fs.readFileSync(statePath, "utf8")
    midiFeedbackState = normalizeStoredMidiFeedbackState(JSON.parse(raw))
    return cloneMidiFeedbackState()
  } catch {
    midiFeedbackState = { padStates: {}, ccValues: {} }
    return cloneMidiFeedbackState()
  }
}

function saveMidiFeedbackState() {
  const statePath = getMidiFeedbackStatePath()

  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true })
    fs.writeFileSync(statePath, JSON.stringify(cloneMidiFeedbackState(), null, 2), "utf8")
  } catch {
    // Ignore persistence failures; live MIDI feedback should continue working.
  }
}

function updateMidiFeedbackState(kind: "noteon" | "noteoff" | "cc", message: Record<string, unknown>): MidiFeedbackState {
  if (kind === "noteon") {
    const note = clampMidiValue(message.note)
    const velocity = clampMidiValue(message.velocity)
    const behaviorChannel = clampApcLedBehaviorChannel(message.channel)

    if (velocity <= 0) {
      const nextPadStates = { ...midiFeedbackState.padStates }
      delete nextPadStates[note]
      midiFeedbackState = { ...midiFeedbackState, padStates: nextPadStates }
      saveMidiFeedbackState()
      return cloneMidiFeedbackState()
    }

    midiFeedbackState = {
      ...midiFeedbackState,
      padStates: {
        ...midiFeedbackState.padStates,
        [note]: { velocity, behaviorChannel },
      },
    }
    saveMidiFeedbackState()
    return cloneMidiFeedbackState()
  }

  if (kind === "noteoff") {
    const note = clampMidiValue(message.note)
    const nextPadStates = { ...midiFeedbackState.padStates }
    delete nextPadStates[note]
    midiFeedbackState = { ...midiFeedbackState, padStates: nextPadStates }
    saveMidiFeedbackState()
    return cloneMidiFeedbackState()
  }

  const controller = clampMidiValue(message.controller)
  const value = clampMidiValue(message.value)
  midiFeedbackState = {
    ...midiFeedbackState,
    ccValues: { ...midiFeedbackState.ccValues, [controller]: value },
  }
  saveMidiFeedbackState()
  return cloneMidiFeedbackState()
}

function broadcastMidiFeedbackState() {
  broadcastToAll({ event: "midi-feedback-state", state: cloneMidiFeedbackState() })
}

function queueMidiFeedbackStateBroadcast() {
  if (midiFeedbackBroadcastTimer) {
    clearTimeout(midiFeedbackBroadcastTimer)
  }

  // Sunlite often emits several LED feedback messages in a very short burst.
  // Broadcasting once after the burst prevents intermediate states from
  // visually overriding each other in the renderer.
  midiFeedbackBroadcastTimer = setTimeout(() => {
    midiFeedbackBroadcastTimer = null
    broadcastMidiFeedbackState()
  }, 35)
}


function getControllerConfigPath(): string {
  return path.join(electronApp.getPath("userData"), "controller-config.json")
}

function loadControllerCustomization(): ControllerCustomization {
  const configPath = getControllerConfigPath()

  try {
    if (!fs.existsSync(configPath)) {
      controllerCustomization = DEFAULT_CONTROLLER_CUSTOMIZATION
      return controllerCustomization
    }

    const raw = fs.readFileSync(configPath, "utf8")
    controllerCustomization = mergeControllerCustomization(JSON.parse(raw))
    return controllerCustomization
  } catch {
    controllerCustomization = DEFAULT_CONTROLLER_CUSTOMIZATION
    return controllerCustomization
  }
}

function saveControllerCustomization(nextCustomization: ControllerCustomization): ControllerCustomization {
  controllerCustomization = mergeControllerCustomization(nextCustomization)
  const configPath = getControllerConfigPath()
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(controllerCustomization, null, 2), "utf8")
  return controllerCustomization
}

function clampMidiValue(value: unknown): number {
  const numericValue = Number(value)

  if (Number.isNaN(numericValue)) {
    return 0
  }

  return Math.max(0, Math.min(127, Math.round(numericValue)))
}

function isLikelyVirtualInterface(interfaceName: string): boolean {
  const name = interfaceName.toLowerCase()
  const virtualMarkers = [
    "vethernet",
    "virtual",
    "vmware",
    "virtualbox",
    "docker",
    "wsl",
    "hyper-v",
    "tailscale",
    "zerotier",
    "vpn",
    "tap",
    "wintun",
    "hamachi",
    "anyconnect",
    "nord",
    "loopback",
    "bluetooth",
    "npcap",
  ]

  return virtualMarkers.some((marker) => name.includes(marker))
}

function isPreferredLanInterface(interfaceName: string): boolean {
  const name = interfaceName.toLowerCase()
  return name.includes("wi-fi") || name.includes("wifi") || name.includes("wireless") || name.includes("wlan") || name.includes("ethernet")
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number)

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false
  }

  const [first, second] = parts

  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168)
}

function isLinkLocalIpv4(address: string): boolean {
  return address.startsWith("169.254.")
}

function getNetworkUrlCandidates(port: number): NetworkUrlCandidate[] {
  const interfaces = os.networkInterfaces()
  const candidates: NetworkUrlCandidate[] = []

  for (const [interfaceName, addresses] of Object.entries(interfaces)) {
    if (!addresses) continue

    for (const address of addresses) {
      if (address.family !== "IPv4" || address.internal) continue

      const isVirtual = isLikelyVirtualInterface(interfaceName)
      const isPreferredInterface = isPreferredLanInterface(interfaceName)
      const isPrivate = isPrivateIpv4(address.address)
      const isLinkLocal = isLinkLocalIpv4(address.address)

      let priority = 0
      if (isPreferredInterface) priority += 100
      if (isPrivate) priority += 40
      if (isVirtual) priority -= 200
      if (isLinkLocal) priority -= 120

      candidates.push({
        interfaceName,
        address: address.address,
        url: `http://${address.address}:${port}`,
        priority,
        note: isVirtual
          ? "virtual adapter"
          : isPreferredInterface
            ? "preferred LAN adapter"
            : isPrivate
              ? "private LAN adapter"
              : "network adapter",
      })
    }
  }

  return candidates.sort((a, b) => b.priority - a.priority || a.interfaceName.localeCompare(b.interfaceName))
}

function getAvailableMidiOutputs(): string[] {
  try {
    return easymidi.getOutputs()
  } catch {
    return []
  }
}

function getAvailableMidiInputs(): string[] {
  try {
    return easymidi.getInputs()
  } catch {
    return []
  }
}

function findMidiName(names: string[], targetName: string): string | null {
  const exactMatch = names.find((name) => name === targetName)
  if (exactMatch) return exactMatch

  const partialMatch = names.find((name) => name.toLowerCase().includes(targetName.toLowerCase()))

  return partialMatch ?? null
}

function findMidiOutputName(targetName: string): string | null {
  return findMidiName(getAvailableMidiOutputs(), targetName)
}

function findMidiInputName(targetName: string): string | null {
  return findMidiName(getAvailableMidiInputs(), targetName)
}

function createMidiSender(output: easymidi.Output) {
  function sendNoteOn(note: number, velocity = 127) {
    sendMidi(output, "noteon", {
      note: clampMidiValue(note),
      velocity: clampMidiValue(velocity),
      channel: MIDI_CHANNEL_ZERO_BASED,
    })
  }

  function sendNoteOff(note: number, velocity = 0) {
    sendMidi(output, "noteoff", {
      note: clampMidiValue(note),
      velocity: clampMidiValue(velocity),
      channel: MIDI_CHANNEL_ZERO_BASED,
    })
  }

  function sendNote(note: number, velocity = 127, offDelayMs = 500) {
    sendNoteOn(note, velocity)

    setTimeout(() => {
      sendNoteOff(note, 0)
    }, Math.max(0, Number(offDelayMs) || 500))
  }

  function sendControlChange(controller: number, value: number) {
    sendMidi(output, "cc", {
      controller: clampMidiValue(controller),
      value: clampMidiValue(value),
      channel: MIDI_CHANNEL_ZERO_BASED,
    })
  }

  function sendProgramChange(number: number) {
    sendMidi(output, "program", {
      number: clampMidiValue(number),
      channel: MIDI_CHANNEL_ZERO_BASED,
    })
  }

  return { sendNote, sendNoteOn, sendNoteOff, sendControlChange, sendProgramChange }
}

function closeMidiConnection() {
  try {
    midiConnection?.input?.close()
  } catch {
    // Ignore close failures from native MIDI backends.
  }

  try {
    midiConnection?.output.close()
  } catch {
    // Ignore close failures from native MIDI backends.
  }

  midiConnection = null
}


function getMidiMessageFingerprint(kind: string, message: Record<string, unknown>): string {
  const channel = String(message.channel ?? "")
  const note = String(message.note ?? "")
  const velocity = String(message.velocity ?? "")
  const controller = String(message.controller ?? "")
  const value = String(message.value ?? "")

  return `${kind}:${channel}:${note}:${velocity}:${controller}:${value}`
}

function resetMidiLoopGuard() {
  midiGuardEvents = []
}

function updateFeedbackStatus(reason: string | null) {
  feedbackDisabledReason = reason

  if (serverStatus) {
    serverStatus = {
      ...serverStatus,
      feedbackReady: Boolean(midiConnection?.input) && !reason,
      feedbackDisabledReason: reason,
      midiInputName: reason ? null : (midiConnection?.inputName ?? null),
    }
  }
}

function disableMidiFeedback(reason: string) {
  try {
    midiConnection?.input?.close()
  } catch {
    // Ignore close failures from native MIDI backends.
  }

  if (midiConnection) {
    midiConnection.input = null
    midiConnection.inputName = null
  }

  updateFeedbackStatus(reason)
  broadcastToAll({ event: "feedback-disabled", message: reason })
}

function shouldAcceptMidiFeedback(kind: string, message: Record<string, unknown>): boolean {
  if (feedbackDisabledReason) return false

  const now = Date.now()
  const fingerprint = getMidiMessageFingerprint(kind, message)
  midiGuardEvents = midiGuardEvents.filter((event) => now - event.at <= MIDI_LOOP_GUARD_WINDOW_MS)
  midiGuardEvents.push({ at: now, fingerprint })

  const repeatedCount = midiGuardEvents.filter((event) => event.fingerprint === fingerprint).length
  const totalCount = midiGuardEvents.length

  if (repeatedCount >= MIDI_LOOP_GUARD_MAX_REPEATED_MESSAGES || totalCount >= MIDI_LOOP_GUARD_MAX_TOTAL_MESSAGES) {
    disableMidiFeedback(
      `MIDI feedback was disabled because the app detected a possible MIDI loop. Check Sunlite routing: MIDI input must use "${MIDI_OUTPUT_NAME}" and MIDI OUT must use "${MIDI_INPUT_NAME}". Do not select both ports in both tabs. Fix the routing, then refresh MIDI ports.`,
    )
    return false
  }

  return true
}

function refreshMidiConnection() {
  const outputName = findMidiOutputName(MIDI_OUTPUT_NAME)
  const inputNameCandidate = findMidiInputName(MIDI_INPUT_NAME)
  const availableMidiOutputs = getAvailableMidiOutputs()
  const availableMidiInputs = getAvailableMidiInputs()

  closeMidiConnection()
  resetMidiLoopGuard()
  updateFeedbackStatus(null)

  if (outputName) {
    const output = new easymidi.Output(outputName)
    let inputName = inputNameCandidate && inputNameCandidate !== outputName ? inputNameCandidate : null

    if (inputNameCandidate && inputNameCandidate === outputName) {
      updateFeedbackStatus(
        `MIDI feedback is disabled because input and output resolve to the same port: "${outputName}". Use separate ports: "${MIDI_OUTPUT_NAME}" for App → Sunlite and "${MIDI_INPUT_NAME}" for Sunlite → App.`,
      )
      inputName = null
    }

    const input = inputName ? new easymidi.Input(inputName) : null

    if (input) {
      input.on("noteon", (message) => {
        const record = midiMessageToRecord(message)
        if (!shouldAcceptMidiFeedback("noteon", record)) return
        updateMidiFeedbackState("noteon", record)
        broadcastToAll({ event: "midi-input", message: { kind: "noteon", ...message } })
        queueMidiFeedbackStateBroadcast()
      })

      input.on("noteoff", (message) => {
        const record = midiMessageToRecord(message)
        if (!shouldAcceptMidiFeedback("noteoff", record)) return
        updateMidiFeedbackState("noteoff", record)
        broadcastToAll({ event: "midi-input", message: { kind: "noteoff", ...message } })
        queueMidiFeedbackStateBroadcast()
      })

      input.on("cc", (message) => {
        const record = midiMessageToRecord(message)
        if (!shouldAcceptMidiFeedback("cc", record)) return
        updateMidiFeedbackState("cc", record)
        broadcastToAll({ event: "midi-input", message: { kind: "cc", ...message } })
        queueMidiFeedbackStateBroadcast()
      })
    }

    midiConnection = {
      outputName,
      output,
      inputName,
      input,
      midi: createMidiSender(output),
    }
  }

  if (serverStatus) {
    const loopMidiExecutablePath = findLoopMidiExecutable()

    serverStatus = {
      ...serverStatus,
      availableMidiOutputs,
      availableMidiInputs,
      midiOutputName: midiConnection?.outputName ?? null,
      midiInputName: midiConnection?.inputName ?? null,
      midiReady: Boolean(midiConnection),
      feedbackReady: Boolean(midiConnection?.input) && !feedbackDisabledReason,
      feedbackDisabledReason,
      loopMidiExecutablePath,
      loopMidiInstalled: Boolean(loopMidiExecutablePath),
    }
  }

  return serverStatus
}

function safeSend(socket: WebSocket, payload: unknown) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

let activeWebSocketServer: WebSocketServer | null = null

function broadcast(wss: WebSocketServer, payload: unknown) {
  for (const client of wss.clients) {
    safeSend(client, payload)
  }
}

function broadcastToAll(payload: unknown) {
  if (activeWebSocketServer) {
    broadcast(activeWebSocketServer, payload)
  }
}

function getLoopMidiInstallerPath(): string {
  const devPath = path.resolve(__dirname, "../../resources/installers/loopMIDISetup.exe")
  const packagedPath = path.join(process.resourcesPath, "installers", "loopMIDISetup.exe")

  return electronApp.isPackaged ? packagedPath : devPath
}

function findLoopMidiExecutable(): string | null {
  const candidates = [
    path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Tobias Erichsen", "loopMIDI", "loopMIDI.exe"),
    path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Tobias Erichsen", "loopMIDI", "loopMIDI.exe"),
    path.join(process.env.LOCALAPPDATA ?? "", "Programs", "loopMIDI", "loopMIDI.exe"),
  ]

  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) ?? null
}

function runProcess(command: string, args: string[]) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: false,
      shell: false,
    })

    let stdout = ""
    let stderr = ""

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk)
    })

    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk)
    })

    const childEvents = child as unknown as ProcessEventEmitter

    childEvents.on("error", reject)
    childEvents.on("close", (code: number | null) => {
      resolve({ code, stdout, stderr })
    })
  })
}

async function installLoopMidi() {
  const existingExecutablePath = findLoopMidiExecutable()

  if (existingExecutablePath) {
    refreshMidiConnection()
    return {
      code: 0,
      stdout: existingExecutablePath,
      stderr: "",
      skipped: true,
    }
  }

  const installerPath = getLoopMidiInstallerPath()

  if (!fs.existsSync(installerPath)) {
    throw new Error(`loopMIDI installer was not found at: ${installerPath}`)
  }

  // loopMIDISetup.exe is a WiX bootstrapper. /quiet /norestart is the standard silent install path.
  // Windows may still show an elevation prompt because loopMIDI installs a system MIDI driver.
  const result = await runProcess(installerPath, ["/quiet", "/norestart"])

  refreshMidiConnection()

  return result
}

async function openLoopMidi() {
  const executablePath = findLoopMidiExecutable()

  if (executablePath) {
    spawn(executablePath, [], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    }).unref()

    return executablePath
  }

  const installerPath = getLoopMidiInstallerPath()

  if (fs.existsSync(installerPath)) {
    await shell.openPath(installerPath)
    return installerPath
  }

  throw new Error("loopMIDI is not installed and the bundled installer is missing.")
}

function handleCommand(payload: IncomingCommand) {
  if (!midiConnection) {
    throw new Error(`MIDI output "${MIDI_OUTPUT_NAME}" is not available. Install/open loopMIDI and create the port first.`)
  }

  if (payload.type === "note") {
    const note = clampMidiValue(payload.note)
    const velocity = clampMidiValue(payload.velocity ?? 127)
    const offDelayMs = Math.max(0, Number(payload.offDelayMs ?? 500) || 500)
    midiConnection.midi.sendNote(note, velocity, offDelayMs)

    return { ok: true, type: "note", note, velocity, offDelayMs }
  }

  if (payload.type === "noteon") {
    const note = clampMidiValue(payload.note)
    const velocity = clampMidiValue(payload.velocity ?? 127)
    midiConnection.midi.sendNoteOn(note, velocity)

    return { ok: true, type: "noteon", note, velocity }
  }

  if (payload.type === "noteoff") {
    const note = clampMidiValue(payload.note)
    const velocity = clampMidiValue(payload.velocity ?? 0)
    midiConnection.midi.sendNoteOff(note, velocity)

    return { ok: true, type: "noteoff", note, velocity }
  }

  if (payload.type === "cc") {
    const controller = clampMidiValue(payload.controller)
    const value = clampMidiValue(payload.value)
    midiConnection.midi.sendControlChange(controller, value)

    return { ok: true, type: "cc", controller, value }
  }

  if (payload.type === "program") {
    const number = clampMidiValue(payload.number)
    midiConnection.midi.sendProgramChange(number)

    return { ok: true, type: "program", number }
  }

  throw new Error("Unsupported MIDI command.")
}

async function startControllerServer(): Promise<ServerStatus> {
  loadControllerCustomization()
  loadMidiFeedbackState()
  const appServer = express()
  const httpServer = http.createServer(appServer)
  const wss = new WebSocketServer({ server: httpServer })

  appServer.use(express.json())
  appServer.use(express.static(rendererDir))

  appServer.get("/api/status", (_request, response) => {
    refreshMidiConnection()
    response.json(serverStatus)
  })

  appServer.post("/api/midi/refresh", (_request, response) => {
    response.json(refreshMidiConnection())
  })

  appServer.post("/api/loopmidi/install", async (_request, response) => {
    try {
      const result = await installLoopMidi()
      response.json({ ok: result.code === 0, ...result, status: refreshMidiConnection() })
    } catch (error) {
      response.status(500).json({ ok: false, message: error instanceof Error ? error.message : "Unknown install error" })
    }
  })

  appServer.post("/api/loopmidi/open", async (_request, response) => {
    try {
      const openedPath = await openLoopMidi()
      response.json({ ok: true, openedPath, status: refreshMidiConnection() })
    } catch (error) {
      response.status(500).json({ ok: false, message: error instanceof Error ? error.message : "Unknown open error" })
    }
  })

  appServer.get("/api/controller-config", (_request, response) => {
    response.json(loadControllerCustomization())
  })

  appServer.put("/api/controller-config", (request, response) => {
    try {
      const nextCustomization = saveControllerCustomization(request.body)
      broadcastToAll({ event: "controller-config", config: nextCustomization })
      response.json(nextCustomization)
    } catch (error) {
      response.status(500).json({ ok: false, message: error instanceof Error ? error.message : "Unknown controller config error" })
    }
  })

  appServer.get("/api/midi-feedback/state", (_request, response) => {
    response.json({ ok: true, state: cloneMidiFeedbackState() })
  })

  appServer.post("/api/midi-feedback/clear", (_request, response) => {
    midiFeedbackState = { padStates: {}, ccValues: {} }
    saveMidiFeedbackState()
    broadcastMidiFeedbackState()
    response.json({ ok: true, state: cloneMidiFeedbackState() })
  })

  appServer.get("*", (_request, response) => {
    response.sendFile(path.join(rendererDir, "index.html"))
  })

  activeWebSocketServer = wss

  wss.on("connection", (socket) => {
    refreshMidiConnection()
    safeSend(socket, { event: "controller-config", config: controllerCustomization })
    safeSend(socket, { event: "midi-feedback-state", state: cloneMidiFeedbackState() })
    setTimeout(() => safeSend(socket, { event: "midi-feedback-state", state: cloneMidiFeedbackState() }), 350)
    setTimeout(() => safeSend(socket, { event: "midi-feedback-state", state: cloneMidiFeedbackState() }), 1200)

    if (midiConnection) {
      safeSend(socket, {
        type: "server-ready",
        midiOutputName: midiConnection.outputName,
        midiInputName: midiConnection.inputName,
        feedbackReady: Boolean(midiConnection.input) && !feedbackDisabledReason,
        feedbackDisabledReason,
        midiChannel: MIDI_CHANNEL_ZERO_BASED + 1,
      })
    } else {
      safeSend(socket, {
        type: "setup-required",
        expectedMidiOutputName: MIDI_OUTPUT_NAME,
        expectedMidiInputName: MIDI_INPUT_NAME,
        availableMidiOutputs: getAvailableMidiOutputs(),
        feedbackDisabledReason,
      })
    }

    socket.on("message", (rawMessage) => {
      try {
        const payload = JSON.parse(rawMessage.toString()) as IncomingCommand
        const result = handleCommand(payload)

        safeSend(socket, { event: "command-result", command: result })
        broadcast(wss, { event: "last-command", command: result })
      } catch (error) {
        safeSend(socket, {
          type: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        })
      }
    })
  })

  const port = await new Promise<number>((resolve, reject) => {
    httpServer.once("error", reject)
    httpServer.listen(DEFAULT_PORT, "0.0.0.0", () => {
      const address = httpServer.address()
      if (typeof address === "object" && address?.port) {
        resolve(address.port)
      } else {
        resolve(DEFAULT_PORT)
      }
    })
  })

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
    feedbackDisabledReason,
    midiChannel: MIDI_CHANNEL_ZERO_BASED + 1,
    availableMidiOutputs: getAvailableMidiOutputs(),
    availableMidiInputs: getAvailableMidiInputs(),
    midiInputName: null,
    loopMidiInstallerAvailable: fs.existsSync(loopMidiInstallerPath),
    loopMidiExecutablePath,
    loopMidiInstalled: Boolean(loopMidiExecutablePath),
  }

  refreshMidiConnection()

  return serverStatus
}

async function createWindow(status: ServerStatus) {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 860,
    minWidth: 420,
    minHeight: 680,
    title: "Sunlite Mobile MIDI",
    icon: getWindowIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: "deny" }
  })

  await mainWindow.loadURL(status.localUrl)
}

electronApp.whenReady().then(async () => {
  try {
    const status = await startControllerServer()
    await createWindow(status)
    configureAutoUpdates()
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

electronApp.on("window-all-closed", () => {
  closeMidiConnection()

  if (process.platform !== "darwin") {
    electronApp.quit()
  }
})
