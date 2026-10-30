import type {
  AutomationIdleContext,
  AutomationSessionSummary,
  AutomationTimelineEvent,
  AutomationTrainingExample,
  MusicalContext,
} from "../../shared/automation-types.js"
import { MusicalContextTracker, isMusicalContext } from "../../shared/musical-context.js"

export function buildTrainingDataset(
  sessions: AutomationSessionSummary[],
  read: (id: string) => AutomationTimelineEvent[],
  excluded: Set<string>,
) {
  const examples: AutomationTrainingExample[] = []
  const idle: AutomationIdleContext[] = []
  for (const session of [...sessions].sort((a, b) =>
    a.startedAt.localeCompare(b.startedAt),
  )) {
    const events = read(session.id).sort((a, b) => a.t - b.t)
    const trackers = new Map<string, MusicalContextTracker>()
    const snapshots = new Map<string, { at: number; context: MusicalContext | null }>()
    const actions = events.filter(
      (event) => event.example && !excluded.has(event.example.id),
    )
    const sessionIdle: Array<AutomationIdleContext & { at: number }> = []
    let bpm = 120,
      lastIdleAt = -Infinity
    for (const event of events) {
      if (event.beat?.bpm) bpm = event.beat.bpm
      const source = event.inputSource ?? "audio"
      const features =
        event.kind === "audio"
          ? event.frame?.features
          : event.kind === "context"
            ? event.features
            : undefined
      if (features) {
        const tracker = trackers.get(source) ?? new MusicalContextTracker()
        trackers.set(source, tracker)
        const derived = tracker.push(features, event.t, bpm)
        const context = isMusicalContext(event.context) ? event.context : derived
        snapshots.set(source, { at: event.t, context })
        if (
          context &&
          event.t - lastIdleAt >= 500 &&
          !actions.some((action) => Math.abs(action.t - event.t) < 400)
        ) {
          sessionIdle.push({ at: event.t, context, sessionId: session.id })
          lastIdleAt = event.t
        }
      }
      if (event.kind !== "example" || !event.example || excluded.has(event.example.id))
        continue
      const snapshot = snapshots.get(source)
      const context = isMusicalContext(event.example.context)
        ? event.example.context
        : snapshot && event.t - snapshot.at <= 2500
          ? snapshot.context
          : null
      examples.push({
        ...event.example,
        inputSource: source,
        sessionId: session.id,
        context: context ?? undefined,
      })
    }
    const stride = Math.max(1, Math.ceil(sessionIdle.length / 400))
    idle.push(
      ...sessionIdle
        .filter((_, index) => index % stride === 0)
        .map(({ context, sessionId }) => ({ context, sessionId })),
    )
  }
  return { examples, idle }
}
