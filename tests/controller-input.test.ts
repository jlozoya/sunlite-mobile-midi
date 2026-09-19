import { describe, expect, test } from "bun:test"
import { createElement, type KeyboardEvent, type PointerEvent } from "react"
import { renderToString } from "react-dom/server"
import type { PressEvent } from "react-aria-components"
import {
  useMidiButtonPress,
  type MidiButtonPressHandlers,
} from "../src/renderer/ui/hooks/useMidiButtonPress"

function createPressHarness(isMobileView = false, isDisabled = false) {
  const messages: string[] = []
  const capturedPointers = new Set<number>()
  let handlers!: MidiButtonPressHandlers
  const target = {
    setPointerCapture: (id: number) => capturedPointers.add(id),
    hasPointerCapture: (id: number) => capturedPointers.has(id),
    releasePointerCapture: (id: number) => {
      capturedPointers.delete(id)
      handlers.onLostPointerCapture(pointer({ pointerId: id }))
    },
  }
  function pointer(overrides: Record<string, unknown> = {}) {
    return {
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      clientX: 0,
      clientY: 0,
      currentTarget: target,
      ...overrides,
    } as unknown as PointerEvent<HTMLElement>
  }
  function Harness() {
    handlers = useMidiButtonPress({
      isMobileView,
      isDisabled,
      onPressStart: () => messages.push("on"),
      onPressEnd: () => messages.push("off"),
    })
    return null
  }
  // Real React refs are sufficient for these event sequences; lifecycle cleanup
  // and browser event integration are covered by the browser checks.
  renderToString(createElement(Harness))
  return { handlers, messages, pointer, capturedPointers }
}

function key(key: string, repeat = false) {
  return { key, repeat, preventDefault() {} } as KeyboardEvent<HTMLElement>
}

describe("MIDI button interaction", () => {
  test("a desktop press releases once even when release triggers lost capture", () => {
    const { handlers, messages, pointer, capturedPointers } = createPressHarness()
    handlers.onPointerDown(pointer())
    expect(messages).toEqual(["on"])
    expect(capturedPointers.has(1)).toBe(true)
    handlers.onPointerUp(pointer())
    handlers.onPointerCancel(pointer())
    expect(messages).toEqual(["on", "off"])
    expect(capturedPointers.size).toBe(0)
  })

  test("a second pointer cannot replace or release the held note", () => {
    const { handlers, messages, pointer } = createPressHarness()
    handlers.onPointerDown(pointer())
    handlers.onPointerDown(pointer({ pointerId: 2 }))
    handlers.onPointerUp(pointer({ pointerId: 2 }))
    expect(messages).toEqual(["on"])
    handlers.onPointerUp(pointer())
    expect(messages).toEqual(["on", "off"])
  })

  test("right and middle mouse buttons never fire MIDI", () => {
    const { handlers, messages, pointer } = createPressHarness()
    for (const button of [1, 2]) {
      handlers.onPointerDown(pointer({ button }))
      handlers.onPointerUp(pointer({ button }))
    }
    expect(messages).toEqual([])
  })

  test("loss of focus releases a keyboard note and ignores later key-up", () => {
    const { handlers, messages } = createPressHarness()
    handlers.onKeyDown(key(" "))
    handlers.onKeyDown(key(" ", true))
    handlers.onBlur()
    handlers.onKeyUp(key(" "))
    expect(messages).toEqual(["on", "off"])
  })

  test("key-up for another activation key does not release the original press", () => {
    const { handlers, messages } = createPressHarness()
    handlers.onKeyDown(key("Enter"))
    handlers.onKeyDown(key(" "))
    handlers.onKeyUp(key(" "))
    expect(messages).toEqual(["on"])
    handlers.onKeyUp(key("Enter"))
    expect(messages).toEqual(["on", "off"])
  })

  test("pointer cancellation and lost capture release held notes", () => {
    for (const cancel of ["onPointerCancel", "onLostPointerCapture"] as const) {
      const { handlers, messages, pointer } = createPressHarness()
      handlers.onPointerDown(pointer())
      handlers[cancel](pointer())
      handlers.onPointerUp(pointer())
      expect(messages).toEqual(["on", "off"])
    }
  })

  test("mobile taps fire on release and scrolling cancels without a note", () => {
    const tap = createPressHarness(true)
    tap.handlers.onPointerDown(tap.pointer({ pointerType: "touch" }))
    expect(tap.messages).toEqual([])
    expect(tap.capturedPointers.size).toBe(0)
    tap.handlers.onPointerUp(tap.pointer({ clientY: 5 }))
    expect(tap.messages).toEqual(["on", "off"])

    const scroll = createPressHarness(true)
    scroll.handlers.onPointerDown(scroll.pointer({ pointerType: "touch" }))
    scroll.handlers.onPointerMove(scroll.pointer({ clientY: 30 }))
    scroll.handlers.onPointerUp(scroll.pointer({ clientY: 0 }))
    expect(scroll.messages).toEqual([])
  })

  test("virtual activation fires once while pointer press callbacks are ignored", () => {
    const { handlers, messages } = createPressHarness()
    handlers.onPress({ pointerType: "mouse" } as PressEvent)
    expect(messages).toEqual([])
    handlers.onPress({ pointerType: "virtual" } as PressEvent)
    expect(messages).toEqual(["on", "off"])
  })

  test("disabled controls ignore pointer, keyboard and virtual input", () => {
    const { handlers, messages, pointer } = createPressHarness(false, true)
    handlers.onPointerDown(pointer())
    handlers.onPointerUp(pointer())
    handlers.onKeyDown(key("Enter"))
    handlers.onKeyUp(key("Enter"))
    handlers.onPress({ pointerType: "virtual" } as PressEvent)
    expect(messages).toEqual([])
  })
})
