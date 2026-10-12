import { session, desktopCapturer, ipcMain, type BrowserWindow } from "electron"
import type { RekordboxWindowCapture } from "../automation/rekordbox-window.js"

export function configureCapture({
  getWindow,
  getCapture,
  trustedUrl,
}: {
  getWindow: () => BrowserWindow | null
  getCapture: () => RekordboxWindowCapture | null
  trustedUrl: string
}) {
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const currentUrl = webContents.getURL()
      let isLocalController = false
      try {
        const parsed = new URL(currentUrl)
        isLocalController =
          parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost"
      } catch {
        isLocalController = false
      }
      callback(permission === "media" && isLocalController)
    },
  )

  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const mainWindow = getWindow()
    let trustedOrigin = false
    try {
      trustedOrigin =
        new URL(request.securityOrigin).origin === new URL(trustedUrl).origin
    } catch {
      trustedOrigin = false
    }
    const trustedFrame =
      mainWindow && request.frame === mainWindow.webContents.mainFrame && trustedOrigin
    if (
      !trustedFrame ||
      !request.userGesture ||
      !request.audioRequested ||
      !request.videoRequested
    ) {
      callback({})
      return
    }
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1, height: 1 },
      })
      callback(sources[0] ? { video: sources[0], audio: "loopback" } : {})
    } catch {
      callback({})
    }
  })
  const trustedRekordboxRequest = (event: Electron.IpcMainInvokeEvent) => {
    const mainWindow = getWindow()
    return (
      mainWindow &&
      event.sender === mainWindow.webContents &&
      event.senderFrame === mainWindow.webContents.mainFrame &&
      new URL(event.senderFrame.url).origin === new URL(trustedUrl).origin
    )
  }

  ipcMain.handle("rekordbox:preview", async (event) => {
    if (!trustedRekordboxRequest(event)) throw new Error("Solicitud no autorizada")
    const image = await getCapture()?.capture()
    return image ? `data:image/jpeg;base64,${image.toJPEG(80).toString("base64")}` : null
  })
  ipcMain.handle("rekordbox:source-id", async (event) => {
    if (!trustedRekordboxRequest(event)) throw new Error("Solicitud no autorizada")
    return (await getCapture()?.getSourceId()) ?? null
  })
  ipcMain.handle("rekordbox:push-frame", (event, bytes: Uint8Array) => {
    if (!trustedRekordboxRequest(event)) throw new Error("Solicitud no autorizada")
    if (!(bytes instanceof Uint8Array)) throw new Error("Imagen no válida")
    getCapture()?.pushFrame(bytes)
  })
  ipcMain.handle("rekordbox:save-regions", (event, regions: unknown) => {
    if (!trustedRekordboxRequest(event)) throw new Error("Solicitud no autorizada")
    return getCapture()?.saveRegions(regions) ?? {}
  })
}
