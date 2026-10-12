import assert from "node:assert/strict"
import test from "node:test"
import { planRelease } from "../scripts/plan-release.mjs"

const input = {
  version: "0.4.0",
  eventName: "push",
  ref: "refs/heads/master",
  defaultBranch: "master",
  publish: false,
  releases: [],
}

test("default branch version is built and published automatically", () => {
  assert.deepEqual(planRelease(input), { tag: "v0.4.0", publish: true, build: true })
})

test("published version is skipped; draft is resumed", () => {
  assert.equal(
    planRelease({ ...input, releases: [{ tagName: "v0.4.0", isDraft: false }] }).build,
    false,
  )
  assert.equal(
    planRelease({ ...input, releases: [{ tagName: "v0.4.0", isDraft: true }] }).publish,
    true,
  )
})

test("manual builds only publish when requested on the default branch", () => {
  assert.deepEqual(planRelease({ ...input, eventName: "workflow_dispatch" }), {
    tag: "v0.4.0",
    publish: false,
    build: true,
  })
  assert.equal(
    planRelease({ ...input, eventName: "workflow_dispatch", publish: true }).publish,
    true,
  )
  assert.throws(() =>
    planRelease({
      ...input,
      eventName: "workflow_dispatch",
      publish: true,
      ref: "refs/heads/feature",
    }),
  )
})

test("version tags must match the stable package version", () => {
  assert.equal(planRelease({ ...input, ref: "refs/tags/v0.4.0" }).publish, true)
  assert.throws(() => planRelease({ ...input, ref: "refs/tags/v0.3.0" }))
  for (const version of ["0.4.0-beta.1", "01.2.3", "invalid"])
    assert.throws(() => planRelease({ ...input, version }))
})

test("older releases cannot replace the latest stable release", () => {
  const releases = [{ tagName: "v0.10.0", isDraft: false }]
  assert.throws(() => planRelease({ ...input, releases }))
  assert.equal(planRelease({ ...input, version: "1.0.0", releases }).publish, true)
})
