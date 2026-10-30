import type {
  AutomationMidiCommand,
  AutomationSettings,
} from "../../shared/automation-types.js"

function key(command: AutomationMidiCommand) {
  return command.type === "cc"
    ? `cc:${command.controller}:${command.value}`
    : command.type === "program"
      ? `program:${command.number}`
      : `${command.type}:${command.note}`
}

export class AutomationSafety {
  private lastActionAt = 0
  private lastActionTimes = new Map<string, number>()
  private lastStrobeAt = 0
  private controllers = new Map<number, { at: number; value: number }>()

  block(
    command: AutomationMidiCommand,
    now: number,
    settings: AutomationSettings,
  ): string | null {
    if (command.type === "cc") {
      if (settings.blockedControllers.includes(command.controller))
        return "control continuo protegido"
      const last = this.controllers.get(command.controller)
      if (last && last.value === command.value) return "fader sin cambios"
      if (last && now - last.at < (settings.minControllerIntervalMs ?? 100))
        return "intervalo mínimo del fader"
    } else if (now - this.lastActionAt < settings.minActionIntervalMs)
      return "intervalo mínimo entre acciones"
    const at = this.lastActionTimes.get(key(command))
    if (
      command.type !== "cc" &&
      at !== undefined &&
      now - at < settings.repeatActionCooldownMs
    )
      return "acción repetida demasiado pronto"
    if (command.type === "note" || command.type === "noteon") {
      if (settings.blockedNotes.includes(command.note)) return "nota protegida"
      if (
        settings.strobeNotes.includes(command.note) &&
        now - this.lastStrobeAt < settings.strobeCooldownMs
      )
        return "strobe en cooldown"
    }
    return null
  }

  executed(command: AutomationMidiCommand, now: number, settings: AutomationSettings) {
    if (command.type === "cc")
      this.controllers.set(command.controller, { at: now, value: command.value })
    else this.lastActionAt = now
    this.lastActionTimes.set(key(command), now)
    for (const [action, at] of this.lastActionTimes)
      if (now - at >= settings.repeatActionCooldownMs) this.lastActionTimes.delete(action)
    if (
      (command.type === "note" || command.type === "noteon") &&
      settings.strobeNotes.includes(command.note)
    )
      this.lastStrobeAt = now
  }

  /** Rate-limit jumps while continuing to interpolate toward the learned controller target. */
  smooth(command: AutomationMidiCommand, now: number): AutomationMidiCommand {
    if (command.type !== "cc") return command
    const last = this.controllers.get(command.controller)
    if (!last) return command
    const step = Math.max(
      1,
      Math.round((127 * Math.min(250, Math.max(0, now - last.at))) / 600),
    )
    return {
      ...command,
      value: Math.max(last.value - step, Math.min(last.value + step, command.value)),
    }
  }

  manual(command: AutomationMidiCommand, now: number) {
    if (command.type === "cc")
      this.controllers.set(command.controller, { at: now, value: command.value })
  }
}
