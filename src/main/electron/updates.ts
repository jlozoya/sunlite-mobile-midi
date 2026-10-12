import { app as electronApp, ipcMain, type BrowserWindow } from "electron"
import electronUpdater from "electron-updater"
import fs from "node:fs"
import path from "node:path"
import { UpdateManager, validateUpdateFeed } from "../update-manager.js"
import { getApplicationVersion } from "../runtime-paths.js"
import type { AutomationStatus } from "../../shared/automation-types.js"

const { autoUpdater } = electronUpdater
export function configureAutoUpdates({
  getWindow,
  getAutomationStatus,
  trustedUrl,
}: {
  getWindow: () => BrowserWindow | null
  getAutomationStatus: () => AutomationStatus | undefined
  trustedUrl: string | undefined
}) {
  let disabledReason = !electronApp.isPackaged
    ? "Las actualizaciones están desactivadas en desarrollo."
    : process.platform !== "win32"
      ? "Las actualizaciones integradas requieren la instalación de Windows."
      : process.env.PORTABLE_EXECUTABLE_FILE
        ? "Edición portable: instala la edición Setup para recibir actualizaciones."
        : !fs.existsSync(
              path.join(process.resourcesPath, "..", "Uninstall Sunlite Mobile MIDI.exe"),
            )
          ? "Esta copia no está instalada. Ejecuta el instalador Setup para activar actualizaciones."
          : null
  if (!disabledReason && process.env.SUNLITE_UPDATE_FEED_URL) {
    try {
      autoUpdater.setFeedURL({
        provider: "generic",
        url: validateUpdateFeed(process.env.SUNLITE_UPDATE_FEED_URL),
      })
    } catch {
      disabledReason = "El servidor de actualizaciones configurado no es válido."
    }
  }
  const updateManager = new UpdateManager(
    autoUpdater,
    getApplicationVersion(),
    disabledReason,
    () => {
      const state = getAutomationStatus()
      if (state?.recording) throw new Error("Termina la grabación antes de instalar.")
      if (state && state.mode !== "manual")
        throw new Error("Cambia a modo Manual antes de instalar.")
    },
  )
  for (const action of ["status", "check", "download", "install"] as const) {
    ipcMain.handle(`updates:${action}`, (event) => {
      const mainWindow = getWindow()
      const frame = event.senderFrame
      if (
        !mainWindow ||
        event.sender !== mainWindow.webContents ||
        frame !== mainWindow.webContents.mainFrame ||
        !trustedUrl ||
        new URL(frame.url).origin !== new URL(trustedUrl).origin
      ) {
        throw new Error("Solicitud de actualización no autorizada.")
      }
      return updateManager![action]()
    })
  }
  updateManager.start()
  return updateManager
}
