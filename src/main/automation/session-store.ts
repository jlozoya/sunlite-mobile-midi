import fs from "node:fs"
import path from "node:path"
import type {
  AutomationMidiCommand,
  AutomationSessionSummary,
  AutomationTimelineEvent,
  AutomationTrainingExample,
} from "../../shared/automation-types.js"

type StoredSessionMetadata = AutomationSessionSummary

export type TrainingExampleEdit = {
  id: string
  t?: number
  value?: number
  delete?: boolean
  create?: boolean
  controller?: number
}

function safeSessionId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "")
}

function sanitizeName(value: unknown): string {
  if (typeof value !== "string") return "Lighting session"
  const trimmed = value.trim().replace(/[\r\n\t]+/g, " ")
  return trimmed.slice(0, 80) || "Lighting session"
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T
  } catch {
    return null
  }
}

function commandsMatch(
  left: AutomationMidiCommand | undefined,
  right: AutomationMidiCommand | undefined,
): boolean {
  if (!left || !right || left.type !== right.type) return false
  if (left.type === "cc" && right.type === "cc") {
    return left.controller === right.controller && left.value === right.value
  }
  if (
    (left.type === "note" || left.type === "noteon" || left.type === "noteoff") &&
    (right.type === "note" || right.type === "noteon" || right.type === "noteoff")
  ) {
    return left.note === right.note
  }
  if (left.type === "program" && right.type === "program") {
    return left.number === right.number
  }
  return false
}

function nearestEvent<T extends AutomationTimelineEvent>(
  events: T[],
  t: number,
): T | undefined {
  return events.reduce<T | undefined>((nearest, event) => {
    if (!nearest) return event
    return Math.abs(event.t - t) < Math.abs(nearest.t - t) ? event : nearest
  }, undefined)
}

export class AutomationSessionStore {
  private readonly root: string
  private readonly exclusionsPath: string
  private active: StoredSessionMetadata | null = null
  private activeStartedAtMs = 0

  constructor(root: string) {
    this.root = root
    this.exclusionsPath = path.join(this.root, "excluded-examples.json")
    fs.mkdirSync(this.root, { recursive: true })
  }

  start(name: unknown): AutomationSessionSummary {
    if (this.active) return { ...this.active }

    const now = new Date()
    const id = `${now.toISOString().replace(/[:.]/g, "-")}-${Math.random()
      .toString(36)
      .slice(2, 8)}`

    this.activeStartedAtMs = now.getTime()
    this.active = {
      id,
      name: sanitizeName(name),
      startedAt: now.toISOString(),
      endedAt: null,
      durationMs: 0,
      audioFrameCount: 0,
      midiEventCount: 0,
      trainingExampleCount: 0,
    }

    fs.writeFileSync(this.eventsPath(id), "", "utf8")
    this.saveActiveMetadata()
    return { ...this.active }
  }

  append(event: AutomationTimelineEvent): void {
    if (!this.active) return

    fs.appendFileSync(
      this.eventsPath(this.active.id),
      `${JSON.stringify(event)}\n`,
      "utf8",
    )

    if (event.kind === "audio") this.active.audioFrameCount += 1
    if (event.kind === "midi") this.active.midiEventCount += 1
    if (event.kind === "example") this.active.trainingExampleCount += 1
    this.active.durationMs = Math.max(0, Date.now() - this.activeStartedAtMs)

    const totalEvents =
      this.active.audioFrameCount +
      this.active.midiEventCount +
      this.active.trainingExampleCount
    if (totalEvents % 20 === 0) this.saveActiveMetadata()
  }

  stop(): AutomationSessionSummary | null {
    if (!this.active) return null

    this.active.endedAt = new Date().toISOString()
    this.active.durationMs = Math.max(0, Date.now() - this.activeStartedAtMs)
    this.saveActiveMetadata()

    const stopped = { ...this.active }
    this.active = null
    this.activeStartedAtMs = 0
    return stopped
  }

  getActive(): AutomationSessionSummary | null {
    if (!this.active) return null
    return {
      ...this.active,
      durationMs: Math.max(this.active.durationMs, Date.now() - this.activeStartedAtMs),
    }
  }

