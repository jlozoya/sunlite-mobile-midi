import type { RouterState } from "../../shared/router-types.js"

/** Start a saved, usable hardware route before recording its first gesture. */
export async function prepareTrainingRouter(
  getState: () => RouterState,
  start: () => Promise<void>,
): Promise<void> {
  const state = getState()
  if (state.running || state.errors.length) return
  const hardwareInputs = state.config.ports.filter(
    (port) =>
      port.kind === "hardware" &&
      port.role === "input" &&
      state.config.routes.some((route) => route.enabled && route.source === port.id),
  )
  if (!hardwareInputs.length) return
  const available = hardwareInputs.every((port) =>
    state.devices.inputs.some((name) =>
      port.match === "exact"
        ? name === port.deviceName
        : name.toLowerCase().includes(port.deviceName.toLowerCase()),
    ),
  )
  if (!available) return
  try {
    await start()
  } catch (error) {
    throw new Error(
      `No se pudo arrancar el router para entrenar. ${error instanceof Error ? error.message : "Revisa la conexión MIDI."}`,
    )
  }
}
