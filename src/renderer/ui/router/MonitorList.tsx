import * as stylex from "@stylexjs/stylex"
import { type RouterMonitorEvent } from "../../../shared/router-types"
import { styles } from "./RouterPanel.styles"

function formatTime(at: number): string {
  const date = new Date(at)
  return `${date.toTimeString().slice(0, 8)}.${String(date.getMilliseconds()).padStart(3, "0")}`
}

function MonitorList({ events }: { events: RouterMonitorEvent[] }) {
  if (events.length === 0) {
    return (
      <span {...stylex.props(styles.emptyText)}>
        Sin actividad todavía. Arranca el router y toca algo en el dispositivo.
      </span>
    )
  }

  return (
    <div {...stylex.props(styles.monitor)}>
      {events
        .slice()
        .reverse()
        .map((event, index) => (
          <div key={`${event.at}-${index}`} {...stylex.props(styles.monitorRow)}>
            <span {...stylex.props(styles.monitorTime)}>{formatTime(event.at)}</span>
            <span
              {...stylex.props(
                styles.monitorDirection,
                event.direction === "out" && styles.monitorOut,
              )}
            >
              {event.direction === "in" ? "IN" : "OUT"}
            </span>
            <span {...stylex.props(styles.monitorPort)}>{event.portId}</span>
            <span {...stylex.props(styles.monitorChannel)}>
              {event.channel === null ? "—" : `CH ${event.channel}`}
            </span>
            <span {...stylex.props(styles.monitorText)}>{event.text}</span>
          </div>
        ))}
    </div>
  )
}
export { MonitorList }
