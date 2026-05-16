import * as stylex from "@stylexjs/stylex"
import { useEffect, useRef, useState } from "react"
import type { FaderCustomization, MidiFaderConfig } from "../../../shared/controller-config.ts"
import { styles } from "../styles"
import type { MidiCommand } from "../types"

export type FaderStripProps = {
  fader: MidiFaderConfig
  config: FaderCustomization | undefined
  feedbackValue: number | undefined
  sendCommand: (command: MidiCommand) => void
  isMobileView: boolean
  onEdit: () => void
}

export function FaderStrip({ fader, config, feedbackValue, sendCommand, isMobileView, onEdit }: FaderStripProps) {
  const resolvedConfig = config ?? { label: fader.label, controller: fader.controller, minValue: 0, maxValue: 127, defaultValue: fader.defaultValue }
  const standardController = fader.controller
  const [value, setValue] = useState(resolvedConfig.defaultValue)
  const trackRef = useRef<HTMLDivElement | null>(null)

  const minValue = resolvedConfig.minValue
  const maxValue = resolvedConfig.maxValue
  const valueRange = Math.max(1, maxValue - minValue)
  const percent = Math.max(0, Math.min(1, (value - minValue) / valueRange))

  const updateValue = (nextValue: number) => {
    const midiValue = Math.max(minValue, Math.min(maxValue, Math.round(nextValue)))
    setValue(midiValue)
    sendCommand({ type: "cc", controller: standardController, value: midiValue })
  }

  const updateValueFromPointer = (clientY: number) => {
    const track = trackRef.current
    if (!track) return

    const rect = track.getBoundingClientRect()
    const nextPercent = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height))
    updateValue(minValue + nextPercent * valueRange)
  }

  useEffect(() => {
    setValue(resolvedConfig.defaultValue)
  }, [resolvedConfig.defaultValue, standardController])

  useEffect(() => {
    if (typeof feedbackValue === "number") {
      setValue(Math.max(minValue, Math.min(maxValue, feedbackValue)))
    }
  }, [feedbackValue, maxValue, minValue])

  return (
    <div
      {...stylex.props(styles.faderStrip)}
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
          tabIndex={0}
          aria-label={resolvedConfig.label}
          aria-orientation="vertical"
          aria-valuemin={minValue}
          aria-valuemax={maxValue}
          aria-valuenow={value}
          onPointerDown={(event) => {
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            updateValueFromPointer(event.clientY)
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
            event.preventDefault()
            updateValueFromPointer(event.clientY)
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
          }}
          onPointerCancel={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
          }}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 10 : 1
            if (event.key === "ArrowUp" || event.key === "ArrowRight") {
              event.preventDefault()
              updateValue(value + step)
            }
            if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
              event.preventDefault()
              updateValue(value - step)
            }
            if (event.key === "PageUp") {
              event.preventDefault()
              updateValue(value + 10)
            }
            if (event.key === "PageDown") {
              event.preventDefault()
              updateValue(value - 10)
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
          <div {...stylex.props(styles.verticalSliderFill)} style={{ height: `${percent * 100}%` }} aria-hidden="true" />
          <div {...stylex.props(styles.verticalSliderThumb)} style={{ bottom: `${percent * 100}%` }} aria-hidden="true" />
        </div>
      </div>
      <span {...stylex.props(styles.faderValue)}>{value}</span>
      <strong {...stylex.props(styles.faderName)}>{resolvedConfig.label}</strong>
      <small {...stylex.props(styles.faderCc)}>CC {standardController}</small>
    </div>
  )
}
