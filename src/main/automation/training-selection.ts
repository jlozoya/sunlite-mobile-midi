import type { AutomationTrainingExample } from "../../shared/automation-types.js"

/** Keep different songs when a dense fader recording exceeds the model budget. */
export function selectTrainingExamples(
  examples: AutomationTrainingExample[],
  limit = 8000,
) {
  const ordered = [...examples].sort((a, b) => a.createdAt - b.createdAt)
  if (ordered.length <= limit) return ordered
  const sessions = new Map<string, AutomationTrainingExample[]>()
  for (const example of ordered) {
    const id = example.sessionId ?? "legacy"
    const group = sessions.get(id)
    if (group) group.push(example)
    else sessions.set(id, [example])
  }
  if (sessions.size === 1) return ordered.slice(-limit)
  const groups = [...sessions.values()]
    .sort((a, b) => a.at(-1)!.createdAt - b.at(-1)!.createdAt)
    .slice(-64)
  const quota = Math.floor(limit / groups.length)
  const selected = groups.flatMap((group) => {
    if (group.length <= quota) return group
    const stride = group.length / quota
    return Array.from(
      { length: quota },
      (_, index) => group[Math.min(group.length - 1, Math.floor((index + 0.5) * stride))],
    )
  })
  const remaining = limit - selected.length
  if (remaining > 0) {
    const used = new Set(selected)
    selected.push(
      ...groups
        .flat()
        .filter((example) => !used.has(example))
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(-remaining),
    )
  }
  return selected.sort((a, b) => a.createdAt - b.createdAt)
}
