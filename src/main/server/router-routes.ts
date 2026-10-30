import type { Express } from "express"
import type { RouterService } from "../router-service.js"
import { MIDI_OUTPUT_NAME, MIDI_INPUT_NAME } from "../midi/settings.js"

export function registerRouterRoutes(
  appServer: Express,
  {
    routerService,
    startRouter,
  }: {
    routerService: RouterService
    startRouter: () => Promise<void>
  },
) {
  const routerReservedDevices = () => [MIDI_OUTPUT_NAME, MIDI_INPUT_NAME]

  const routerPayload = () => ({
    ...routerService!.getState(routerReservedDevices()),
    monitor: routerService!.getMonitor(),
  })

  appServer.get("/api/router/state", (_request, response) => {
    response.json(routerPayload())
  })

  appServer.put("/api/router/config", (request, response) => {
    try {
      routerService!.updateConfig(request.body)
      response.json(routerPayload())
    } catch (error) {
      response.status(400).json({
        message: error instanceof Error ? error.message : "Invalid router configuration",
      })
    }
  })

  appServer.post("/api/router/start", async (_request, response) => {
    try {
      await startRouter()
      response.json(routerPayload())
    } catch (error) {
      response.status(400).json({
        message: error instanceof Error ? error.message : "Could not start the router",
      })
    }
  })

  appServer.post("/api/router/stop", (_request, response) => {
    routerService!.stop()
    response.json(routerPayload())
  })
}
