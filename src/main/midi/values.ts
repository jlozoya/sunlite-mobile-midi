function clampMidiValue(value: unknown): number {
  const numericValue = Number(value)

  if (Number.isNaN(numericValue)) {
    return 0
  }

  return Math.max(0, Math.min(127, Math.round(numericValue)))
}
export { clampMidiValue }
