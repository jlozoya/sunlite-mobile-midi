import type { DesktopUpdates } from "../shared/update-types"

declare global {
  interface Window {
    desktopUpdates?: DesktopUpdates
  }
}
