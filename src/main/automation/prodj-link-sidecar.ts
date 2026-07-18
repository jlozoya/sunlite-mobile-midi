import dgram, { type RemoteInfo, type SocketOptions, type SocketType } from "node:dgram"
import {
  bringOnline as bringProlinkOnline,
  type CDJStatus,
  type ProlinkNetwork,
  type Track,
  type WaveformHD,
} from "prolink-connect"
import type {
  DjLinkBridgeStatus,
  DjLinkEvent,
  DjLinkWaveform,
} from "../../shared/automation-types.js"
import { compactWaveform, waveformFeatures } from "./waveform-analysis.js"

type SidecarOptions = {
  isPackaged: boolean
  resourcesPath: string
  projectRoot: string
  onEvent: (event: DjLinkEvent) => void
  onStatus: (status: DjLinkBridgeStatus) => void
}

type LoadedWaveform = {
  key: string
  track: Track
  segments: WaveformHD
  preview: Pick<DjLinkWaveform, "heights" | "colors">
}

type Playhead = {
  key: string
  beat: number | null
  basePositionMs: number
  observedAt: number
  pitchPercent: number
  playing: boolean
}

function playerIsPlaying(state: CDJStatus.State): boolean {
  return state.playState === 3 || state.playState === 4
}

async function bringOnline(): Promise<ProlinkNetwork> {
  const originalCreateSocket = dgram.createSocket
  const reusableCreateSocket = (
    options: SocketOptions | SocketType,
    callback?: (message: Buffer, remoteInfo: RemoteInfo) => void,
  ) => {
    const reusableOptions =
      typeof options === "string"
        ? { type: options, reuseAddr: true }
        : { ...options, reuseAddr: options.reuseAddr ?? true }
    return originalCreateSocket(reusableOptions, callback)
  }

  dgram.createSocket = reusableCreateSocket as typeof dgram.createSocket
  try {
    return await bringProlinkOnline()
  } finally {
    dgram.createSocket = originalCreateSocket
  }
}

async function disconnectNetwork(network: ProlinkNetwork): Promise<void> {
  try {
    if (!network.isConfigured) {
      network.configure({
        vcdjId: 5,
        iface: {
          address: "127.0.0.1",
          netmask: "255.0.0.0",
          family: "IPv4",
          mac: "00:00:00:00:00:00",
          internal: true,
          cidr: "127.0.0.1/8",
        },
      })
    }
    await network.disconnect()
  } catch {
    // Closing the application must never surface a library shutdown error.
  }
}

function bridgeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("EADDRINUSE") || message.includes("50000")) {
    return "Los puertos UDP 50000–50002 siguen ocupados por otro listener exclusivo de PRO DJ LINK."
  }
  return message || "Error de PRO DJ LINK"
}

export class ProDjLinkSidecar {
  private readonly options: SidecarOptions
  private network: ProlinkNetwork | null = null
  private shutdownPromise: Promise<unknown> = Promise.resolve()
  private restartTimer: NodeJS.Timeout | null = null
  private generation = 0
  private stopped = true
  private status: DjLinkBridgeStatus = {
    available: true,
    running: false,
    connected: false,
    message: "Preparando conexión PRO DJ LINK",
    executablePath: null,
    lastEventAt: null,
  }
  private readonly loadedWaveforms = new Map<number, LoadedWaveform>()
  private readonly requestedTrackKeys = new Map<number, string>()
  private readonly loadingTrackKeys = new Set<string>()
  private readonly retryAfter = new Map<string, number>()
  private readonly playheads = new Map<number, Playhead>()
  private readonly lastBeatKeys = new Map<number, string>()

