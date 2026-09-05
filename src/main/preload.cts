const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("desktopUpdates", {
  status: () => ipcRenderer.invoke("updates:status"),
  check: () => ipcRenderer.invoke("updates:check"),
  download: () => ipcRenderer.invoke("updates:download"),
  install: () => ipcRenderer.invoke("updates:install"),
})
