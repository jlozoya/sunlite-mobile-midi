import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import test from "node:test"
import { UpdateManager, validateUpdateFeed } from "../dist/main/update-manager.js"

class FakeUpdater extends EventEmitter {
  checks = 0
  downloads = 0
  installs = 0
  async checkForUpdates() {
    this.checks++
    this.emit("checking-for-update")
    this.emit("update-available", { version: "0.4.0" })
    return {}
  }
  async downloadUpdate() {
    this.downloads++
    this.emit("download-progress", { percent: 42 })
    this.emit("update-downloaded", { version: "0.4.0" })
    return ["setup.exe"]
  }
  quitAndInstall(silent, runAfter) {
    assert.equal(silent, false)
    assert.equal(runAfter, true)
    this.installs++
  }
}
function fixture(disabled = null, prepare = () => {}) {
  const updater = new FakeUpdater()
  return { updater, manager: new UpdateManager(updater, "0.3.1", disabled, prepare) }
}

test("search automatically downloads; installation stays explicit", async () => {
  const { updater, manager } = fixture()
  assert.equal(updater.autoDownload, false)
  assert.equal(updater.autoInstallOnAppQuit, false)
  assert.equal(updater.allowDowngrade, false)
  assert.equal(updater.allowPrerelease, false)
  assert.equal((await manager.check()).phase, "downloaded")
  assert.equal(updater.downloads, 1)
  assert.equal(updater.installs, 0)
  assert.equal((await manager.download()).phase, "downloaded")
  await manager.check()
  assert.equal(updater.checks, 1, "Checking must preserve the staged installer")
  assert.equal(manager.install().phase, "installing")
  manager.install()
  assert.equal(updater.installs, 1)
})

test("development, portable and uninstalled copies never check/download/install", async () => {
  const { updater, manager } = fixture("Not installed")
  manager.start()
  await manager.check()
  await manager.download()
  manager.install()
  assert.equal(manager.status().phase, "disabled")
  assert.equal(updater.checks + updater.downloads + updater.installs, 0)
  manager.stop()
})

test("recording or automation guard preserves downloaded update for later", async () => {
  let blocked = true
  const { updater, manager } = fixture(null, () => {
    if (blocked) throw new Error("Termina la grabación antes de instalar.")
  })
  await manager.check()
  await manager.download()
  assert.match(manager.install().message, /grabación/)
  assert.equal(manager.status().phase, "downloaded")
  assert.equal(updater.installs, 0)
  blocked = false
  manager.install()
  assert.equal(updater.installs, 1)
})

test("network failure is visible and check can be retried", async () => {
  const { updater, manager } = fixture()
  updater.checkForUpdates = async () => {
    throw new Error("offline")
  }
  assert.equal((await manager.check()).phase, "error")
  updater.checkForUpdates = FakeUpdater.prototype.checkForUpdates
  assert.equal((await manager.check()).phase, "downloaded")
})

test("download failure does not install; retry succeeds", async () => {
  const { updater, manager } = fixture()
  updater.downloadUpdate = async () => {
    updater.emit("error", new Error("checksum"))
    throw new Error("checksum")
  }
  assert.equal((await manager.check()).phase, "error")
  manager.install()
  assert.equal(updater.installs, 0)
  updater.downloadUpdate = FakeUpdater.prototype.downloadUpdate
  assert.equal((await manager.download()).phase, "downloaded")
})

test("simultaneous operations cannot replace an in-progress download", async () => {
  const { updater, manager } = fixture()
  let finish
  updater.downloadUpdate = () =>
    new Promise((resolve) => {
      finish = () => {
        updater.emit("update-downloaded", { version: "0.4.0" })
        resolve([])
      }
    })
  const download = manager.check()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(manager.status().phase, "downloading")
  await manager.check()
  await manager.download()
  manager.install()
  assert.equal(updater.checks, 1)
  assert.equal(updater.installs, 0)
  finish()
  await download
  assert.equal(manager.status().phase, "downloaded")
})

test("no-update event clears old candidate; null check is an error", async () => {
  const { updater, manager } = fixture()
  updater.downloadUpdate = async () => {
    throw new Error("offline")
  }
  await manager.check()
  updater.checkForUpdates = async () => {
    updater.emit("update-not-available")
    return {}
  }
  assert.equal((await manager.check()).phase, "idle")
  assert.equal(manager.status().availableVersion, null)
  assert.equal(updater.downloads, 0)
  updater.checkForUpdates = async () => null
  assert.equal((await manager.check()).phase, "error")
})

test("scheduled startup and periodic checks download without user interaction", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] })
  const { updater, manager } = fixture()
  updater.checkForUpdates = async () => {
    updater.checks++
    if (updater.checks === 1) updater.emit("update-not-available")
    else updater.emit("update-available", { version: "0.4.0" })
    return {}
  }
  try {
    manager.start()
    manager.start()
    t.mock.timers.tick(5000)
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(updater.checks, 1)
    assert.equal(updater.downloads, 0)
    t.mock.timers.tick(4 * 60 * 60 * 1000)
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(updater.checks, 2)
    assert.equal(updater.downloads, 1)
    assert.equal(manager.status().phase, "downloaded")
    assert.equal(updater.installs, 0)
    manager.stop()
    t.mock.timers.tick(4 * 60 * 60 * 1000)
    assert.equal(updater.checks, 2)
  } finally {
    manager.stop()
  }
})

test("feed override requires HTTPS outside loopback and rejects credentials", () => {
  for (const url of [
    "https://updates.example.org/app",
    "http://127.0.0.1:8080/updates",
    "http://localhost:8080",
  ])
    assert.ok(validateUpdateFeed(url))
  for (const url of [
    "http://example.org",
    "file:///tmp/update",
    "https://user:pass@example.org",
    "https://example.org?token=secret",
    "invalid",
  ]) {
    assert.throws(() => validateUpdateFeed(url))
  }
})
