import * as stylex from "@stylexjs/stylex"
import { useEffect, useRef, useState } from "react"
import {
  type RekordboxCaptureRegion,
  type RekordboxDeckNumber,
} from "../../../shared/rekordbox-capture"
import { getRekordboxFrame } from "./useRekordboxVideoCapture"
import { styles } from "./RekordboxWaveforms.styles"

function LoadingIndicator({ label }: { label: string }) {
  return (
    <div role="status" {...stylex.props(styles.loadingIndicator)}>
      <span aria-hidden="true" {...stylex.props(styles.loadingSpinner)} />
      <span>{label}</span>
    </div>
  )
}

function LiveDeckCanvas({
  deck,
  region,
  enabled,
}: {
  deck: RekordboxDeckNumber
  region: RekordboxCaptureRegion
  enabled: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const readyRef = useRef(false)
  useEffect(() => {
    readyRef.current = false
    setReady(false)
    if (!enabled) {
      return
    }
    let active = true
    let timer = 0
    let animationFrame = 0
    let controller: AbortController | null = null
    let sequence = 0
    const desktop = Boolean(window.rekordboxCapture)
    const nativeCapture = Boolean(window.rekordboxCapture?.nativeCursorFree)
    let sourceKey = ""
    let stableSince = 0
    let distinctFrames = 0
    let previousImage: CanvasImageSource | null = null
    let lastDrawnImage: CanvasImageSource | null = null
    const markReady = (
      source: "local" | "remote",
      width: number,
      height: number,
      image: CanvasImageSource,
    ) => {
      const key = `${source}:${width}:${height}`
      if (key !== sourceKey) {
        sourceKey = key
        stableSince = performance.now()
        distinctFrames = 0
        previousImage = null
        readyRef.current = false
        setReady(false)
      }
      if (image !== previousImage || image instanceof HTMLVideoElement) {
        previousImage = image
        distinctFrames++
      }
      // A decoded frame alone does not mean capture has finished resizing.
      if (distinctFrames < 2 || performance.now() - stableSince < 300) return
      if (readyRef.current) return
      readyRef.current = true
      setReady(true)
    }

    // On this PC, draw from the captured video before JPEG encoding or HTTP delivery.
    const drawLocal = () => {
      const frame = getRekordboxFrame()
      const canvas = canvasRef.current
      if (frame && canvas && frame.width > 0 && frame.height > 0) {
        const x = Math.floor(region.x * frame.width)
        const y = Math.floor(region.y * frame.height)
        const width = Math.max(
          1,
          Math.min(frame.width - x, Math.ceil(region.width * frame.width)),
        )
        const height = Math.max(
          1,
          Math.min(frame.height - y, Math.ceil(region.height * frame.height)),
        )
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width
          canvas.height = height
        }
        const context = canvas.getContext("2d", { alpha: false })
        if (context) {
          if (frame.image !== lastDrawnImage || frame.image instanceof HTMLVideoElement) {
            context.drawImage(frame.image, x, y, width, height, 0, 0, width, height)
            lastDrawnImage = frame.image
          }
          markReady("local", frame.width, frame.height, frame.image)
        }
      }
      if (active) animationFrame = window.requestAnimationFrame(drawLocal)
    }
    if (desktop) drawLocal()

    // The server remains the fallback on this PC and the live source on phones.
    const drawRemote = async () => {
      // Windows thumbnails use different window bounds from the native stream.
      // Keep the loading indicator until that stream supplies the correct crop.
      if (desktop && (nativeCapture || getRekordboxFrame())) {
        if (active) timer = window.setTimeout(() => void drawRemote(), 350)
        return
      }
      controller = new AbortController()
      const startedAt = performance.now()
      let delay = desktop ? 350 : 1000 / 30
      try {
        const response = await fetch(
          `/api/automation/rekordbox/decks/${deck}/frame?at=${sequence++}`,
          { cache: "no-store", signal: controller.signal },
        )
        if (!response.ok) throw new Error("La imagen no está disponible")
        const bitmap = await createImageBitmap(await response.blob())
        if (active && canvasRef.current && (!desktop || !getRekordboxFrame())) {
          const canvas = canvasRef.current
          if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
            canvas.width = bitmap.width
            canvas.height = bitmap.height
          }
          const context = canvas.getContext("2d", { alpha: false })
          if (context) {
            context.drawImage(bitmap, 0, 0)
            markReady("remote", bitmap.width, bitmap.height, bitmap)
          }
        }
        bitmap.close()
      } catch {
        delay = 400
      }
      if (active)
        timer = window.setTimeout(
          () => void drawRemote(),
          Math.max(0, delay - (performance.now() - startedAt)),
        )
    }
    void drawRemote()
    return () => {
      active = false
      controller?.abort()
      window.clearTimeout(timer)
      window.cancelAnimationFrame(animationFrame)
    }
  }, [deck, enabled, region.x, region.y, region.width, region.height])
  return (
    <div
      aria-busy={!ready && enabled}
      {...stylex.props(styles.canvasShell, !ready && styles.canvasShellLoading)}
    >
      <canvas
        ref={canvasRef}
        width={1200}
        height={70}
        role="img"
        aria-label={`Waveform y posición del deck ${deck} en Rekordbox`}
        {...stylex.props(styles.deckImage, !ready && styles.deckImagePending)}
      />
      {!ready && enabled ? (
        <div {...stylex.props(styles.canvasLoading)}>
          <LoadingIndicator label={`Cargando waveform del deck ${deck}…`} />
        </div>
      ) : null}
    </div>
  )
}
export { LoadingIndicator, LiveDeckCanvas }