  list(): AutomationSessionSummary[] {
    return fs
      .readdirSync(this.root, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".meta.json"))
      .map((entry) =>
        readJsonFile<StoredSessionMetadata>(path.join(this.root, entry.name)),
      )
      .filter((item): item is StoredSessionMetadata => Boolean(item))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }

  rename(id: string, name: unknown): AutomationSessionSummary {
    const normalizedId = safeSessionId(id)
    if (!normalizedId) throw new Error("Invalid training session id")

    if (this.active?.id === normalizedId) {
      this.active.name = sanitizeName(name)
      this.saveActiveMetadata()
      return { ...this.active }
    }

    const metadataPath = this.metadataPath(normalizedId)
    const session = readJsonFile<StoredSessionMetadata>(metadataPath)
    if (!session) throw new Error("Training session not found")

    const renamed = { ...session, name: sanitizeName(name) }
    fs.writeFileSync(metadataPath, JSON.stringify(renamed, null, 2), "utf8")
    return renamed
  }

  delete(id: string): void {
    const normalizedId = safeSessionId(id)
    if (!normalizedId) throw new Error("Invalid training session id")
    if (this.active?.id === normalizedId) {
      throw new Error("Stop the active training session before deleting it")
    }

    const metadataPath = this.metadataPath(normalizedId)
    const eventsPath = this.eventsPath(normalizedId)
    if (!fs.existsSync(metadataPath) && !fs.existsSync(eventsPath)) {
      throw new Error("Training session not found")
    }
    if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath)
    if (fs.existsSync(eventsPath)) fs.unlinkSync(eventsPath)
  }

  readTimeline(id: string, limit = 12000): AutomationTimelineEvent[] {
    const normalizedId = safeSessionId(id)
    if (!normalizedId) return []

    const filePath = this.eventsPath(normalizedId)
    if (!fs.existsSync(filePath)) return []

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean)
    const allEvents: AutomationTimelineEvent[] = []
    for (const line of lines) {
      try {
        allEvents.push(JSON.parse(line) as AutomationTimelineEvent)
      } catch {
        // A partial final JSONL line can be ignored if the application stopped unexpectedly.
      }
    }
    if (allEvents.length <= limit) return allEvents

    const important = allEvents.filter(
      (event) => event.kind !== "audio" && event.kind !== "position",
    )
    const background = allEvents.filter(
      (event) => event.kind === "audio" || event.kind === "position",
    )
    const remaining = Math.max(1, limit - important.length)
    const stride = Math.max(1, Math.ceil(background.length / remaining))
    return [...important, ...background.filter((_, index) => index % stride === 0)].sort(
      (left, right) => left.t - right.t,
    )
  }

  updateTrainingExamples(
    id: string,
    edits: TrainingExampleEdit[],
  ): AutomationTimelineEvent[] {
    const normalizedId = safeSessionId(id)
    if (!normalizedId || !Array.isArray(edits) || !edits.length) {
      throw new Error("Invalid training example edits")
    }
    const metadata = readJsonFile<StoredSessionMetadata>(this.metadataPath(normalizedId))
    if (!metadata) throw new Error("Training session not found")

    const timeline = this.readTimeline(normalizedId, Number.MAX_SAFE_INTEGER)
    const editMap = new Map(
      edits.slice(0, 2000).map((edit) => [edit.id.replace(/[^a-zA-Z0-9_-]/g, ""), edit]),
    )
    const audioEvents = timeline.filter((event) => event.kind === "audio" && event.frame)
    const beatEvents = timeline.filter((event) => event.kind === "beat" && event.beat)
    const exampleEvents = timeline.filter(
      (event) => event.kind === "example" && event.example,
    )
    const usedMidiIndexes = new Set<number>()
    const deletedEvents = new Set<AutomationTimelineEvent>()
    const sessionStart = new Date(metadata.startedAt).getTime()
    const sessionDuration = Math.max(
      metadata.durationMs,
      ...timeline.map((event) => event.t),
    )
    let updated = 0

    const findMidiIndex = (oldT: number, command: AutomationMidiCommand) => {
      let midiIndex = -1
      let distance = Infinity
      for (let index = 0; index < timeline.length; index += 1) {
        const candidate = timeline[index]
        if (
          usedMidiIndexes.has(index) ||
          candidate.kind !== "midi" ||
          !commandsMatch(candidate.command, command)
        ) {
          continue
        }
        const candidateDistance = Math.abs(candidate.t - oldT)
        if (candidateDistance < distance) {
          midiIndex = index
          distance = candidateDistance
        }
      }
      return distance <= 500 ? midiIndex : -1
    }

    const contextAt = (t: number, excluded?: AutomationTimelineEvent) =>
      nearestEvent(audioEvents, t)?.frame?.features ??
      nearestEvent(
        exampleEvents.filter(
          (candidate) => candidate !== excluded && !deletedEvents.has(candidate),
        ),
        t,
      )?.example?.features

    for (const event of exampleEvents) {
      const exampleId = event.example?.id ?? ""
      const edit = editMap.get(exampleId)
      if (!edit || !event.example) continue

      const oldT = event.t
      const oldCommand = { ...event.example.command }
      const midiIndex = findMidiIndex(oldT, oldCommand)
      if (edit.delete) {
        deletedEvents.add(event)
        if (midiIndex >= 0) {
          usedMidiIndexes.add(midiIndex)
          deletedEvents.add(timeline[midiIndex])
        }
        updated += 1
        editMap.delete(exampleId)
        continue
      }
      const t = Number.isFinite(edit.t)
        ? Math.max(0, Math.min(sessionDuration, Number(edit.t)))
        : oldT
      const command =
        oldCommand.type === "cc" && Number.isFinite(edit.value)
          ? { ...oldCommand, value: Math.max(0, Math.min(127, Math.round(edit.value!))) }
          : oldCommand
      const context = contextAt(t, event) ?? event.example.features
      const beat = nearestEvent(beatEvents, t)?.beat

      event.t = t
      event.at = new Date(sessionStart + t).toISOString()
      event.command = command
      event.features = { ...context }
      event.beatWithinBar = beat?.beatWithinBar ?? event.beatWithinBar ?? 0
      event.bpm = beat?.bpm ?? event.bpm ?? 0
      event.example = {
        ...event.example,
        createdAt: sessionStart + t,
        features: { ...context },
        beatWithinBar: event.beatWithinBar,
        bpm: event.bpm,
        command,
      }

      if (midiIndex >= 0) {
        const midiEvent = timeline[midiIndex]
        usedMidiIndexes.add(midiIndex)
        midiEvent.t = t
        midiEvent.at = new Date(sessionStart + t).toISOString()
        midiEvent.command = command
      }
      updated += 1
      editMap.delete(exampleId)
    }

    for (const [exampleId, edit] of editMap) {
      if (
        !edit.create ||
        !Number.isFinite(edit.controller) ||
        !Number.isFinite(edit.value)
      ) {
        continue
      }
      const t = Math.max(0, Math.min(sessionDuration, Number(edit.t ?? 0)))
      const controller = Math.max(0, Math.min(127, Math.round(edit.controller!)))
      const value = Math.max(0, Math.min(127, Math.round(edit.value!)))
      const command: AutomationMidiCommand = { type: "cc", controller, value }
      const context = contextAt(t)
      if (!context) continue
      const beat = nearestEvent(beatEvents, t)?.beat
      const at = new Date(sessionStart + t).toISOString()
      const example: AutomationTrainingExample = {
        id: exampleId,
        createdAt: sessionStart + t,
        features: { ...context },
        beatWithinBar: beat?.beatWithinBar ?? 0,
        bpm: beat?.bpm ?? 0,
        command,
      }
      timeline.push(
        { t, at, kind: "midi", source: "manual", command },
        {
          t,
          at,
          kind: "example",
          command,
          features: example.features,
          beatWithinBar: example.beatWithinBar,
          bpm: example.bpm,
          example,
        },
      )
      updated += 1
    }

    if (!updated) throw new Error("Training examples not found")
    const nextTimeline = timeline
      .filter((event) => !deletedEvents.has(event))
      .sort((left, right) => left.t - right.t)
    fs.writeFileSync(
      this.eventsPath(normalizedId),
      `${nextTimeline.map((event) => JSON.stringify(event)).join("\n")}\n`,
      "utf8",
    )
    fs.writeFileSync(
      this.metadataPath(normalizedId),
      JSON.stringify(
        {
          ...metadata,
          audioFrameCount: nextTimeline.filter((event) => event.kind === "audio").length,
          midiEventCount: nextTimeline.filter((event) => event.kind === "midi").length,
          trainingExampleCount: nextTimeline.filter((event) => event.kind === "example")
            .length,
        },
        null,
        2,
      ),
      "utf8",
    )
    return this.readTimeline(normalizedId)
  }

  readTrainingExamples(): AutomationTrainingExample[] {
    const examples: AutomationTrainingExample[] = []
    const excluded = new Set(
      readJsonFile<string[]>(this.exclusionsPath)?.filter(
        (item): item is string => typeof item === "string",
      ) ?? [],
    )

    for (const session of this.list()) {
      const filePath = this.eventsPath(session.id)
      if (!fs.existsSync(filePath)) continue

      const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/)
      for (const line of lines) {
        if (!line || !line.includes('"kind":"example"')) continue
        try {
          const event = JSON.parse(line) as AutomationTimelineEvent & {
            example?: AutomationTrainingExample
          }
          if (event.example && !excluded.has(event.example.id))
            examples.push(event.example)
        } catch {
          // Ignore malformed or interrupted lines and continue loading the dataset.
        }
      }
    }

    return examples
  }

  excludeTrainingExample(id: string): void {
    const normalized = id.replace(/[^a-zA-Z0-9_-]/g, "")
    if (!normalized) throw new Error("Invalid training example id")
    const current = new Set(readJsonFile<string[]>(this.exclusionsPath) ?? [])
    current.add(normalized)
    fs.writeFileSync(this.exclusionsPath, JSON.stringify([...current], null, 2), "utf8")
  }

  private eventsPath(id: string): string {
    return path.join(this.root, `${safeSessionId(id)}.jsonl`)
  }

  private metadataPath(id: string): string {
    return path.join(this.root, `${safeSessionId(id)}.meta.json`)
  }

  private saveActiveMetadata(): void {
    if (!this.active) return
    fs.writeFileSync(
      this.metadataPath(this.active.id),
      JSON.stringify(this.active, null, 2),
      "utf8",
    )
  }
}
