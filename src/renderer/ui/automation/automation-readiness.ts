import type { AutomationStatus } from "../../../shared/automation-types"

export function automationReadiness(
  status: AutomationStatus | null,
  audioRunning: boolean,
) {
  const sourceReady = Boolean(
    audioRunning || status?.audioConnected || status?.waveformConnected,
  )
  const modelReady = Boolean(status && status.modelExampleCount > 0)
  const modeBlockReason = !status
    ? "Cargando el estado de automatización."
    : status.recording
      ? "Finaliza la grabación para probar el modelo."
      : !modelReady
        ? "Graba una sesión usando el Controlador y finalízala para entrenar el modelo."
        : !sourceReady
          ? "Inicia el audio o conecta un CDJ que esté reproduciendo música."
          : null
  return { sourceReady, modelReady, modeBlockReason }
}

export function audioErrorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    if (cause.name === "NotAllowedError")
      return "No se autorizó la captura de audio. Permite el acceso al micrófono o vuelve a seleccionar el audio del PC."
    if (cause.name === "NotFoundError")
      return "No se encontró la entrada de audio. Conéctala y actualiza la lista, o selecciona otra fuente."
    if (cause.name === "NotReadableError")
      return "No se pudo abrir el audio. Comprueba si otro programa está usando la entrada y vuelve a intentarlo."
    if (cause.name === "OverconstrainedError")
      return "La entrada guardada ya no está disponible. Actualiza la lista y selecciona otra fuente."
    return cause.message
  }
  return "No se pudo abrir la fuente de audio."
}
