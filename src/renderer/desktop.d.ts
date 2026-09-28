import type { DesktopUpdates } from "../shared/update-types"
import type { RekordboxCaptureRegions } from "../shared/rekordbox-capture"

declare global {
  interface Window {
    desktopUpdates?: DesktopUpdates
    rekordboxCapture?: {
      nativeCursorFree: boolean
      onFrame: (callback: (bytes: Uint8Array) => void) => () => void
      preview: () => Promise<string | null>
      sourceId: () => Promise<string | null>
      pushFrame: (bytes: Uint8Array) => Promise<void>
      saveRegions: (regions: RekordboxCaptureRegions) => Promise<RekordboxCaptureRegions>
    }
  }
}
