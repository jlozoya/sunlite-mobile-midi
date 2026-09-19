import * as stylex from "@stylexjs/stylex"
import { useEffect, useRef, useState } from "react"
import type {
  FaderCustomization,
  MidiFaderConfig,
} from "../../../shared/controller-config.ts"
import type { MidiCommand } from "../types"

export type FaderStripProps = {
  fader: MidiFaderConfig
  config: FaderCustomization | undefined
  feedbackValue: number | undefined
  sendCommand: (command: MidiCommand) => void
  isMobileView: boolean
  isDisabled?: boolean
  onEdit: () => void
}

export function FaderStrip({
  fader,
  config,
  feedbackValue,
  sendCommand,
  isMobileView,
  isDisabled = false,
  onEdit,
}: FaderStripProps) {
  const resolvedConfig = config ?? {
    label: fader.label,
    controller: fader.controller,
    minValue: 0,
    maxValue: 127,
    defaultValue: fader.defaultValue,
  }
  const standardController = fader.controller
  const [value, setValue] = useState(resolvedConfig.defaultValue)
  const valueRef = useRef(value)
  const lastSentValueRef = useRef<number | null>(null)
  const activePointerRef = useRef<number | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)

  const minValue = resolvedConfig.minValue
  const maxValue = resolvedConfig.maxValue
  const valueRange = Math.max(1, maxValue - minValue)
  const percent = Math.max(0, Math.min(1, (value - minValue) / valueRange))

  const updateValue = (nextValue: number) => {
    if (isDisabled || !Number.isFinite(nextValue)) return
    const midiValue = Math.max(minValue, Math.min(maxValue, Math.round(nextValue)))
    valueRef.current = midiValue
    setValue(midiValue)
    if (lastSentValueRef.current === midiValue) return
    lastSentValueRef.current = midiValue
    sendCommand({ type: "cc", controller: standardController, value: midiValue })
  }

  const updateValueFromPointer = (clientY: number) => {
    const track = trackRef.current
    if (!track) return

    const rect = track.getBoundingClientRect()
    if (rect.height <= 0) return
    const nextPercent = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height))
    updateValue(minValue + nextPercent * valueRange)
  }

  useEffect(() => {
    const nextValue = Math.max(minValue, Math.min(maxValue, resolvedConfig.defaultValue))
    valueRef.current = nextValue
    lastSentValueRef.current = null
    setValue(nextValue)
  }, [resolvedConfig.defaultValue, standardController, minValue, maxValue])

  useEffect(() => {
    if (
      typeof feedbackValue === "number" &&
      Number.isFinite(feedbackValue) &&
      activePointerRef.current === null
    ) {
      const nextValue = Math.max(minValue, Math.min(maxValue, Math.round(feedbackValue)))
      valueRef.current = nextValue
      lastSentValueRef.current = null
      setValue(nextValue)
    }
  }, [feedbackValue, maxValue, minValue])

  function releasePointer() {
    const pointerId = activePointerRef.current
    activePointerRef.current = null
    if (pointerId !== null && trackRef.current?.hasPointerCapture(pointerId)) {
      trackRef.current.releasePointerCapture(pointerId)
    }
  }

  useEffect(() => {
    if (isDisabled) releasePointer()
  }, [isDisabled])

  return (
    <div
      {...stylex.props(styles.faderStrip, isDisabled && styles.faderStripDisabled)}
      onContextMenu={(event) => {
        if (isMobileView) return
        event.preventDefault()
        onEdit()
      }}
    >
      <div {...stylex.props(styles.faderSliderArea)}>
        <div
          {...stylex.props(styles.verticalSliderTrack)}
          ref={trackRef}
          role="slider"
          tabIndex={isDisabled ? -1 : 0}
          aria-disabled={isDisabled || undefined}
          aria-label={resolvedConfig.label}
          aria-orientation="vertical"
          aria-valuemin={minValue}
          aria-valuemax={maxValue}
          aria-valuenow={value}
          aria-valuetext={`${value} de ${maxValue} · ${Math.round(percent * 100)}%`}
          onBlur={releasePointer}
          onLostPointerCapture={releasePointer}
          onPointerDown={(event) => {
            if (isDisabled || event.button !== 0 || activePointerRef.current !== null)
              return
            event.preventDefault()
            event.currentTarget.focus({ preventScroll: true })
            activePointerRef.current = event.pointerId
            event.currentTarget.setPointerCapture(event.pointerId)
            updateValueFromPointer(event.clientY)
          }}
          onPointerMove={(event) => {
            if (isDisabled || activePointerRef.current !== event.pointerId) return
            event.preventDefault()
            updateValueFromPointer(event.clientY)
          }}
          onPointerUp={(event) => {
            if (activePointerRef.current !== event.pointerId) return
            updateValueFromPointer(event.clientY)
            releasePointer()
          }}
          onPointerCancel={(event) => {
            if (activePointerRef.current === event.pointerId) releasePointer()
          }}
          onKeyDown={(event) => {
            if (isDisabled) return
            const step = event.shiftKey ? 10 : 1
            if (event.key === "ArrowUp" || event.key === "ArrowRight") {
              event.preventDefault()
              updateValue(valueRef.current + step)
            }
            if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
              event.preventDefault()
              updateValue(valueRef.current - step)
            }
            if (event.key === "PageUp") {
              event.preventDefault()
              updateValue(valueRef.current + 10)
            }
            if (event.key === "PageDown") {
              event.preventDefault()
              updateValue(valueRef.current - 10)
            }
            if (event.key === "Home") {
              event.preventDefault()
              updateValue(minValue)
            }
            if (event.key === "End") {
              event.preventDefault()
              updateValue(maxValue)
            }
          }}
        >
          <div {...stylex.props(styles.verticalSliderRail)} aria-hidden="true" />
          <div
            {...stylex.props(styles.verticalSliderFill)}
            style={{ height: `${percent * 100}%` }}
            aria-hidden="true"
          />
          <div
            {...stylex.props(styles.verticalSliderThumb)}
            style={{ bottom: `${percent * 100}%` }}
            aria-hidden="true"
          />
        </div>
      </div>
      <span {...stylex.props(styles.faderValue)}>{value}</span>
      <strong {...stylex.props(styles.faderName)} title={resolvedConfig.label}>
        {resolvedConfig.label}
      </strong>
      <small {...stylex.props(styles.faderCc)}>CC {standardController}</small>
    </div>
  )
}

