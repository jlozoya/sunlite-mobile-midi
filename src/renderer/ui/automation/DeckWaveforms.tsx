import * as stylex from "@stylexjs/stylex"
import { useEffect, useRef } from "react"
import type { DjLinkWaveform } from "../../../shared/automation-types"

type Props = {
  waveforms: DjLinkWaveform[]
}

function formatTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

function WaveformCanvas({ waveform }: { waveform: DjLinkWaveform }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")
    if (!canvas || !context) return

    const { width, height } = canvas
    context.fillStyle = "#060912"
    context.fillRect(0, 0, width, height)

    const count = Math.max(1, waveform.heights.length)
    const columnWidth = width / count
    for (let index = 0; index < waveform.heights.length; index += 1) {
      const normalizedHeight = waveform.heights[index] / 255
      const barHeight = Math.max(1, normalizedHeight * (height - 12))
      const [red, green, blue] = waveform.colors[index] ?? [34, 211, 238]
      context.fillStyle = `rgb(${red} ${green} ${blue})`
      context.fillRect(
        index * columnWidth,
        (height - barHeight) / 2,
        Math.max(1, columnWidth + 0.35),
        barHeight,
      )
    }

    const durationMs = Math.max(1, waveform.durationSeconds * 1000)
    const playheadX = Math.max(
      0,
      Math.min(width - 1, (waveform.positionMs / durationMs) * width),
    )
    context.fillStyle = "rgba(255, 255, 255, 0.92)"
    context.fillRect(playheadX - 1, 0, 2, height)
    context.fillStyle = "rgba(255, 255, 255, 0.18)"
    context.fillRect(0, height / 2, width, 1)
  }, [waveform])

  return (
    <canvas
      ref={canvasRef}
      width={1200}
      height={118}
      aria-label={`Waveform del deck ${waveform.deviceNumber}: ${waveform.title}`}
      {...stylex.props(styles.canvas)}
    />
  )
}

export function DeckWaveforms({ waveforms }: Props) {
  const ordered = [...waveforms].sort((left, right) => {
    const score = (waveform: DjLinkWaveform) =>
      Number(waveform.isOnAir) * 4 +
      Number(waveform.isPlaying) * 2 +
      Number(waveform.isMaster)
    return score(right) - score(left) || left.deviceNumber - right.deviceNumber
  })

  return (
    <section {...stylex.props(styles.panel)}>
      <div {...stylex.props(styles.heading)}>
        <div>
          <span {...stylex.props(styles.eyebrow)}>PRO DJ LINK</span>
          <strong>Waveforms de los decks</strong>
        </div>
        <span {...stylex.props(styles.count)}>
          {ordered.length} waveform{ordered.length === 1 ? "" : "s"}
        </span>
      </div>

      {ordered.length ? (
        <div {...stylex.props(styles.grid)}>
          {ordered.map((waveform) => (
            <article
              key={`${waveform.deviceNumber}:${waveform.trackId}`}
              {...stylex.props(styles.deck, waveform.isOnAir && styles.deckActive)}
            >
              <div {...stylex.props(styles.deckHeading)}>
                <div {...stylex.props(styles.titleGroup)}>
                  <strong>Deck {waveform.deviceNumber}</strong>
                  <span {...stylex.props(styles.title)}>{waveform.title}</span>
                </div>
                <div {...stylex.props(styles.badges)}>
                  {waveform.isOnAir ? (
                    <span {...stylex.props(styles.onAirBadge)}>ON AIR</span>
                  ) : null}
                  {waveform.isMaster ? (
                    <span {...stylex.props(styles.masterBadge)}>MASTER</span>
                  ) : null}
                </div>
              </div>
              <WaveformCanvas waveform={waveform} />
              <div {...stylex.props(styles.timeRow)}>
                <span>{formatTime(waveform.positionMs)}</span>
                <span>{formatTime(waveform.durationSeconds * 1000)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div {...stylex.props(styles.empty)}>
          <strong>Para recibir waveforms</strong>
          <span>
            Conecta el PC y los CDJ al mismo switch Ethernet, carga un track analizado por
            rekordbox y pulsa Play en el deck.
          </span>
        </div>
      )}
    </section>
  )
}

const styles = stylex.create({
  panel: {
    marginTop: "12px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(34, 211, 238, 0.18)",
    borderRadius: "18px",
    backgroundColor: "rgba(7, 12, 24, 0.72)",
    padding: "14px",
  },
  heading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "11px",
  },
  eyebrow: {
    display: "block",
    marginBottom: "3px",
    color: "#22d3ee",
    fontSize: "0.64rem",
    fontWeight: 900,
    letterSpacing: "0.1em",
  },
  count: {
    color: "#94a3b8",
    fontSize: "0.76rem",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
    gap: "10px",
  },
  deck: {
    minWidth: 0,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: "14px",
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    padding: "11px",
  },
  deckActive: {
    borderColor: "rgba(34, 211, 238, 0.42)",
    boxShadow: "0 0 24px rgba(34, 211, 238, 0.08)",
  },
  deckHeading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "8px",
  },
  titleGroup: {
    display: "flex",
    alignItems: "baseline",
    gap: "8px",
    minWidth: 0,
  },
  title: {
    overflow: "hidden",
    color: "#94a3b8",
    fontSize: "0.76rem",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  badges: { display: "flex", gap: "5px", flexShrink: 0 },
  onAirBadge: {
    borderRadius: "999px",
    backgroundColor: "rgba(239, 68, 68, 0.16)",
    color: "#fca5a5",
    padding: "3px 7px",
    fontSize: "0.62rem",
    fontWeight: 900,
  },
  masterBadge: {
    borderRadius: "999px",
    backgroundColor: "rgba(245, 158, 11, 0.16)",
    color: "#fcd34d",
    padding: "3px 7px",
    fontSize: "0.62rem",
    fontWeight: 900,
  },
  canvas: {
    display: "block",
    width: "100%",
    height: "82px",
    borderRadius: "9px",
  },
  timeRow: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: "5px",
    color: "#64748b",
    fontSize: "0.68rem",
    fontVariantNumeric: "tabular-nums",
  },
  empty: {
    display: "grid",
    gap: "5px",
    borderRadius: "12px",
    backgroundColor: "rgba(15, 23, 42, 0.54)",
    color: "#64748b",
    padding: "18px",
    textAlign: "center",
    fontSize: "0.82rem",
  },
})
