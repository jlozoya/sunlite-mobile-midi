import type { Express } from "express"
import {
  isLightingSoftware,
  type LightingSoftware,
} from "../../shared/lighting-software.js"
import type { ServerStatus } from "../../shared/server-status.js"
import type { createControllerStore } from "../persistence/controller-store.js"
import type { createMidiFeedbackStore } from "../persistence/midi-feedback-store.js"
import type { createMidiBridgeService } from "../midi/bridge-service.js"

export function registerControllerRoutes(
  appServer: Express,
  {
    getStatus,
    getLightingSoftware,
    isRecording,
    switchLightingSoftware,
    refreshMidiConnection,
    controllerStore,
    feedbackStore,
    midiBridge,
    broadcastToAll,
  }: {
    getStatus: () => ServerStatus | null
    getLightingSoftware: () => LightingSoftware
    isRecording: () => boolean
    switchLightingSoftware: (software: LightingSoftware) => void
    refreshMidiConnection: () => ServerStatus | null
    controllerStore: ReturnType<typeof createControllerStore>
    feedbackStore: ReturnType<typeof createMidiFeedbackStore>
    midiBridge: ReturnType<typeof createMidiBridgeService>
    broadcastToAll: (payload: unknown) => void
  },
) {
  const { loadControllerCustomization, saveControllerCustomization } = controllerStore
  const { cloneMidiFeedbackState, saveMidiFeedbackState } = feedbackStore
  const { installLoopMidi, openLoopMidi } = midiBridge
  const broadcastMidiFeedbackState = () =>
    broadcastToAll({ event: "midi-feedback-state", state: cloneMidiFeedbackState() })
  appServer.get("/api/status", (_request, response) => {
    refreshMidiConnection()
    response.json(getStatus())
  })

  appServer.put("/api/lighting-software", (request, response) => {
    const software = request.body?.software
    if (!isLightingSoftware(software)) {
      response.status(400).json({ message: "Software de luces no válido" })
      return
    }
    if (software === getLightingSoftware()) {
      response.json(getStatus())
      return
    }
    if (isRecording()) {
      response
        .status(409)
        .json({ message: "Detén la grabación antes de cambiar de software" })
      return
    }
    try {
      switchLightingSoftware(software)
    } catch (error) {
      response.status(500).json({
        message:
          error instanceof Error ? error.message : "No se pudo cambiar de software",
      })
      return
    }
    response.json(getStatus())
  })

  appServer.post("/api/midi/refresh", (_request, response) => {
    response.json(refreshMidiConnection())
  })

  appServer.post("/api/loopmidi/install", async (_request, response) => {
    try {
      const result = await installLoopMidi()
      response.json({ ok: result.code === 0, ...result, status: refreshMidiConnection() })
    } catch (error) {
      response.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : "Unknown install error",
      })
    }
  })

  appServer.post("/api/loopmidi/open", async (_request, response) => {
    try {
      const openedPath = await openLoopMidi()
      response.json({ ok: true, openedPath, status: refreshMidiConnection() })
    } catch (error) {
      response.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : "Unknown open error",
      })
    }
  })

  appServer.get("/api/controller-config", (_request, response) => {
    response.json(loadControllerCustomization())
  })

  appServer.put("/api/controller-config", (request, response) => {
    try {
      const nextCustomization = saveControllerCustomization(request.body)
      broadcastToAll({ event: "controller-config", config: nextCustomization })
      response.json(nextCustomization)
    } catch (error) {
      response.status(500).json({
        ok: false,
        message:
          error instanceof Error ? error.message : "Unknown controller config error",
      })
    }
  })

  appServer.get("/api/midi-feedback/state", (_request, response) => {
    response.json({ ok: true, state: cloneMidiFeedbackState() })
  })

  appServer.post("/api/midi-feedback/clear", (_request, response) => {
    feedbackStore.clear()
    saveMidiFeedbackState()
    broadcastMidiFeedbackState()
    response.json({ ok: true, state: cloneMidiFeedbackState() })
  })
}
