import { afterEach, describe, expect, test } from "bun:test"
import { createReconnectingSocket } from "../src/renderer/ui/socket-connection"

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
const originalSocket = Object.getOwnPropertyDescriptor(globalThis, "WebSocket")

afterEach(() => {
  for (const [key, descriptor] of [
    ["window", originalWindow],
    ["WebSocket", originalSocket],
  ] as const) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
})

function harness() {
  const sockets: FakeSocket[] = []
  const timers = new Map<number, () => void>()
  const events: string[] = []
  let timerId = 0

  class FakeSocket extends EventTarget {
    closed = false
    constructor(readonly url: string) {
      super()
      sockets.push(this)
    }
    close() {
      this.closed = true
      this.dispatchEvent(new Event("close"))
    }
    message(data: string) {
      this.dispatchEvent(new MessageEvent("message", { data }))
    }
  }

  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    value: FakeSocket,
  })
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setTimeout(callback: () => void) {
        timers.set(++timerId, callback)
        return timerId
      },
      clearTimeout(id: number) {
        timers.delete(id)
      },
    },
  })

  const connect = () =>
    createReconnectingSocket("ws://localhost:3000/ws", {
      onConnect: () => events.push("connecting"),
      onOpen: () => events.push("open"),
      onClose: () => events.push("close"),
      onError: () => events.push("error"),
      onMessage: (event) => events.push(String(event.data)),
    })
  const tick = () => {
    const pending = [...timers.values()]
    timers.clear()
    pending.forEach((callback) => callback())
  }
  return { sockets, timers, events, connect, tick }
}

describe("WebSocket recovery", () => {
  test("reconnects and resumes messages after the server or network closes", () => {
    const h = harness()
    const dispose = h.connect()
    const first = h.sockets[0]
    first.dispatchEvent(new Event("open"))
    first.message("snapshot")
    first.close()
    expect(h.timers.size).toBe(1)
    h.tick()

    expect(h.sockets).toHaveLength(2)
    const second = h.sockets[1]
    expect(second.url).toBe(first.url)
    second.dispatchEvent(new Event("open"))
    second.message("fresh snapshot")
    expect(h.events).toEqual([
      "connecting",
      "open",
      "snapshot",
      "close",
      "connecting",
      "open",
      "fresh snapshot",
    ])
    dispose()
  })

  test("late events from an old socket cannot affect the replacement", () => {
    const h = harness()
    const dispose = h.connect()
    const first = h.sockets[0]
    first.close()
    h.tick()
    const before = [...h.events]
    first.dispatchEvent(new Event("open"))
    first.dispatchEvent(new Event("error"))
    first.message("stale snapshot")
    first.close()
    expect(h.events).toEqual(before)
    expect(h.timers.size).toBe(0)
    h.sockets[1].message("current snapshot")
    expect(h.events.at(-1)).toBe("current snapshot")
    dispose()
  })

  test("disposing a connecting socket ignores late events and never retries", () => {
    const h = harness()
    const dispose = h.connect()
    dispose()
    h.sockets[0].dispatchEvent(new Event("open"))
    h.sockets[0].dispatchEvent(new Event("error"))
    h.sockets[0].message("late")
    h.tick()
    expect(h.sockets[0].closed).toBe(true)
    expect(h.events).toEqual(["connecting"])
    expect(h.sockets).toHaveLength(1)
  })

  test("disposing during retry cancels it, including an already queued callback", () => {
    const h = harness()
    const dispose = h.connect()
    h.sockets[0].close()
    const queuedRetry = [...h.timers.values()][0]
    dispose()
    expect(h.timers.size).toBe(0)
    queuedRetry()
    h.tick()
    expect(h.sockets).toHaveLength(1)
  })

  test("cleanup followed by remount leaves only the new connection active", () => {
    const h = harness()
    h.connect()()
    const dispose = h.connect()
    h.sockets[0].message("stale")
    h.sockets[1].dispatchEvent(new Event("open"))
    h.sockets[1].message("current")
    expect(h.events).toEqual(["connecting", "connecting", "open", "current"])
    dispose()
  })

  test("an error followed by close schedules exactly one recovery", () => {
    const h = harness()
    const dispose = h.connect()
    h.sockets[0].dispatchEvent(new Event("error"))
    h.sockets[0].close()
    h.sockets[0].close()
    expect(h.events).toEqual(["connecting", "error", "close"])
    expect(h.timers.size).toBe(1)
    h.tick()
    expect(h.sockets).toHaveLength(2)
    dispose()
  })
})
