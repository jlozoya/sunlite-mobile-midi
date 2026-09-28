const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("desktopUpdates", {
  status: () => ipcRenderer.invoke("updates:status"),
  check: () => ipcRenderer.invoke("updates:check"),
  download: () => ipcRenderer.invoke("updates:download"),
  install: () => ipcRenderer.invoke("updates:install"),
})

contextBridge.exposeInMainWorld("rekordboxCapture", {
  nativeCursorFree: process.platform === "win32",
  onFrame: (callback: (bytes: Uint8Array) => void) => {
    const listener = (_event: unknown, bytes: Uint8Array) => callback(bytes)
    ipcRenderer.on("rekordbox:frame", listener)
    return () => ipcRenderer.removeListener("rekordbox:frame", listener)
  },
  preview: () => ipcRenderer.invoke("rekordbox:preview"),
  sourceId: () => ipcRenderer.invoke("rekordbox:source-id"),
  pushFrame: (bytes: Uint8Array) => ipcRenderer.invoke("rekordbox:push-frame", bytes),
  saveRegions: (regions: unknown) =>
    ipcRenderer.invoke("rekordbox:save-regions", regions),
})
