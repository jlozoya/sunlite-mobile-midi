import { desktopCapturer, nativeImage, type NativeImage } from "electron"
import type { ChildProcess } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { startRekordboxNativeCapture } from "./rekordbox-native-capture.js"
import {
  normalizeCaptureRegions,
  REKORDBOX_EXPORT_REGIONS,
  type RekordboxCaptureRegions,
  type RekordboxDeckNumber,
} from "../../shared/rekordbox-capture.js"

const CAPTURE_SIZE = { width: 1600, height: 900 }
const WINDOW_NAME = /^rekordbox(?:\s|$|[-–—])/i
export class RekordboxWindowCapture {
  private readonly regionsPath: string
  private regions: RekordboxCaptureRegions
  private capturedAt = 0
  private streamedAt = 0
  private lastImage: NativeImage | null = null
  private pendingCapture: Promise<NativeImage | null> | null = null
  private nativeProcess: ChildProcess | null = null
  private nativeStart: Promise<void> | null = null
  private nativeStartedAt = 0
  private disposed = false

  constructor(
    userDataPath: string,
    private readonly onNativeFrame?: (bytes: Uint8Array) => void,
  ) {
    this.regionsPath = path.join(userDataPath, "rekordbox-waveform-regions.json")
    try {
      this.regions = normalizeCaptureRegions(
        JSON.parse(fs.readFileSync(this.regionsPath, "utf8")),
      )
    } catch {
      this.regions = { ...REKORDBOX_EXPORT_REGIONS }
    }
  }

  getRegions(): RekordboxCaptureRegions {
    return { ...this.regions }
  }

  saveRegions(value: unknown): RekordboxCaptureRegions {
    this.regions = normalizeCaptureRegions(value)
    fs.writeFileSync(this.regionsPath, JSON.stringify(this.regions, null, 2), "utf8")
    return this.getRegions()
  }

  async getSourceId(): Promise<string | null> {
    const sources = await desktopCapturer.getSources({
      types: ["window"],
      thumbnailSize: { width: 1, height: 1 },
    })
    return sources.find((source) => WINDOW_NAME.test(source.name))?.id ?? null
  }

  pushFrame(bytes: Uint8Array): void {
    if (bytes.byteLength < 100 || bytes.byteLength > 2_000_000) return
    const image = nativeImage.createFromBuffer(Buffer.from(bytes))
    const { width, height } = image.getSize()
    if (image.isEmpty() || width < 320 || height < 180 || width > 4096 || height > 2160)
      return
    this.lastImage = image
    this.streamedAt = Date.now()
    this.capturedAt = this.streamedAt
  }

  async capture(): Promise<NativeImage | null> {
    if (process.platform === "win32") void this.ensureNativeCapture()
    if (Date.now() - this.streamedAt < 1000) return this.lastImage
    if (this.pendingCapture) return this.pendingCapture
    if (Date.now() - this.capturedAt < 80) return this.lastImage

    const captureStartedAt = Date.now()
    this.pendingCapture = desktopCapturer
      .getSources({ types: ["window"], thumbnailSize: CAPTURE_SIZE })
      .then((sources) => {
        if (this.streamedAt > captureStartedAt) return this.lastImage
        const image = sources.find((source) => WINDOW_NAME.test(source.name))?.thumbnail
        this.lastImage = image && !image.isEmpty() ? image : null
        this.capturedAt = Date.now()
        return this.lastImage
      })
      .finally(() => {
        this.pendingCapture = null
      })
    return this.pendingCapture
  }

  private async ensureNativeCapture(): Promise<void> {
    if (this.disposed || this.nativeStart) return
    if (this.nativeProcess) {
      if (
        Date.now() - this.nativeStartedAt > 10_000 &&
        Date.now() - this.streamedAt > 10_000
      )
        this.nativeProcess.kill()
      return
    }
    if (Date.now() - this.nativeStartedAt < 3000) return
    this.nativeStartedAt = Date.now()
    this.nativeStart = this.getSourceId()
      .then((sourceId) => {
        if (this.disposed || !sourceId) return
        const handle = /^window:(\d+):/.exec(sourceId)?.[1]
        if (!handle) return
        const process = startRekordboxNativeCapture(
          handle,
          (bytes) => {
            if (this.disposed) return
            this.pushFrame(bytes)
            this.onNativeFrame?.(bytes)
          },
          () => {
            this.nativeProcess = null
          },
        )
        this.nativeProcess = process
      })
      .catch(() => {})
      .finally(() => {
        this.nativeStart = null
      })
    await this.nativeStart
  }

  dispose(): void {
    this.disposed = true
    this.nativeProcess?.kill()
    this.nativeProcess = null
  }

  async captureDeck(deck: RekordboxDeckNumber): Promise<NativeImage | null> {
    const region = this.regions[deck]
    if (!region) return null
    const image = await this.capture()
    if (!image) return null
    const { width, height } = image.getSize()
    const x = Math.floor(region.x * width)
    const y = Math.floor(region.y * height)
    return image.crop({
      x,
      y,
      width: Math.max(1, Math.min(width - x, Math.ceil(region.width * width))),
      height: Math.max(1, Math.min(height - y, Math.ceil(region.height * height))),
    })
  }
}
