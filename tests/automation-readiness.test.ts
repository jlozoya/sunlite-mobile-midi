import { describe, expect, test } from "bun:test"
import type { AutomationStatus } from "../src/shared/automation-types"
import {
  automationReadiness,
  audioErrorMessage,
} from "../src/renderer/ui/automation/automation-readiness"

const status = (overrides: Partial<AutomationStatus> = {}) =>
  ({
    recording: false,
    modelExampleCount: 0,
    audioConnected: false,
    waveformConnected: false,
    ...overrides,
  }) as AutomationStatus

describe("Automation prerequisites", () => {
  test("an audio source alone cannot enable inference before training", () => {
    const ready = automationReadiness(status({ audioConnected: true }), false)
    expect(ready.sourceReady).toBe(true)
    expect(ready.modelReady).toBe(false)
    expect(ready.modeBlockReason).toContain("Graba una sesión")
  })
  test("a trained model needs a live source, including after losing audio", () => {
    const ready = automationReadiness(status({ modelExampleCount: 8 }), false)
    expect(ready.modelReady).toBe(true)
    expect(ready.modeBlockReason).toContain("Inicia el audio")
  })
  test("fewer than five examples never enables a model that cannot predict", () => {
    expect(
      automationReadiness(status({ modelExampleCount: 4, audioConnected: true }), true)
        .modelReady,
    ).toBe(false)
    expect(
      automationReadiness(status({ modelExampleCount: 5, audioConnected: true }), true)
        .modeBlockReason,
    ).toBeNull()
  })
  test("local audio, remote audio and a playing CDJ can each activate an existing model", () => {
    for (const [overrides, local] of [
      [{}, true],
      [{ audioConnected: true }, false],
      [{ waveformConnected: true }, false],
    ] as const) {
      expect(
        automationReadiness(status({ modelExampleCount: 8, ...overrides }), local)
          .modeBlockReason,
      ).toBeNull()
    }
  })
  test("recording blocks inference even when the model and source are ready", () => {
    expect(
      automationReadiness(
        status({ recording: true, modelExampleCount: 8, waveformConnected: true }),
        false,
      ).modeBlockReason,
    ).toContain("Finaliza la grabación")
  })
  test("a missing server state never presents the model as ready", () => {
    expect(automationReadiness(null, true).modelReady).toBe(false)
    expect(automationReadiness(null, true).modeBlockReason).toContain("Cargando")
  })
  test("capture failures give a concrete recovery action", () => {
    for (const [name, instruction] of [
      ["NotAllowedError", "Permite el acceso"],
      ["NotFoundError", "Conéctala"],
      ["NotReadableError", "otro programa"],
      ["OverconstrainedError", "selecciona otra fuente"],
    ]) {
      const error = new Error("internal browser message")
      error.name = name
      expect(audioErrorMessage(error)).toContain(instruction)
    }
    expect(audioErrorMessage(new Error("Conexión perdida"))).toBe("Conexión perdida")
  })
})