const styles = stylex.create({
  faderStrip: {
    display: "grid",
    gridTemplateRows: {
      default: "166px auto auto auto",
      "@media (max-width: 760px)": "132px auto auto auto",
    },
    justifyItems: "center",
    alignItems: "center",
    gap: {
      default: "7px",
      "@media (max-width: 760px)": "5px",
    },
    minWidth: 0,
    overflow: "hidden",
    borderRadius: {
      default: "14px",
      "@media (max-width: 760px)": "10px",
    },
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.08)",
    padding: {
      default: "12px 4px 10px",
      "@media (max-width: 760px)": "9px 1px 8px",
    },
    cursor: "context-menu",
    touchAction: "pan-y",
  },
  faderStripDisabled: {
    opacity: 0.5,
  },
  faderSliderArea: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    minWidth: 0,
    height: "100%",
    paddingTop: {
      default: "10px",
      "@media (max-width: 760px)": "8px",
    },
    paddingBottom: {
      default: "10px",
      "@media (max-width: 760px)": "8px",
    },
    touchAction: "pan-y",
  },
  verticalSliderTrack: {
    position: "relative",
    width: {
      default: "42px",
      "@media (max-width: 760px)": "32px",
    },
    height: {
      default: "128px",
      "@media (max-width: 760px)": "98px",
    },
    borderRadius: "999px",
    backgroundColor: "transparent",
    touchAction: "none",
    overflow: "visible",
    outline: { default: "none", ":focus-visible": "2px solid #c4b5fd" },
    outlineOffset: "2px",
  },
  verticalSliderRail: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "50%",
    width: "8px",
    transform: "translateX(-50%)",
    borderRadius: "999px",
    backgroundColor: "rgba(148, 163, 184, 0.22)",
    pointerEvents: "none",
  },
  verticalSliderFill: {
    position: "absolute",
    bottom: 0,
    left: "50%",
    width: "8px",
    transform: "translateX(-50%)",
    borderRadius: "999px",
    backgroundColor: "#8b5cf6",
    pointerEvents: "none",
  },
  verticalSliderThumb: {
    position: "absolute",
    left: "50%",
    zIndex: 2,
    transform: "translate(-50%, 50%)",
    width: {
      default: "28px",
      "@media (max-width: 760px)": "24px",
    },
    height: {
      default: "18px",
      "@media (max-width: 760px)": "16px",
    },
    borderRadius: "7px",
    backgroundColor: "#e5e7eb",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "#111827",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.35)",
    touchAction: "none",
  },
  faderValue: {
    color: "#ddd6fe",
    fontSize: {
      default: "0.72rem",
      "@media (max-width: 760px)": "0.68rem",
    },
    fontWeight: 900,
    lineHeight: 1,
  },
  faderName: {
    color: "#e5e7eb",
    fontSize: {
      default: "0.72rem",
      "@media (max-width: 760px)": "0.65rem",
    },
    textAlign: "center",
    lineHeight: 1.05,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  faderCc: {
    color: "#94a3b8",
    fontSize: {
      default: "0.62rem",
      "@media (max-width: 760px)": "0.58rem",
    },
    lineHeight: 1,
  },
})
