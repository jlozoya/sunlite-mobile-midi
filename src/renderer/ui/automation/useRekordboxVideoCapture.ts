import { useEffect } from "react"

const FRAME_INTERVAL_MS = 80
const RETRY_INTERVAL_MS = 2000

let liveRekordboxVideo: HTMLVideoElement | null = null
let liveRekordboxImage: ImageBitmap | null = null

export function getRekordboxFrame(): {
  image: CanvasImageSource
  width: number
  height: number
} | null {
  if (liveRekordboxImage)
    return {
      image: liveRekordboxImage,
      width: liveRekordboxImage.width,
      height: liveRekordboxImage.height,
    }
  const video = liveRekordboxVideo
  if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
    return {
      image: video,
      width: video.videoWidth,
      height: video.videoHeight,
    }
  return null
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

export function useRekordboxVideoCapture(): void {
  useEffect(() => {
    const bridge = window.rekordboxCapture
    if (!bridge) return

    if (bridge.nativeCursorFree) {
      let active = true
      let decoding = false
      const unsubscribe = bridge.onFrame(async (bytes) => {
        if (!active || decoding) return
        decoding = true
        try {
          const image = await createImageBitmap(
            new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }),
          )
          if (active) {
            liveRekordboxImage?.close()
            liveRekordboxImage = image
          } else {
            image.close()
          }
        } catch {
          // A partial frame is skipped; the next complete frame will replace it.
        } finally {
          decoding = false
        }
      })
      return () => {
        active = false
        unsubscribe()
        liveRekordboxImage?.close()
        liveRekordboxImage = null
      }
    }

    let active = true
    let stream: MediaStream | null = null
    const video = document.createElement("video")
    video.muted = true
    video.playsInline = true
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d", { alpha: false })

    const run = async () => {
      while (active) {
        try {
          const sourceId = await bridge.sourceId()
          if (!active) break
          if (!sourceId || !context) {
            await wait(RETRY_INTERVAL_MS)
            continue
          }

          // Electron's desktop source captures the rekordbox window as a video stream.
          const videoConstraints = {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: sourceId,
              minWidth: 320,
              maxWidth: 1600,
              minHeight: 180,
              maxHeight: 900,
              maxFrameRate: 30,
            },
          } as unknown as MediaTrackConstraints
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: videoConstraints,
          })
          if (!active) break
          video.srcObject = stream
          await video.play()
          if (!active) break
          liveRekordboxVideo = video

          while (active && stream.getVideoTracks()[0]?.readyState === "live") {
            if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
              if (
                canvas.width !== video.videoWidth ||
                canvas.height !== video.videoHeight
              ) {
                canvas.width = video.videoWidth
                canvas.height = video.videoHeight
              }
              context.drawImage(video, 0, 0)
              const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, "image/jpeg", 0.68),
              )
              if (active && blob) {
                await bridge.pushFrame(new Uint8Array(await blob.arrayBuffer()))
              }
            }
            await wait(FRAME_INTERVAL_MS)
          }
        } catch {
          // A closed or restarted rekordbox window is rediscovered on the next attempt.
        } finally {
          if (liveRekordboxVideo === video) liveRekordboxVideo = null
          stream?.getTracks().forEach((track) => track.stop())
          stream = null
          video.srcObject = null
        }
        if (active) await wait(RETRY_INTERVAL_MS)
      }
    }

    void run()
    return () => {
      active = false
      if (liveRekordboxVideo === video) liveRekordboxVideo = null
      stream?.getTracks().forEach((track) => track.stop())
      video.srcObject = null
    }
  }, [])
}
