import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { load } = require("js-yaml")
const asar = require("@electron/asar")
const pe = require("pe-library")
const resedit = require("resedit")
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
const executable = pe.NtExecutable.from(
  fs.readFileSync(path.join(dir, "win-unpacked", pkg.build.productName + ".exe")),
)
const executableResources = pe.NtExecutableResource.from(executable)
const versionInfo = resedit.Resource.VersionInfo.fromEntries(executableResources.entries)
assert.ok(
  versionInfo.some((info) =>
    info.getAllLanguagesForStringValues().some((language) => {
      const values = info.getStringValues(language)
      return (
        values.FileDescription === pkg.build.productName &&
        values.ProductName === pkg.build.productName
      )
    }),
  ),
  "Executable has incorrect app name or description",
)
const expectedIcons = resedit.Data.IconFile.from(
  fs.readFileSync(pkg.build.win.icon),
).icons.map((icon) => icon.data)
const iconBytes = (icon) => Buffer.from(icon.isRaw() ? icon.bin : icon.generate())
const iconGroups = resedit.Resource.IconGroupEntry.fromEntries(
  executableResources.entries,
)
assert.ok(
  iconGroups.some((group) => {
    const actualIcons = group.getIconItemsFromEntries(executableResources.entries)
    return (
      actualIcons.length === expectedIcons.length &&
      actualIcons.every((icon, index) =>
        iconBytes(icon).equals(iconBytes(expectedIcons[index])),
      )
    )
  }),
  "Executable is missing the configured app icon",
)
console.log(
  "Verified NSIS installer, checksum, update feed, native modules, app name and icon.",
)
