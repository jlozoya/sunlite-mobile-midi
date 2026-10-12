import type { Express } from "express"
import type { AutomationEngine } from "../automation/automation-engine.js"
import type { RekordboxWindowCapture } from "../automation/rekordbox-window.js"
import type { ProDjLinkSidecar } from "../automation/prodj-link-sidecar.js"
import type { RekordboxDeckNumber } from "../../shared/rekordbox-capture.js"

export function registerAutomationRoutes(
  appServer: Express,
  {
    getEngine,
    getCapture,
    getSidecar,
  }: {
    getEngine: () => AutomationEngine | null
    getCapture: () => RekordboxWindowCapture | null
    getSidecar: () => ProDjLinkSidecar | null
  },
) {
  appServer.get("/api/automation/status", (_request, response) => {
    response.json(getEngine()?.getStatus())
  })

  appServer.get("/api/automation/rekordbox/status", async (_request, response) => {
    try {
      response.setHeader("Cache-Control", "no-store")
      response.json({
        available: Boolean(await getCapture()?.capture()),
        regions: getCapture()?.getRegions() ?? {},
      })
    } catch {
      response.status(503).json({ available: false, regions: {} })
    }
  })

  appServer.get(
    "/api/automation/rekordbox/decks/:deck/frame",
    async (request, response) => {
      const deck = Number(request.params.deck)
      if (![1, 2, 3, 4].includes(deck)) {
        response.status(400).end()
        return
      }
      try {
        const image = await getCapture()?.captureDeck(deck as RekordboxDeckNumber)
        if (!image) {
          response.status(404).end()
          return
        }
        response.setHeader("Cache-Control", "no-store")
        response.type("jpeg").send(image.toJPEG(80))
      } catch {
        response.status(503).end()
      }
    },
  )

  appServer.put("/api/automation/mode", (request, response) => {
    try {
      response.json(getEngine()?.setMode(request.body?.mode))
    } catch (error) {
      response.status(400).json({
        message: error instanceof Error ? error.message : "Invalid automation mode",
      })
    }
  })

  appServer.put("/api/automation/settings", (request, response) => {
    try {
      response.json(getEngine()?.updateSettings(request.body))
    } catch (error) {
      response.status(400).json({
        message: error instanceof Error ? error.message : "Invalid automation settings",
      })
    }
  })

  appServer.post("/api/automation/session/start", (request, response) => {
    response.json(getEngine()?.startSession(request.body?.name))
  })

  appServer.post("/api/automation/session/stop", (_request, response) => {
    response.json(getEngine()?.stopSession())
  })

  appServer.post("/api/automation/train", (_request, response) => {
    response.json(getEngine()?.train())
  })

  appServer.get("/api/automation/sessions/:id", (request, response) => {
    response.json({
      id: request.params.id,
      events: getEngine()?.readTimeline(request.params.id) ?? [],
    })
  })

  appServer.put("/api/automation/sessions/:id", (request, response) => {
    try {
      response.json(getEngine()?.renameSession(request.params.id, request.body?.name))
    } catch (error) {
      response.status(400).json({
        message: error instanceof Error ? error.message : "Invalid training session",
      })
    }
  })

  appServer.delete("/api/automation/sessions/:id", (request, response) => {
    try {
      response.json(getEngine()?.deleteSession(request.params.id))
    } catch (error) {
      response.status(400).json({
        message: error instanceof Error ? error.message : "Invalid training session",
      })
    }
  })

  appServer.patch("/api/automation/sessions/:id/examples", (request, response) => {
    try {
      response.json(
        getEngine()?.updateTrainingExamples(request.params.id, request.body?.edits),
      )
    } catch (error) {
      response.status(400).json({
        message:
          error instanceof Error ? error.message : "Invalid training example edits",
      })
    }
  })

  appServer.post("/api/automation/examples/:id/exclude", (request, response) => {
    try {
      response.json(getEngine()?.excludeTrainingExample(request.params.id))
    } catch (error) {
      response.status(400).json({
        message: error instanceof Error ? error.message : "Invalid example",
      })
    }
  })

  appServer.post("/api/automation/prodj-link/restart", (_request, response) => {
    getSidecar()?.stop()
    getSidecar()?.start()
    response.json(getEngine()?.getStatus())
  })
}
