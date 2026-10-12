import * as stylex from "@stylexjs/stylex"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { styles } from "./AutomationStudio.styles"
import { InfoTooltip } from "../ui-kit"

function parseMidiList(value: string): number[] | null {
  const entries = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  if (entries.some((item) => !/^\d+$/.test(item) || Number(item) > 127)) return null
  return [...new Set(entries.map(Number))]
}

/** Renders a duration the way a person reads it, next to the raw millisecond input. */
function formatMilliseconds(milliseconds: number): string {
  if (!Number.isFinite(milliseconds)) return "—"
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`
  if (milliseconds >= 60000) {
    const minutes = milliseconds / 60000
    const rounded = Math.round(minutes * 10) / 10
    return `${String(rounded).replace(".", ",")} min`
  }
  const seconds = milliseconds / 1000
  const rounded = seconds >= 10 ? Math.round(seconds) : Math.round(seconds * 10) / 10
  return `${String(rounded).replace(".", ",")} s`
}

/** One themed block of related rules, so the panel reads as four questions, not nine inputs. */
function SettingsGroup({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section {...stylex.props(styles.settingsGroup)}>
      <div {...stylex.props(styles.groupHeading)}>
        <span {...stylex.props(styles.groupTitle)}>{title}</span>
        <InfoTooltip label={title} content={description} />
      </div>
      <div {...stylex.props(styles.settingsGrid)}>{children}</div>
    </section>
  )
}

function NumberField({
  label,
  unit,
  value,
  min,
  max,
  help,
  isDuration,
  isDisabled,
  onChange,
}: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  help: string
  /** Renders the value and the accepted range in seconds and minutes, not raw ms. */
  isDuration?: boolean
  isDisabled?: boolean
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const focusedRef = useRef(false)
  const fieldId = useId()
  const helpId = useId()
  const errorId = `${fieldId}-error`
  useEffect(() => {
    if (!focusedRef.current) setDraft(String(value))
  }, [value])
  const number = Number(draft)
  const invalid =
    !draft.trim() || !Number.isInteger(number) || number < min || number > max
  const range = isDuration
    ? `${formatMilliseconds(value)} · entre ${formatMilliseconds(min)} y ${formatMilliseconds(max)}`
    : `Entre ${min} y ${max} ${unit}`

  return (
    <div {...stylex.props(styles.field, isDisabled && styles.fieldDisabled)}>
      <div {...stylex.props(styles.fieldLabel)}>
        <span {...stylex.props(styles.fieldLabelCopy)}>
          <label htmlFor={fieldId}>{label}</label>
          <InfoTooltip
            label={label}
            content={help}
            detail={range}
            descriptionId={helpId}
          />
        </span>
      </div>
      <div
        {...stylex.props(
          styles.unitInputGroup,
          !isDisabled && invalid && styles.unitInputInvalid,
        )}
      >
        <input
          id={fieldId}
          type="number"
          min={min}
          max={max}
          disabled={isDisabled}
          {...stylex.props(styles.unitNumberInput)}
          required
          step={1}
          value={draft}
          aria-label={`${label} (${unit})`}
          aria-invalid={!isDisabled && invalid}
          aria-describedby={`${helpId}${!isDisabled && invalid ? ` ${errorId}` : ""}`}
          onFocus={() => {
            focusedRef.current = true
          }}
          onBlur={() => {
            focusedRef.current = false
          }}
          onChange={(event) => {
            setDraft(event.target.value)
            if (event.target.validity.valid) onChange(Number(event.target.value))
          }}
        />
        <span aria-hidden="true" {...stylex.props(styles.fieldUnit)}>
          {unit}
        </span>
      </div>
      {!isDisabled && invalid ? (
        <span
          id={errorId}
          role="alert"
          {...stylex.props(styles.fieldHelp, styles.fieldError)}
        >
          Introduce un número entero entre {min} y {max}.
        </span>
      ) : null}
    </div>
  )
}

function MidiListField({
  label,
  values,
  help,
  kind,
  onChange,
}: {
  label: string
  values: number[]
  help: string
  kind: "notas" | "CC"
  onChange: (values: number[]) => void
}) {
  const serialized = values.join(",")
  const [draft, setDraft] = useState(serialized)
  const focusedRef = useRef(false)
  const fieldId = useId()
  const helpId = useId()
  const errorId = `${fieldId}-error`
  const invalid = parseMidiList(draft) === null
  useEffect(() => {
    if (!focusedRef.current) setDraft(serialized)
  }, [serialized])
  return (
    <div {...stylex.props(styles.field)}>
      <div {...stylex.props(styles.fieldLabel)}>
        <span {...stylex.props(styles.fieldLabelCopy)}>
          <label htmlFor={fieldId}>{label}</label>
          <InfoTooltip
            label={label}
            content={help}
            detail={`${values.length === 0 ? "Ninguno" : `${values.length} en la lista`} · ${kind} 0–127`}
            descriptionId={helpId}
          />
        </span>
      </div>
      <input
        id={fieldId}
        {...stylex.props(styles.input)}
        value={draft}
        placeholder="Ej. 36,37"
        aria-invalid={invalid}
        aria-describedby={`${helpId}${invalid ? ` ${errorId}` : ""}`}
        onFocus={() => {
          focusedRef.current = true
        }}
        onChange={(event) => {
          const next = event.target.value
          const parsed = parseMidiList(next)
          event.target.setCustomValidity(
            parsed === null ? "Usa números enteros de 0 a 127 separados por comas." : "",
          )
          setDraft(next)
          if (parsed !== null) onChange(parsed)
        }}
        onBlur={() => {
          focusedRef.current = false
          const parsed = parseMidiList(draft)
          if (parsed !== null) setDraft(parsed.join(","))
        }}
      />
      {invalid ? (
        <span
          id={errorId}
          role="alert"
          {...stylex.props(styles.fieldHelp, styles.fieldError)}
        >
          Usa números enteros de 0 a 127 separados por comas.
        </span>
      ) : null}
    </div>
  )
}
export { SettingsGroup, NumberField, MidiListField }
