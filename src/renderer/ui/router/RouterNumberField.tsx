import * as stylex from "@stylexjs/stylex"
import { useEffect, useId, useRef, useState } from "react"
import { InfoTooltip } from "../ui-kit"
import { styles } from "./RouterPanel.styles"

export function RouterNumberField({
  label,
  help,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string
  help: string
  value: number
  min: number
  max: number
  unit?: string
  onChange: (value: number) => void
}) {
  const id = useId(),
    helpId = useId(),
    errorId = `${id}-error`
  const [draft, setDraft] = useState(String(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(String(value))
  }, [value])
  const invalid =
    !draft.trim() ||
    !Number.isInteger(Number(draft)) ||
    Number(draft) < min ||
    Number(draft) > max
  return (
    <div {...stylex.props(styles.field)}>
      <div {...stylex.props(styles.labelRow)}>
        <label htmlFor={id} {...stylex.props(styles.fieldLabel)}>
          {label}
        </label>
        <InfoTooltip
          label={label}
          content={help}
          detail={`Entre ${min} y ${max}${unit ? ` ${unit}` : ""}.`}
          descriptionId={helpId}
        />
      </div>
      <div {...stylex.props(styles.unitControl, invalid && styles.inputInvalid)}>
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          step={1}
          required
          value={draft}
          aria-label={`${label}${unit ? ` (${unit})` : ""}`}
          aria-invalid={invalid}
          aria-describedby={`${helpId}${invalid ? ` ${errorId}` : ""}`}
          {...stylex.props(styles.unitNumberInput)}
          onFocus={() => {
            focused.current = true
          }}
          onBlur={() => {
            focused.current = false
          }}
          onChange={(event) => {
            setDraft(event.target.value)
            if (event.target.validity.valid) onChange(Number(event.target.value))
          }}
        />
        {unit ? (
          <span aria-hidden="true" {...stylex.props(styles.unitSuffix)}>
            {unit}
          </span>
        ) : null}
      </div>
      {invalid ? (
        <span id={errorId} role="alert" {...stylex.props(styles.fieldError)}>
          Introduce un entero entre {min} y {max}.
        </span>
      ) : null}
    </div>
  )
}