  constructor(options: SidecarOptions) {
    this.options = options
  }

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    const generation = ++this.generation
    void this.launch(generation)
  }

  stop(): void {
    this.stopped = true
    this.generation += 1
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = null
    this.clearDeckState()

    const network = this.network
    this.network = null
    if (network) {
      this.shutdownPromise = disconnectNetwork(network)
    }

    this.updateStatus({
      running: false,
      connected: false,
      message: "Conexión PRO DJ LINK detenida",
    })
  }

  private async launch(generation: number): Promise<void> {
    await this.shutdownPromise
    if (this.stopped || generation !== this.generation) return

    this.updateStatus({
      available: true,
      running: false,
      connected: false,
      message: "Buscando CDJ en la red Ethernet",
    })

    let network: ProlinkNetwork | null = null
    try {
      network = await bringOnline()
      if (this.stopped || generation !== this.generation) {
        await disconnectNetwork(network)
        return
      }
      this.network = network
      this.updateStatus({
        running: true,
        message: "Esperando anuncios PRO DJ LINK de los CDJ",
      })

      network.deviceManager.on("connected", (device) => {
        this.options.onEvent({
          type: "device",
          device: {
            deviceNumber: device.id,
            name: device.name,
            address: device.ip.address,
            lastSeenAt: Date.now(),
          },
        })
        this.updateStatus({
          connected: true,
          lastEventAt: Date.now(),
          message: "CDJ detectado; solicitando estado y waveforms",
        })
      })

      network.deviceManager.on("announced", (device) => {
        this.options.onEvent({
          type: "device",
          device: {
            deviceNumber: device.id,
            name: device.name,
            address: device.ip.address,
            lastSeenAt: Date.now(),
          },
        })
      })

      await network.autoconfigFromPeers()
      if (this.stopped || generation !== this.generation) {
        await disconnectNetwork(network)
        return
      }

      network.connect()
      if (!network.isConnected() || !network.statusEmitter) {
        throw new Error("No se pudo activar el dispositivo virtual PRO DJ LINK")
      }

      network.statusEmitter.on("status", (state) => this.handlePlayerStatus(state))
      this.updateStatus({
        running: true,
        connected: true,
        lastEventAt: Date.now(),
        message: "PRO DJ LINK activo; escuchando estado y waveforms",
      })
    } catch (error) {
      if (network && network === this.network) this.network = null
      if (network) await disconnectNetwork(network)
      if (this.stopped || generation !== this.generation) return

      const message = bridgeErrorMessage(error)
      this.options.onEvent({ type: "warning", message })
      this.updateStatus({ running: false, connected: false, message })
      this.restartTimer = setTimeout(() => {
        if (this.stopped || generation !== this.generation) return
        this.stopped = true
        this.start()
      }, 4000)
    }
  }

  private handlePlayerStatus(state: CDJStatus.State): void {
    const now = Date.now()
    const network = this.network
    if (!network?.isConnected()) return

    const player = network.deviceManager.devices.get(state.deviceId)
    const address = player?.ip.address ?? ""
    const name = player?.name ?? `CDJ ${state.deviceId}`
    this.updateStatus({ running: true, connected: true, lastEventAt: now })

    if (!state.trackId) {
      if (this.loadedWaveforms.delete(state.deviceId)) {
        this.options.onEvent({
          type: "waveform-unloaded",
          deviceNumber: state.deviceId,
        })
      }
      this.requestedTrackKeys.delete(state.deviceId)
      this.playheads.delete(state.deviceId)
      return
    }

    const beatKey = `${state.trackId}:${state.beat ?? "none"}`
    if (
      state.beatInMeasure > 0 &&
      state.trackBPM &&
      this.lastBeatKeys.get(state.deviceId) !== beatKey
    ) {
      this.lastBeatKeys.set(state.deviceId, beatKey)
      this.options.onEvent({
        type: "beat",
        beat: {
          deviceNumber: state.deviceId,
          name,
          address,
          bpm: state.trackBPM * (1 + state.sliderPitch / 100),
          beatWithinBar: state.beatInMeasure,
          pitchPercent: state.sliderPitch,
          receivedAt: now,
        },
      })
    }

    const trackKey = this.trackKey(state)
    const loaded = this.loadedWaveforms.get(state.deviceId)
    if (!loaded || loaded.key !== trackKey) {
      this.requestedTrackKeys.set(state.deviceId, trackKey)
      void this.loadWaveform(state, trackKey)
      return
    }

    const positionMs = this.calculatePosition(state, loaded, now)
    const playing = playerIsPlaying(state)
    this.options.onEvent({
      type: "position",
      position: {
        deviceNumber: state.deviceId,
        name,
        address,
        bpm: state.trackBPM
          ? state.trackBPM * (1 + state.sliderPitch / 100)
          : loaded.track.tempo,
        positionMs,
        trackLengthSeconds: loaded.track.duration,
        pitchPercent: state.sliderPitch,
        receivedAt: now,
      },
    })
    this.options.onEvent({
      type: "waveform-position",
      position: {
        deviceNumber: state.deviceId,
        positionMs,
        pitchPercent: state.effectivePitch,
        isPlaying: playing,
        isOnAir: state.isOnAir,
        isMaster: state.isMaster,
        features: waveformFeatures(loaded.segments, positionMs),
        receivedAt: now,
      },
    })
  }

  private async loadWaveform(state: CDJStatus.State, key: string): Promise<void> {
    const network = this.network
    if (!network?.isConnected() || this.loadingTrackKeys.has(key)) return
    if ((this.retryAfter.get(key) ?? 0) > Date.now()) return
    this.loadingTrackKeys.add(key)

    try {
      const query = {
        deviceId: state.trackDeviceId,
        trackSlot: state.trackSlot,
        trackType: state.trackType,
        trackId: state.trackId,
      }
      const track = await network.db.getMetadata(query)
      if (!track) throw new Error("El CDJ no entregó los metadatos del track")

      const waveformHd = track.waveformHd?.length
        ? track.waveformHd
        : (
            await network.db.getWaveforms({
              deviceId: state.trackDeviceId,
              trackSlot: state.trackSlot,
              trackType: state.trackType,
              track,
            })
          )?.waveformHd

      if (!waveformHd?.length) {
        throw new Error("El track no contiene waveform HD analizado por rekordbox")
      }
      if (this.requestedTrackKeys.get(state.deviceId) !== key) return

      const preview = compactWaveform(waveformHd)
      const loaded: LoadedWaveform = { key, track, segments: waveformHd, preview }
      this.loadedWaveforms.set(state.deviceId, loaded)
      const now = Date.now()
      const positionMs = this.calculatePosition(state, loaded, now)
      this.options.onEvent({
        type: "waveform",
        waveform: {
          deviceNumber: state.deviceId,
          trackId: state.trackId,
          title: track.title || `Track ${state.trackId}`,
          durationSeconds: track.duration,
          ...preview,
          positionMs,
          pitchPercent: state.effectivePitch,
          isPlaying: playerIsPlaying(state),
          isOnAir: state.isOnAir,
          isMaster: state.isMaster,
          updatedAt: now,
        },
      })
      this.updateStatus({
        message: `Waveform recibido de ${track.title || `Deck ${state.deviceId}`}`,
        lastEventAt: now,
      })
    } catch (error) {
      this.retryAfter.set(key, Date.now() + 8000)
      const message =
        error instanceof Error ? error.message : "No se pudo recuperar el waveform"
      this.options.onEvent({ type: "warning", message })
      this.updateStatus({ message })
    } finally {
      this.loadingTrackKeys.delete(key)
    }
  }

  private calculatePosition(
    state: CDJStatus.State,
    loaded: LoadedWaveform,
    now: number,
  ): number {
    const playing = playerIsPlaying(state)
    const pitchPercent = state.effectivePitch
    const previous = this.playheads.get(state.deviceId)
    const beat = state.beat
    const beatOffset =
      beat && beat > 0 ? loaded.track.beatGrid?.[beat - 1]?.offset : undefined

    let next: Playhead
    if (!previous || previous.key !== loaded.key || previous.beat !== beat) {
      next = {
        key: loaded.key,
        beat,
        basePositionMs: beatOffset ?? previous?.basePositionMs ?? 0,
        observedAt: now,
        pitchPercent,
        playing,
      }
    } else {
      next = previous
      if (previous.playing !== playing || previous.pitchPercent !== pitchPercent) {
        next = {
          ...previous,
          basePositionMs: this.projectPlayhead(previous, now),
          observedAt: now,
          pitchPercent,
          playing,
        }
      }
    }

    this.playheads.set(state.deviceId, next)
    return Math.max(
      0,
      Math.min(loaded.track.duration * 1000, this.projectPlayhead(next, now)),
    )
  }

  private projectPlayhead(playhead: Playhead, now: number): number {
    if (!playhead.playing) return playhead.basePositionMs
    return (
      playhead.basePositionMs +
      (now - playhead.observedAt) * (1 + playhead.pitchPercent / 100)
    )
  }

  private trackKey(state: CDJStatus.State): string {
    return [state.trackDeviceId, state.trackSlot, state.trackType, state.trackId].join(
      ":",
    )
  }

  private clearDeckState(): void {
    for (const deviceNumber of this.loadedWaveforms.keys()) {
      this.options.onEvent({ type: "waveform-unloaded", deviceNumber })
    }
    this.loadedWaveforms.clear()
    this.requestedTrackKeys.clear()
    this.loadingTrackKeys.clear()
    this.retryAfter.clear()
    this.playheads.clear()
    this.lastBeatKeys.clear()
  }

  private updateStatus(patch: Partial<DjLinkBridgeStatus>): void {
    this.status = { ...this.status, ...patch }
    this.options.onStatus({ ...this.status })
  }
}
