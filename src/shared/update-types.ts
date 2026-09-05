export type UpdateStatus = {
  currentVersion: string
  phase:
    | "disabled"
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "downloaded"
    | "installing"
    | "error"
  availableVersion: string | null
  percent: number | null
  message: string
  checkedAt: string | null
}

export type DesktopUpdates = {
  status: () => Promise<UpdateStatus>
  check: () => Promise<UpdateStatus>
  download: () => Promise<UpdateStatus>
  install: () => Promise<UpdateStatus>
}
