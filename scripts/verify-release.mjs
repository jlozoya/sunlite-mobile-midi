import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { load } = require("js-yaml")
const asar = require("@electron/asar")
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"))
const dir = path.resolve("release")
const metadata = load(fs.readFileSync(path.join(dir, "latest.yml"), "utf8"))
assert.equal(metadata.version, pkg.version, "Release version must match package.json")
assert.ok(metadata.files?.length, "Missing installer metadata")
for (const file of metadata.files) {
  const name = decodeURIComponent(file.url)
  assert.equal(path.basename(name), name, "Release assets must use local filenames")
  assert.match(name, /-Setup-.*-x64\.exe$/)
  const data = fs.readFileSync(path.join(dir, name))
  assert.equal(data.length, file.size, "Installer size mismatch")
  assert.equal(
    createHash("sha512").update(data).digest("base64"),
    file.sha512,
    "Installer checksum mismatch",
  )
  assert.ok(fs.statSync(path.join(dir, name + ".blockmap")).size > 0)
}
const resources = path.join(dir, "win-unpacked", "resources")
const feed = load(fs.readFileSync(path.join(resources, "app-update.yml"), "utf8"))
assert.equal(feed.provider, "github")
assert.equal(feed.owner, "jlozoya")
assert.equal(feed.repo, "sunlite-mobile-midi")
assert.ok(
  !fs.existsSync(path.join(resources, "installers")),
  "Public build must not bundle private driver installers",
)
const archive = path.join(resources, "app.asar")
const entries = asar.listPackage(archive).map((entry) => entry.replaceAll("\\", "/"))
for (const file of [
  "/dist/main/main.js",
  "/dist/main/preload.cjs",
  "/dist/main/update-manager.js",
  "/dist/renderer/index.html",
]) {
  assert.ok(entries.includes(file), "Missing packaged file: " + file)
}
assert.ok(
  entries.some((name) => name.endsWith(".node") && name.includes("better-sqlite3")),
  "Missing native database",
)
assert.ok(
  entries.some((name) => name.endsWith(".node") && name.includes("midi")),
  "Missing native MIDI module",
)
assert.equal(
  JSON.parse(asar.extractFile(archive, "package.json").toString()).version,
  pkg.version,
)
console.log(
  "Verified NSIS installer, SHA-512, blockmap, update feed, preload and native modules.",
)
