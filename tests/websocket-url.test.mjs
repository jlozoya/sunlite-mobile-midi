import assert from "node:assert/strict"
import test from "node:test"
import { websocketUrlForPage } from "../dist/shared/websocket-url.js"

test("Electron development connects directly to the actual backend port", () => {
  assert.equal(
    websocketUrlForPage("http://127.0.0.1:5173/?sunliteBackendPort=3012"),
    "ws://127.0.0.1:3012/ws",
  )
})

test("normal and secure pages use their own host", () => {
  assert.equal(websocketUrlForPage("http://127.0.0.1:3000/"), "ws://127.0.0.1:3000/ws")
  assert.equal(
    websocketUrlForPage("https://midi.example.test/app"),
    "wss://midi.example.test/ws",
  )
})

test("a backend-port override is accepted only on loopback pages", () => {
  assert.equal(
    websocketUrlForPage("http://192.168.1.20:5173/?sunliteBackendPort=3012"),
    "ws://192.168.1.20:5173/ws",
  )
  assert.equal(
    websocketUrlForPage("http://localhost:5173/?sunliteBackendPort=invalid"),
    "ws://localhost:5173/ws",
  )
})
