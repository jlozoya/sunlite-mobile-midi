import type { RouterState } from "../../shared/router-types.js"
import { setTimeout as wait } from "node:timers/promises"

type ReadinessOptions = { timeoutMs?: number; pollIntervalMs?: number }

function requiredHardwarePorts(state: RouterState) {
  const sources = state.config.ports.filter(
    (port) =>
      port.kind === "hardware" &&
      port.role === "input" &&
      state.config.routes.some((route) => route.enabled && route.source === port.id),
  )
  const ids = new Set(sources.map((port) => port.id))
  for (const route of state.config.routes) {
    if (route.enabled && ids.has(route.source)) ids.add(route.destination)
  }
  return {
    sources,
    required: state.config.ports.filter((port) => ids.has(port.id)),
  }
}

/** Start a saved, usable hardware route before recording its first gesture. */
export async function prepareTrainingRouter(
  getState: () => RouterState,
  start: () => Promise<void>,
  options: ReadinessOptions = {},
): Promise<void> {
  const state = getState()
  if (state.errors.length) return
  const { sources, required } = requiredHardwarePorts(state)
  if (!sources.length) return
  if (!state.running) {
    const available = sources.every((port) =>
      state.devices.inputs.some((name) => {
        const candidate = name.toLowerCase()
        const wanted = port.deviceName.trim().toLowerCase()
        return (
          wanted !== "" &&
          (port.match === "exact" ? candidate === wanted : candidate.includes(wanted))
        )
      }),
    )
    if (!available) return
  }
  try {
    if (!state.running) await start()
  } catch (error) {
    throw new Error(
      `No se pudo arrancar el router para entrenar. ${error instanceof Error ? error.message : "Revisa la conexión MIDI."}`,
    )
  }

  // The router deliberately tolerates busy/missing devices and retries them in
  // the background. Awaiting start() alone does not mean it can deliver gestures.
  // Allow one 3-second hub rescan before refusing to begin the recording.
  const deadline = Date.now() + Math.max(0, options.timeoutMs ?? 5000)
  for (;;) {
    const current = getState()
    const closed = required.filter(
      (port) => !current.ports.some((live) => live.id === port.id && live.connected),
    )
    if (current.running && !closed.length) return
    if (Date.now() >= deadline) {
      const details = closed.map((port) => {
        const error = current.ports.find((live) => live.id === port.id)?.error
        return `${port.deviceName}: ${error ?? "puerto sin conectar"}`
      })
      if (!current.running) details.unshift("el router está detenido")
      throw new Error(
        `No se puede empezar a grabar: la ruta MIDI no está lista. ${details.join("; ")}. Revisa la conexión del router y vuelve a intentarlo.`,
      )
    }
    await wait(
      Math.min(Math.max(1, options.pollIntervalMs ?? 100), deadline - Date.now()),
    )
  }
}
