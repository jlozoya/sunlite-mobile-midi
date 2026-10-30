import type {
  AutomationMidiCommand,
  AutomationNoteGroup,
  AutomationTrainingExample,
} from "./automation-types.js"

export const DEFAULT_NOTE_GROUPS: AutomationNoteGroup[] = [
  {
    id: "scenes",
    name: "Escenas",
    notes: Array.from({ length: 32 }, (_, index) => index + 32),
  },
  { id: "laser-colors", name: "Colores de láseres", notes: [24, 25, 26, 16, 17, 18] },
  {
    id: "lighting-colors",
    name: "Colores de LED y estrobos",
    notes: [27, 28, 29, 19, 20, 21],
  },
  { id: "effects", name: "Estrobo y parpadeo", notes: [7, 6] },
]

export function normalizeNoteGroups(value: unknown): AutomationNoteGroup[] {
  const source = Array.isArray(value) ? value : DEFAULT_NOTE_GROUPS
  const usedNotes = new Set<number>(),
    usedIds = new Set<string>()
  return source.slice(0, 16).flatMap((item, index) => {
    if (!item || typeof item !== "object" || !Array.isArray(item.notes)) return []
    const id =
      typeof item.id === "string" && /^[\w-]{1,40}$/.test(item.id)
        ? item.id
        : `group-${index}`
    if (usedIds.has(id)) return []
    usedIds.add(id)
    const notes = item.notes.filter((note: unknown): note is number => {
      if (
        typeof note !== "number" ||
        !Number.isInteger(note) ||
        note < 0 ||
        note > 127 ||
        usedNotes.has(note)
      )
        return false
      usedNotes.add(note)
      return true
    })
    return [
      { id, name: typeof item.name === "string" ? item.name.slice(0, 80) : id, notes },
    ]
  })
}

export function actionGroupKey(
  command: AutomationMidiCommand,
  groups?: AutomationNoteGroup[],
): string {
  if (command.type === "cc") return `cc:${command.controller}`
  if (command.type === "program") return "program"
  const group = (groups ?? DEFAULT_NOTE_GROUPS).find((group) =>
    group.notes.includes(command.note),
  )
  return group ? `notes:${group.id}` : "notes:other"
}

export function groupNoteExamples(
  examples: AutomationTrainingExample[],
  groups?: AutomationNoteGroup[],
) {
  const result = new Map<string, AutomationTrainingExample[]>()
  for (const example of examples) {
    if (example.command.type === "cc" || example.command.type === "noteoff") continue
    const key = actionGroupKey(example.command, groups)
    const group = result.get(key) ?? []
    group.push(example)
    result.set(key, group)
  }
  return result
}
