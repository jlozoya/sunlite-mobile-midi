import assert from "node:assert/strict"
import fs from "node:fs"
import { execFileSync } from "node:child_process"
import { pathToFileURL } from "node:url"

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export function planRelease({
  version,
  eventName,
  ref,
  defaultBranch,
  publish,
  releases,
}) {
  assert.match(version, stableVersion, "Only stable x.y.z versions can be published")
  const tag = `v${version}`
  const tagged = ref.startsWith("refs/tags/")
  if (tagged) assert.equal(ref, `refs/tags/${tag}`, "Tag must match package.json version")
  const requested =
    (eventName === "push" && (tagged || ref === `refs/heads/${defaultBranch}`)) ||
    (eventName === "workflow_dispatch" && publish === true)
  if (!requested) return { tag, publish: false, build: true }
  assert.ok(
    tagged || ref === `refs/heads/${defaultBranch}`,
    "Publish from the default branch or a version tag",
  )
  if (releases.some((release) => release.tagName === tag && !release.isDraft)) {
    return { tag, publish: false, build: false }
  }
  const parts = version.split(".").map(BigInt)
  for (const release of releases) {
    const previous = release.tagName?.slice(1)
    if (
      release.isDraft ||
      !release.tagName.startsWith("v") ||
      !stableVersion.test(previous)
    )
      continue
    const other = previous.split(".").map(BigInt)
    const different = parts.findIndex((part, index) => part !== other[index])
    assert.ok(
      different === -1 || parts[different] > other[different],
      `Version ${version} is older than published ${previous}`,
    )
  }
  return { tag, publish: true, build: true }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"))
  const { version } = JSON.parse(fs.readFileSync("package.json", "utf8"))
  // Fail on API/authentication errors rather than mistaking them for a missing release.
  const releases = JSON.parse(
    execFileSync(
      "gh",
      [
        "release",
        "list",
        "--repo",
        process.env.GITHUB_REPOSITORY,
        "--limit",
        "10000",
        "--json",
        "tagName,isDraft",
      ],
      { encoding: "utf8" },
    ),
  )
  const plan = planRelease({
    version,
    eventName: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF,
    defaultBranch: event.repository.default_branch,
    publish: event.inputs?.publish === "true" || event.inputs?.publish === true,
    releases,
  })
  if (plan.publish) {
    const tags = execFileSync("git", ["tag", "--list", plan.tag], {
      encoding: "utf8",
    }).trim()
    if (tags) {
      const target = execFileSync("git", ["rev-parse", `${plan.tag}^{commit}`], {
        encoding: "utf8",
      }).trim()
      const current = execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim()
      assert.equal(target, current, "Existing version tag points to another commit")
    }
  }
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(plan)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(""),
  )
  console.log(plan)
}
