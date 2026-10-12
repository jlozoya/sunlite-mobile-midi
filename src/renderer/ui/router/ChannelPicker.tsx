import * as stylex from "@stylexjs/stylex"
import { type ChannelSelection } from "../../../shared/router-types"
import { styles } from "./RouterPanel.styles"

/** Omni, or the individual channels a route accepts. */
function ChannelPicker({
  value,
  onChange,
}: {
  value: ChannelSelection
  onChange: (value: ChannelSelection) => void
}) {
  const isOmni = value === "omni"
  const selected = isOmni ? [] : value

  function toggle(channel: number) {
    const next = selected.includes(channel)
      ? selected.filter((entry) => entry !== channel)
      : [...selected, channel].sort((left, right) => left - right)
    onChange(next.length === 0 || next.length === 16 ? "omni" : next)
  }

  return (
    <div {...stylex.props(styles.chipRow)}>
      <button
        type="button"
        {...stylex.props(styles.chip, isOmni && styles.chipActive)}
        aria-pressed={isOmni}
        onClick={() => onChange("omni")}
      >
        Todos
      </button>
      {Array.from({ length: 16 }, (_, index) => index + 1).map((channel) => (
        <button
          key={channel}
          type="button"
          {...stylex.props(
            styles.chip,
            !isOmni && selected.includes(channel) && styles.chipActive,
          )}
          aria-label={`Canal ${channel}`}
          aria-pressed={!isOmni && selected.includes(channel)}
          onClick={() => toggle(channel)}
        >
          {channel}
        </button>
      ))}
    </div>
  )
}
export { ChannelPicker }
