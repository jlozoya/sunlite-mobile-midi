import * as stylex from "@stylexjs/stylex"
import {
  ALL_MESSAGE_CLASSES,
  MESSAGE_CLASS_LABELS,
  type MessageClass,
} from "../../../shared/router-types"
import { styles } from "./RouterPanel.styles"

function ClassPicker({
  value,
  onChange,
}: {
  value: MessageClass[]
  onChange: (value: MessageClass[]) => void
}) {
  return (
    <div {...stylex.props(styles.chipRow)}>
      {ALL_MESSAGE_CLASSES.map((entry) => {
        const isActive = value.includes(entry)
        return (
          <button
            key={entry}
            type="button"
            {...stylex.props(styles.chip, isActive && styles.chipActive)}
            aria-pressed={isActive}
            onClick={() =>
              onChange(
                isActive ? value.filter((item) => item !== entry) : [...value, entry],
              )
            }
          >
            {MESSAGE_CLASS_LABELS[entry]}
          </button>
        )
      })}
    </div>
  )
}
export { ClassPicker }
