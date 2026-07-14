import fs from "node:fs"
import path from "node:path"
import type {
  AutomationSessionSummary,
  AutomationTimelineEvent,
  AutomationTrainingExample,
} from "../../shared/automation-types.js"

type StoredSessionMetadata = AutomationSessionSummary

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

  readTimeline(id: string, limit = 12000): AutomationTimelineEvent[] {
    const normalizedId = safeSessionId(id)
    if (!normalizedId) return []

    const filePath = this.eventsPath(normalizedId)
    if (!fs.existsSync(filePath)) return []

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean)
    const stride = Math.max(1, Math.ceil(lines.length / Math.max(1, limit)))
    const result: AutomationTimelineEvent[] = []

    for (let index = 0; index < lines.length; index += stride) {
      try {
        result.push(JSON.parse(lines[index]) as AutomationTimelineEvent)
      } catch {
        // A partial final JSONL line can be ignored if the application stopped unexpectedly.
      }
    }

    return result
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
