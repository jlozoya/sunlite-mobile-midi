import * as stylex from "@stylexjs/stylex"
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { Button, Input, Label, TextField } from "react-aria-components"
import {
  FADERS,
  MIDI_BUTTON_MESSAGE_TYPES,
  MIDI_BUTTON_MODES,
  PAD_COLOR_OPTIONS,
  PAD_GRID,
  SCENE_BUTTONS,
  type ButtonCustomization,
  type ControllerCustomization,
  type FaderCustomization,
  type MidiButtonMessageType,
  type MidiButtonMode,
  type MidiFaderConfig,
  type MidiPadConfig,
  type PadColor,
} from "../../shared/controller-config.ts"
import { useControllerSocket } from "./useControllerSocket"
import { useServerStatus } from "./useServerStatus"

type MidiCommand =
  | { type: "note"; note: number; velocity?: number; offDelayMs?: number }
  | { type: "noteon"; note: number; velocity?: number }
  | { type: "noteoff"; note: number; velocity?: number }
  | { type: "cc"; controller: number; value: number }
  | { type: "program"; number: number }

type EditableControl =
  | { kind: "pad"; id: string; note: number }
  | { kind: "scene"; id: string; note: number }
  | { kind: "fader"; id: string; controller: number }

export function App() {
  const { status, error: statusError, isLoading, refreshStatus } = useServerStatus()
  const { connectionState, lastCommand, serverMidiLabel, padStates, ccValues, controllerCustomization, setControllerCustomization, sendCommand } = useControllerSocket()
  const [setupMessage, setSetupMessage] = useState<string | null>(null)
  const [setupBusy, setSetupBusy] = useState<"install" | "open" | "refresh" | null>(null)

  async function runSetupAction(action: "install" | "open" | "refresh") {
    setSetupBusy(action)
    setSetupMessage(null)

    try {
      const endpoint = action === "install" ? "/api/loopmidi/install" : action === "open" ? "/api/loopmidi/open" : "/api/midi/refresh"
      const response = await fetch(endpoint, { method: "POST" })
      const payload = (await response.json()) as { ok?: boolean; message?: string; code?: number | null; skipped?: boolean }

      if (!response.ok || payload.ok === false) {
        throw new Error(payload.message ?? `Setup action failed: ${response.status}`)
      }

      await refreshStatus()

      if (action === "install") {
        setSetupMessage(
          payload.skipped
            ? "loopMIDI is already installed. Open it and create Sunlite Mobile In and Sunlite Mobile Out if they are not visible yet."
            : payload.code === 0
              ? "loopMIDI installer finished. Open loopMIDI and create Sunlite Mobile In and Sunlite Mobile Out if they are not visible yet."
              : "loopMIDI installer was launched. Finish the installer, then refresh MIDI ports.",
        )
      } else if (action === "open") {
        setSetupMessage("loopMIDI was opened. Create two ports named Sunlite Mobile In and Sunlite Mobile Out, then refresh MIDI ports.")
      } else {
        setSetupMessage("MIDI ports refreshed.")
      }
    } catch (error) {
      setSetupMessage(error instanceof Error ? error.message : "Unknown setup error")
    } finally {
      setSetupBusy(null)
    }
  }

  async function saveControllerCustomization(nextCustomization: ControllerCustomization) {
    setControllerCustomization(nextCustomization)

    const response = await fetch("/api/controller-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextCustomization),
    })

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null
      throw new Error(payload?.message ?? `Failed to save controller config: ${response.status}`)
    }

    const saved = (await response.json()) as ControllerCustomization
    setControllerCustomization(saved)
  }

  const isOnline = connectionState === "online"
  const statusLabel = isOnline ? "Online" : connectionState === "connecting" ? "Connecting" : "Offline"
  const shouldShowOpenLoopMidi = Boolean(status?.loopMidiExecutablePath)
  const isControllerReady = Boolean(status?.loopMidiInstalled && status?.midiReady)
  const isMobileView = useIsMobileView()

  return (
    <main {...stylex.props(styles.app)}>
      <header {...stylex.props(styles.header)}>
        <div>
          <p {...stylex.props(styles.eyebrow)}>Sunlite Suite 2</p>
          <h1 {...stylex.props(styles.title)}>Mobile MIDI Controller</h1>
          <p {...stylex.props(styles.subtitle)}>{serverMidiLabel ?? "Waiting for MIDI server"}</p>
        </div>

        <div {...stylex.props(styles.status, isOnline ? styles.statusOnline : styles.statusOffline)}>{statusLabel}</div>
      </header>

      {!isMobileView ? (
        <section {...stylex.props(styles.heroGrid)}>
          <section {...stylex.props(styles.panel, styles.qrPanel)}>
            <div {...stylex.props(styles.sectionHeader)}>
              <h2 {...stylex.props(styles.sectionTitle)}>Open on phone</h2>
              <p {...stylex.props(styles.sectionDescription)}>Scan this QR from a device connected to the same Wi‑Fi network.</p>
            </div>

            {status?.qrDataUrl ? (
              <div {...stylex.props(styles.qrWrap)}>
                <img {...stylex.props(styles.qrImage)} src={status.qrDataUrl} alt="Mobile controller QR code" />
              </div>
            ) : (
              <div {...stylex.props(styles.qrPlaceholder)}>Loading QR</div>
            )}

            <div {...stylex.props(styles.urlBox)}>{status?.preferredLanUrl ?? "Detecting LAN URL"}</div>

            {status?.networkUrlCandidates && status.networkUrlCandidates.length > 1 ? (
              <div {...stylex.props(styles.networkList)}>
                <strong>Other detected URLs</strong>
                {status.networkUrlCandidates.slice(1).map((candidate) => (
                  <span key={`${candidate.interfaceName}-${candidate.address}`}>
                    {candidate.url} · {candidate.interfaceName} · {candidate.note}
                  </span>
                ))}
              </div>
            ) : null}

            {statusError ? <p {...stylex.props(styles.errorText)}>{statusError}</p> : null}
          </section>

          <section {...stylex.props(styles.panel)}>
            <div {...stylex.props(styles.sectionHeader)}>
              <h2 {...stylex.props(styles.sectionTitle)}>Setup</h2>
              <p {...stylex.props(styles.sectionDescription)}>
                Configure two loopMIDI ports once. The controller appears after <strong>Sunlite Mobile In</strong> is ready. <strong>Sunlite Mobile Out</strong> is optional and only used for feedback.
              </p>
            </div>

            <div {...stylex.props(styles.setupFlow)}>
              {!status ? (
                <div {...stylex.props(styles.currentStep)}>
                  <div {...stylex.props(styles.setupStepCopy)}>
                    <strong>Loading setup status</strong>
                    <span>Checking loopMIDI, available MIDI ports, and LAN controller URL.</span>
                  </div>
                </div>
              ) : !status.loopMidiInstalled ? (
                <div {...stylex.props(styles.currentStep, styles.currentStepWarning)}>
                  <div {...stylex.props(styles.setupStepCopy)}>
                    <strong>1. Install loopMIDI</strong>
                    <span>Install the virtual MIDI driver first.</span>
                  </div>
                  {status.loopMidiInstallerAvailable ? (
                    <Button {...stylex.props(styles.setupButton)} isDisabled={setupBusy !== null} onPress={() => void runSetupAction("install")}>
                      {setupBusy === "install" ? "Installing..." : "Install loopMIDI"}
                    </Button>
                  ) : (
                    <span {...stylex.props(styles.setupUnavailable)}>loopMIDI installer is not bundled with this app.</span>
                  )}
                </div>
              ) : !status.midiReady ? (
                <div {...stylex.props(styles.currentStep, styles.currentStepWarning)}>
                  <div {...stylex.props(styles.setupStepCopy)}>
                    <strong>2. Create the Sunlite Mobile MIDI ports</strong>
                    <span>
                      Open loopMIDI. Create <strong>Sunlite Mobile In</strong> first. Create <strong>Sunlite Mobile Out</strong> only if you want feedback from Sunlite. Then refresh.
                    </span>
                  </div>
                  <div {...stylex.props(styles.setupActions)}>
                    {shouldShowOpenLoopMidi ? (
                      <Button {...stylex.props(styles.setupButton)} isDisabled={setupBusy !== null} onPress={() => void runSetupAction("open")}>
                        {setupBusy === "open" ? "Opening..." : "Open loopMIDI"}
                      </Button>
                    ) : (
                      <span {...stylex.props(styles.setupUnavailable)}>loopMIDI executable not found.</span>
                    )}
                    <Button {...stylex.props(styles.setupButton, styles.setupButtonSecondary)} isDisabled={setupBusy !== null || isLoading} onPress={() => void runSetupAction("refresh")}>
                      {setupBusy === "refresh" || isLoading ? "Refreshing..." : "Refresh MIDI ports"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div {...stylex.props(styles.currentStep, styles.currentStepReady)}>
                  <div {...stylex.props(styles.setupStepCopy)}>
                    <strong>Setup complete</strong>
                    <span>
                      MIDI to Sunlite <strong>{status.midiOutputName}</strong> is ready. {status.feedbackReady ? <>Feedback from Sunlite <strong>{status.midiInputName}</strong> is enabled. </> : <>MIDI feedback is disabled or missing; buttons stay unlit until Sunlite MIDI OUT is configured. </>}
                      In Sunlite, use MIDI channel <strong>{status.midiChannel}</strong>.
                    </span>
                  </div>
                  <Button {...stylex.props(styles.setupButton, styles.setupButtonSecondary)} isDisabled={setupBusy !== null || isLoading} onPress={() => void runSetupAction("refresh")}>
                    {setupBusy === "refresh" || isLoading ? "Refreshing..." : "Refresh MIDI ports"}
                  </Button>
                </div>
              )}
            </div>

            {status && (!status.midiReady || !status.feedbackReady) ? (
              <div {...stylex.props(styles.portList)}>
                <strong>Available MIDI outputs</strong>
                <span>{status.availableMidiOutputs.length ? status.availableMidiOutputs.join(", ") : "No MIDI outputs detected yet."}</span>
                <strong>Available MIDI inputs</strong>
                <span>{status.availableMidiInputs.length ? status.availableMidiInputs.join(", ") : "No MIDI inputs detected yet."}</span>
              </div>
            ) : null}

            {status?.feedbackDisabledReason ? <p {...stylex.props(styles.warningText)}>{status.feedbackDisabledReason}</p> : null}
            {setupMessage ? <p {...stylex.props(styles.setupMessage)}>{setupMessage}</p> : null}
          </section>
        </section>
      ) : null}

      {isControllerReady ? (
        <ApcController
          padStates={padStates}
          ccValues={ccValues}
          sendCommand={sendCommand}
          lastCommand={lastCommand}
          customization={controllerCustomization}
          onSaveCustomization={saveControllerCustomization}
          isMobileView={isMobileView}
          feedbackReady={Boolean(status?.feedbackReady)}
          feedbackWarning={status?.feedbackDisabledReason ?? null}
          midiChannel={status?.midiChannel ?? 1}
        />
      ) : (
        <section {...stylex.props(styles.panel, styles.controlsLockedPanel)}>
          <div {...stylex.props(styles.sectionHeader)}>
            <h2 {...stylex.props(styles.sectionTitle)}>MIDI controls locked</h2>
            <p {...stylex.props(styles.sectionDescription)}>
              {isMobileView ? <>Finish loopMIDI and Sunlite setup on the computer first. This mobile view only shows the controller once the MIDI output port is ready.</> : <>The controller appears after loopMIDI is installed and <strong>Sunlite Mobile In</strong> is detected. <strong>Sunlite Mobile Out</strong> is optional for feedback.</>}
            </p>
          </div>
        </section>
      )}
    </main>
  )
}

type ApcControllerProps = {
  padStates: Record<number, { velocity: number; behaviorChannel: number }>
  ccValues: Record<number, number>
  lastCommand: string
  customization: ControllerCustomization
  onSaveCustomization: (customization: ControllerCustomization) => Promise<void>
  isMobileView: boolean
  feedbackReady: boolean
  feedbackWarning: string | null
  midiChannel: number
  sendCommand: (command: MidiCommand) => void
}

function ApcController({ padStates, ccValues, lastCommand, customization, onSaveCustomization, isMobileView, feedbackReady, feedbackWarning, midiChannel, sendCommand }: ApcControllerProps) {
  const [editingControl, setEditingControl] = useState<EditableControl | null>(null)
  const [activeButtons, setActiveButtons] = useState<Record<string, boolean>>({})
  const activeButtonTimersRef = useRef<Record<string, number>>({})

  useEffect(() => {
    const nextActiveButtons: Record<string, boolean> = {}

    for (const pad of PAD_GRID) {
      nextActiveButtons[`pad-${pad.note}`] = Boolean(customization.pads[String(pad.note)]?.initialActive)
    }

    for (const button of SCENE_BUTTONS) {
      nextActiveButtons[`scene-${button.note}`] = Boolean(customization.sceneButtons[String(button.note)]?.initialActive)
    }

    for (const timer of Object.values(activeButtonTimersRef.current)) {
      window.clearTimeout(timer)
    }

    activeButtonTimersRef.current = {}
    setActiveButtons(nextActiveButtons)
  }, [customization])

  useEffect(() => () => {
    for (const timer of Object.values(activeButtonTimersRef.current)) {
      window.clearTimeout(timer)
    }

    activeButtonTimersRef.current = {}
  }, [])

  function clearActiveButtonTimer(id: string) {
    const timer = activeButtonTimersRef.current[id]

    if (timer) {
      window.clearTimeout(timer)
      delete activeButtonTimersRef.current[id]
    }
  }

  function setButtonActive(id: string, active: boolean) {
    clearActiveButtonTimer(id)
    setActiveButtons((current) => ({ ...current, [id]: active }))
  }

  function setButtonActiveFor(id: string, active: boolean, durationMs: number) {
    clearActiveButtonTimer(id)
    setActiveButtons((current) => ({ ...current, [id]: active }))

    if (durationMs > 0) {
      activeButtonTimersRef.current[id] = window.setTimeout(() => {
        setActiveButtons((current) => ({ ...current, [id]: false }))
        delete activeButtonTimersRef.current[id]
      }, durationMs)
    }
  }

  function toggleButtonActive(id: string) {
    clearActiveButtonTimer(id)
    setActiveButtons((current) => ({ ...current, [id]: !current[id] }))
  }

  return (
    <section {...stylex.props(styles.apcPanel)}>
      <div {...stylex.props(styles.apcHeader)}>
        <div>
          <h2 {...stylex.props(styles.apcTitle)}>APC-style performance grid</h2>
          <p {...stylex.props(styles.sectionDescription)}>
            8×8 pads, 8 scene-launch buttons, and 9 vertical faders. On desktop, right-click any pad/scene/fader to edit its text. Button color and lit/off state come only from Sunlite MIDI OUT feedback.
          </p>
        </div>
        <div {...stylex.props(styles.feedbackBadge, !feedbackReady && styles.feedbackBadgeWarning)}>{feedbackReady ? "MIDI feedback enabled" : "Feedback disabled"}</div>
      </div>

      {feedbackWarning ? <p {...stylex.props(styles.warningText)}>{feedbackWarning}</p> : null}

      <div {...stylex.props(styles.apcSurface)}>
        <div {...stylex.props(styles.padMatrix)}>
          {PAD_GRID.map((pad) => {
            const config = customization.pads[String(pad.note)]
            const feedbackState = padStates[pad.note]
            const feedbackColor = getFeedbackColor(feedbackState?.velocity)
            const feedbackBehavior = getFeedbackBehavior(feedbackState?.behaviorChannel)
            const isActive = feedbackColor !== null
            return (
              <PadButton
                key={pad.id}
                pad={pad}
                config={config}
                isActive={isActive}
                feedbackColor={feedbackColor}
                feedbackBehavior={feedbackBehavior}
                isMobileView={isMobileView}
                sendCommand={sendCommand}
                setButtonActive={setButtonActive}
                setButtonActiveFor={setButtonActiveFor}
                toggleButtonActive={toggleButtonActive}
                onEdit={() => setEditingControl({ kind: "pad", id: pad.id, note: pad.note })}
              />
            )
          })}
        </div>

        <div {...stylex.props(styles.sceneColumn)}>
          {SCENE_BUTTONS.map((button) => {
            const config = customization.sceneButtons[String(button.note)]
            const feedbackState = padStates[button.note]
            const feedbackColor = getFeedbackColor(feedbackState?.velocity)
            const feedbackBehavior = getFeedbackBehavior(feedbackState?.behaviorChannel)
            const isActive = feedbackColor !== null
            const color = feedbackColor ?? "off"

            return (
              <Button
                key={button.id}
                {...stylex.props(styles.sceneLaunchButton, isActive && styles.padButtonLit)}
                style={getButtonFrameStyle(color)}
                data-led-behavior={feedbackBehavior.behavior}
                onPressStart={() => sendStandardButtonNoteOn(button.note, sendCommand)}
                onPressEnd={() => sendStandardButtonNoteOff(button.note, sendCommand)}
                onContextMenu={(event) => {
                  if (isMobileView) return
                  event.preventDefault()
                  setEditingControl({ kind: "scene", id: button.id, note: button.note })
                }}
              >
                <span {...stylex.props(styles.padLedLayer)} style={getLedLayerStyle(color, feedbackBehavior)} aria-hidden="true" />
                <span {...stylex.props(styles.sceneLabel)}>{config?.label ?? button.label}</span>
                <small {...stylex.props(styles.sceneMeta)}>N {button.note}</small>
              </Button>
            )
          })}
        </div>

        <div {...stylex.props(styles.faderBank)}>
          {FADERS.map((fader) => (
            <FaderStrip
              key={fader.id}
              fader={fader}
              config={customization.faders[String(fader.controller)]}
              feedbackValue={ccValues[fader.controller]}
              sendCommand={sendCommand}
              isMobileView={isMobileView}
              onEdit={() => setEditingControl({ kind: "fader", id: fader.id, controller: fader.controller })}
            />
          ))}
        </div>
      </div>

      {!isMobileView && editingControl ? (
        <ControllerConfigModal
          control={editingControl}
          customization={customization}
          midiChannel={midiChannel}
          onClose={() => setEditingControl(null)}
          onSave={(nextCustomization) => {
            void onSaveCustomization(nextCustomization)
            setEditingControl(null)
          }}
        />
      ) : null}

      <div {...stylex.props(styles.lastCommandBar)}>
        <strong>Last command</strong>
        <span>{lastCommand}</span>
      </div>
    </section>
  )
}

type PadButtonProps = {
  pad: MidiPadConfig
  config: ButtonCustomization | undefined
  isActive: boolean
  feedbackColor: PadColor | null
  feedbackBehavior: ApcLedFeedbackBehavior
  isMobileView: boolean
  sendCommand: ApcControllerProps["sendCommand"]
  setButtonActive: (id: string, active: boolean) => void
  setButtonActiveFor: (id: string, active: boolean, durationMs: number) => void
  toggleButtonActive: (id: string) => void
  onEdit: () => void
}

function PadButton({ pad, config, feedbackColor, feedbackBehavior, isMobileView, sendCommand, onEdit }: PadButtonProps) {
  const label = config?.label ?? pad.label
  const color = feedbackColor ?? "off"
  const isLit = color !== "off"

  return (
    <Button
      {...stylex.props(styles.padButton, isLit && styles.padButtonLit)}
      style={getButtonFrameStyle(color)}
      data-led-behavior={feedbackBehavior.behavior}
      onPressStart={() => sendStandardButtonNoteOn(pad.note, sendCommand)}
      onPressEnd={() => sendStandardButtonNoteOff(pad.note, sendCommand)}
      onContextMenu={(event) => {
        if (isMobileView) return
        event.preventDefault()
        onEdit()
      }}
    >
      <span {...stylex.props(styles.padLedLayer)} style={getLedLayerStyle(color, feedbackBehavior)} aria-hidden="true" />
      <span {...stylex.props(styles.padLabel)}>{label}</span>
      <small {...stylex.props(styles.padMeta)}>N {pad.note}</small>
    </Button>
  )
}

type FaderStripProps = {
  fader: MidiFaderConfig
  config: FaderCustomization | undefined
  feedbackValue: number | undefined
  sendCommand: ApcControllerProps["sendCommand"]
  isMobileView: boolean
  onEdit: () => void
}

function FaderStrip({ fader, config, feedbackValue, sendCommand, isMobileView, onEdit }: FaderStripProps) {
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

type ControllerConfigModalProps = {
  control: EditableControl
  customization: ControllerCustomization
  midiChannel: number
  onClose: () => void
  onSave: (customization: ControllerCustomization) => void
}

function ControllerConfigModal({ control, customization, midiChannel, onClose, onSave }: ControllerConfigModalProps) {
  const target = useMemo(() => getEditableControlTarget(control, customization), [control, customization])
  const [buttonDraft, setButtonDraft] = useState<ButtonCustomization | null>(target.kind === "button" ? target.config : null)
  const [faderDraft, setFaderDraft] = useState<FaderCustomization | null>(target.kind === "fader" ? target.config : null)

  useEffect(() => {
    setButtonDraft(target.kind === "button" ? target.config : null)
    setFaderDraft(target.kind === "fader" ? target.config : null)
  }, [target])

  function save() {
    if (control.kind === "pad" && buttonDraft) {
      const current = customization.pads[String(control.note)] ?? buttonDraft
      onSave({
        ...customization,
        pads: {
          ...customization.pads,
          [String(control.note)]: normalizeStandardButtonCustomization(current, buttonDraft.label, control.note),
        },
      })
      return
    }

    if (control.kind === "scene" && buttonDraft) {
      const current = customization.sceneButtons[String(control.note)] ?? buttonDraft
      onSave({
        ...customization,
        sceneButtons: {
          ...customization.sceneButtons,
          [String(control.note)]: normalizeStandardButtonCustomization(current, buttonDraft.label, control.note),
        },
      })
      return
    }

    if (control.kind === "fader" && faderDraft) {
      const current = customization.faders[String(control.controller)] ?? faderDraft
      onSave({
        ...customization,
        faders: {
          ...customization.faders,
          [String(control.controller)]: {
            ...current,
            label: faderDraft.label,
            controller: control.controller,
            minValue: 0,
            maxValue: 127,
          },
        },
      })
    }
  }

  return (
    <div {...stylex.props(styles.modalBackdrop)} onMouseDown={onClose}>
      <section {...stylex.props(styles.modalPanel)} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="MIDI control configuration">
        <div {...stylex.props(styles.modalHeader)}>
          <div>
            <h2 {...stylex.props(styles.modalTitle)}>MIDI control configuration</h2>
            <p {...stylex.props(styles.sectionDescription)}>Right-click editing · Global MIDI channel {midiChannel}</p>
          </div>
          <Button {...stylex.props(styles.iconButton)} onPress={onClose}>×</Button>
        </div>

        {target.kind === "button" && buttonDraft ? (
          <div {...stylex.props(styles.modalGrid)}>
            <TextField {...stylex.props(styles.fieldGroup)} value={buttonDraft.label} onChange={(label) => setButtonDraft({ ...buttonDraft, label })}>
              <Label>Button text</Label>
              <Input {...stylex.props(styles.textInput)} />
            </TextField>

            <div {...stylex.props(styles.helpBox)}>
              <strong>Standard APC Mini mapping</strong>
              <span>This app uses the fixed APC-style note for this button. Color and lit/off state are controlled only by MIDI OUT feedback from Sunlite. Configure Sunlite to send feedback to <strong>Sunlite Mobile Out</strong>.</span>
            </div>
          </div>
        ) : null}

        {target.kind === "fader" && faderDraft ? (
          <div {...stylex.props(styles.modalGrid)}>
            <TextField {...stylex.props(styles.fieldGroup)} value={faderDraft.label} onChange={(label) => setFaderDraft({ ...faderDraft, label })}>
              <Label>Fader text</Label>
              <Input {...stylex.props(styles.textInput)} />
            </TextField>
            <div {...stylex.props(styles.helpBox)}>
              <strong>Standard APC Mini mapping</strong>
              <span>This fader keeps its fixed APC-style CC number. Only the displayed text is editable here.</span>
            </div>
          </div>
        ) : null}

        <div {...stylex.props(styles.modalActions)}>
          <Button {...stylex.props(styles.setupButton, styles.setupButtonSecondary)} onPress={onClose}>Cancel</Button>
          <Button {...stylex.props(styles.setupButton)} onPress={save}>Save configuration</Button>
        </div>
      </section>
    </div>
  )
}

function getEditableControlTarget(control: EditableControl, customization: ControllerCustomization) {
  if (control.kind === "pad") {
    const pad = PAD_GRID.find((item) => item.note === control.note)
    return {
      kind: "button" as const,
      config: customization.pads[String(control.note)] ?? {
        label: pad?.label ?? `Pad ${control.note}`,
        offColor: pad?.defaultColor ?? "off",
        onColor: "green",
        messageType: "note" as const,
        midiNumber: control.note,
        onValue: 127,
        offValue: 0,
        mode: "trigger" as const,
        offDelayMs: 0,
        initialActive: false,
      },
    }
  }

  if (control.kind === "scene") {
    const scene = SCENE_BUTTONS.find((item) => item.note === control.note)
    return {
      kind: "button" as const,
      config: customization.sceneButtons[String(control.note)] ?? {
        label: scene?.label ?? `Scene ${control.note}`,
        offColor: "blue" as const,
        onColor: "white" as const,
        messageType: "note" as const,
        midiNumber: control.note,
        onValue: 127,
        offValue: 0,
        mode: "trigger" as const,
        offDelayMs: 0,
        initialActive: false,
      },
    }
  }

  const fader = FADERS.find((item) => item.controller === control.controller)
  return {
    kind: "fader" as const,
    config: customization.faders[String(control.controller)] ?? {
      label: fader?.label ?? `CC ${control.controller}`,
      controller: control.controller,
      minValue: 0,
      maxValue: 127,
      defaultValue: fader?.defaultValue ?? 0,
    },
  }
}

function normalizeStandardButtonCustomization(current: ButtonCustomization, label: string, note: number): ButtonCustomization {
  return {
    ...current,
    label,
    messageType: "note",
    midiNumber: note,
    onValue: 127,
    offValue: 0,
    mode: "momentary",
    offDelayMs: 0,
    initialActive: false,
  }
}

function sendStandardButtonNoteOn(note: number, sendCommand: (command: MidiCommand) => void) {
  sendCommand({ type: "noteon", note, velocity: 127 })
}

function sendStandardButtonNoteOff(note: number, sendCommand: (command: MidiCommand) => void) {
  sendCommand({ type: "noteoff", note, velocity: 0 })
}

type ApcLedFeedbackBehavior = {
  behavior: string
  style: CSSProperties
}

const APC_LED_BRIGHTNESS: Record<number, number> = {
  0: 0.1,
  1: 0.25,
  2: 0.5,
  3: 0.65,
  4: 0.75,
  5: 0.9,
  6: 1,
}

const LED_BACKGROUND_COLORS: Record<PadColor, string> = {
  off: "rgba(15, 23, 42, 0)",
  red: "rgba(239, 68, 68, 0.82)",
  amber: "rgba(245, 158, 11, 0.82)",
  yellow: "rgba(234, 179, 8, 0.86)",
  green: "rgba(16, 185, 129, 0.82)",
  cyan: "rgba(6, 182, 212, 0.82)",
  blue: "rgba(59, 130, 246, 0.82)",
  purple: "rgba(139, 92, 246, 0.82)",
  white: "rgba(248, 250, 252, 0.9)",
}

const LED_BORDER_COLORS: Record<PadColor, string> = {
  off: "rgba(255, 255, 255, 0.12)",
  red: "rgba(248, 113, 113, 0.78)",
  amber: "rgba(251, 191, 36, 0.78)",
  yellow: "rgba(250, 204, 21, 0.78)",
  green: "rgba(52, 211, 153, 0.78)",
  cyan: "rgba(34, 211, 238, 0.78)",
  blue: "rgba(96, 165, 250, 0.78)",
  purple: "rgba(167, 139, 250, 0.78)",
  white: "rgba(255, 255, 255, 0.95)",
}

function getFeedbackBehavior(channel: number | undefined): ApcLedFeedbackBehavior {
  const normalizedChannel = typeof channel === "number" ? Math.max(0, Math.min(15, Math.round(channel))) : 6
  const opacity = APC_LED_BRIGHTNESS[normalizedChannel] ?? 1

  if (normalizedChannel >= 7 && normalizedChannel <= 10) {
    const durations: Record<number, string> = { 7: "0.22s", 8: "0.45s", 9: "0.9s", 10: "1.8s" }
    return {
      behavior: `pulse-${normalizedChannel}`,
      style: { opacity, animation: `apc-led-pulse ${durations[normalizedChannel]} ease-in-out infinite` },
    }
  }

  if (normalizedChannel >= 11 && normalizedChannel <= 15) {
    const durations: Record<number, string> = { 11: "0.12s", 12: "0.22s", 13: "0.45s", 14: "0.9s", 15: "1.8s" }
    return {
      behavior: `blink-${normalizedChannel}`,
      style: { opacity, animation: `apc-led-blink ${durations[normalizedChannel]} steps(1, end) infinite` },
    }
  }

  return { behavior: `solid-${normalizedChannel}`, style: { opacity } }
}

function getLedLayerStyle(color: PadColor, behavior: ApcLedFeedbackBehavior): CSSProperties {
  return {
    ...behavior.style,
    backgroundColor: LED_BACKGROUND_COLORS[color],
  }
}

function getButtonFrameStyle(color: PadColor): CSSProperties {
  return {
    borderColor: LED_BORDER_COLORS[color],
  }
}

function getFeedbackColor(value: number | undefined): PadColor | null {
  if (typeof value !== "number" || value <= 0) return null

  // APC-style LED feedback uses note-on velocity as a color/status value.
  // Keep the received state until Sunlite sends velocity 0 or Note Off.
  if (value <= 5) return "green"
  if (value <= 13) return "red"
  if (value <= 21) return "amber"
  if (value <= 29) return "yellow"
  if (value <= 45) return "blue"
  if (value <= 61) return "purple"
  if (value <= 90) return "cyan"
  return "white"
}

function formatButtonMidiMeta(config: ButtonCustomization | undefined): string {
  if (!config) return "MIDI"
  return `N ${config.midiNumber}`
}

type ColorSelectProps = {
  label: string
  value: PadColor
  onChange: (color: PadColor) => void
}

function ColorSelect({ label, value, onChange }: ColorSelectProps) {
  return (
    <label {...stylex.props(styles.fieldGroup)}>
      <span>{label}</span>
      <div {...stylex.props(styles.colorSelectRow)}>
        <span {...stylex.props(styles.colorPreview, padColorStyles[value])} />
        <select {...stylex.props(styles.nativeSelect)} value={value} onChange={(event) => onChange(event.currentTarget.value as PadColor)}>
          {PAD_COLOR_OPTIONS.map((color) => (
            <option key={color} value={color}>{color}</option>
          ))}
        </select>
      </div>
    </label>
  )
}

type NativeSelectProps<TValue extends string> = {
  label: string
  value: TValue
  options: readonly TValue[]
  onChange: (value: TValue) => void
}

function NativeSelect<TValue extends string>({ label, value, options, onChange }: NativeSelectProps<TValue>) {
  return (
    <label {...stylex.props(styles.fieldGroup)}>
      <span>{label}</span>
      <select {...stylex.props(styles.nativeSelect)} value={value} onChange={(event) => onChange(event.currentTarget.value as TValue)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  )
}

type NumberFieldProps = {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}

function NumberField({ label, value, min, max, onChange }: NumberFieldProps) {
  return (
    <TextField {...stylex.props(styles.fieldGroup)} value={String(value)} onChange={(nextValue) => onChange(clampNumber(nextValue, min, max))}>
      <Label>{label}</Label>
      <Input {...stylex.props(styles.textInput)} type="number" min={min} max={max} />
    </TextField>
  )
}

function clampNumber(value: unknown, min: number, max: number): number {
  const numeric = Number(value)
  if (Number.isNaN(numeric)) return min
  return Math.max(min, Math.min(max, Math.round(numeric)))
}

function useIsMobileView() {
  const [isMobileView, setIsMobileView] = useState(false)

  useEffect(() => {
    const mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(window.navigator.userAgent)
    const mediaQuery = window.matchMedia("(max-width: 760px)")

    function updateIsMobileView() {
      setIsMobileView(mobileUserAgent || mediaQuery.matches)
    }

    updateIsMobileView()
    mediaQuery.addEventListener("change", updateIsMobileView)

    return () => mediaQuery.removeEventListener("change", updateIsMobileView)
  }, [])

  return isMobileView
}

const padColorStyles = stylex.create({
  off: {
    backgroundColor: "#1f2937",
    color: "#e5e7eb",
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  red: {
    backgroundColor: "rgba(239, 68, 68, 0.42)",
    color: "#fee2e2",
    borderColor: "rgba(248, 113, 113, 0.72)",
  },
  amber: {
    backgroundColor: "rgba(245, 158, 11, 0.42)",
    color: "#fffbeb",
    borderColor: "rgba(251, 191, 36, 0.72)",
  },
  yellow: {
    backgroundColor: "rgba(234, 179, 8, 0.44)",
    color: "#fefce8",
    borderColor: "rgba(250, 204, 21, 0.72)",
  },
  green: {
    backgroundColor: "rgba(16, 185, 129, 0.42)",
    color: "#d1fae5",
    borderColor: "rgba(52, 211, 153, 0.72)",
  },
  cyan: {
    backgroundColor: "rgba(6, 182, 212, 0.42)",
    color: "#cffafe",
    borderColor: "rgba(34, 211, 238, 0.72)",
  },
  blue: {
    backgroundColor: "rgba(59, 130, 246, 0.42)",
    color: "#dbeafe",
    borderColor: "rgba(96, 165, 250, 0.72)",
  },
  purple: {
    backgroundColor: "rgba(139, 92, 246, 0.42)",
    color: "#ede9fe",
    borderColor: "rgba(167, 139, 250, 0.72)",
  },
  white: {
    backgroundColor: "rgba(248, 250, 252, 0.88)",
    color: "#020617",
    borderColor: "rgba(255, 255, 255, 0.92)",
  },
})

const styles = stylex.create({
  app: {
    width: "100%",
    maxWidth: "none",
    minWidth: "360px",
    margin: 0,
    padding: {
      default: "18px",
      "@media (max-width: 760px)": "8px",
    },
    paddingBottom: "48px",
    boxSizing: "border-box",
    overflowX: "hidden",
  },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    backgroundColor: "rgba(8, 10, 18, 0.92)",
    backdropFilter: "blur(12px)",
    padding: "18px 0 16px",
  },
  eyebrow: {
    margin: "0 0 4px",
    color: "#a78bfa",
    fontSize: "0.78rem",
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    fontSize: "clamp(1.9rem, 4vw, 3rem)",
    lineHeight: 1.02,
  },
  subtitle: {
    margin: "8px 0 0",
    color: "#93c5fd",
    fontSize: "0.9rem",
  },
  status: {
    flexShrink: 0,
    borderRadius: "999px",
    borderWidth: "1px",
    borderStyle: "solid",
    padding: "10px 14px",
    fontSize: "0.84rem",
    fontWeight: 900,
  },
  statusOnline: {
    borderColor: "rgba(16, 185, 129, 0.32)",
    backgroundColor: "rgba(16, 185, 129, 0.14)",
    color: "#a7f3d0",
  },
  statusOffline: {
    borderColor: "rgba(239, 68, 68, 0.34)",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    color: "#fecaca",
  },
  heroGrid: {
    display: "grid",
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 900px)": "360px 1fr",
    },
    gap: "16px",
  },
  panel: {
    marginTop: "16px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: "22px",
    backgroundColor: "rgba(18, 22, 38, 0.86)",
    boxShadow: "0 16px 48px rgba(0, 0, 0, 0.28)",
    padding: "16px",
  },
  qrPanel: {
    display: "grid",
    justifyItems: "center",
  },
  sectionHeader: {
    display: "grid",
    gap: "4px",
    marginBottom: "14px",
    width: "100%",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "1rem",
  },
  sectionDescription: {
    margin: 0,
    color: "#94a3b8",
    fontSize: "0.9rem",
    lineHeight: 1.5,
  },
  qrWrap: {
    width: "min(100%, 320px)",
    borderRadius: "22px",
    backgroundColor: "#ffffff",
    padding: "12px",
  },
  qrImage: {
    display: "block",
    width: "100%",
    height: "auto",
  },
  qrPlaceholder: {
    display: "grid",
    placeItems: "center",
    width: "min(100%, 320px)",
    aspectRatio: "1 / 1",
    borderRadius: "22px",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    color: "#94a3b8",
    fontWeight: 800,
  },
  urlBox: {
    width: "100%",
    marginTop: "14px",
    borderRadius: "14px",
    backgroundColor: "rgba(8, 10, 18, 0.74)",
    padding: "12px",
    color: "#ddd6fe",
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    fontSize: "0.86rem",
    overflowWrap: "anywhere",
    textAlign: "center",
  },
  errorText: {
    width: "100%",
    color: "#fecaca",
    fontSize: "0.85rem",
    overflowWrap: "anywhere",
  },
  networkList: {
    display: "grid",
    gap: "6px",
    width: "100%",
    marginTop: "10px",
    borderRadius: "14px",
    backgroundColor: "rgba(8, 10, 18, 0.42)",
    padding: "10px",
    color: "#94a3b8",
    fontSize: "0.76rem",
    lineHeight: 1.4,
    overflowWrap: "anywhere",
  },
  setupFlow: {
    display: "grid",
    gap: "10px",
    marginTop: "14px",
  },
  currentStep: {
    display: "grid",
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 720px)": "1fr auto",
    },
    alignItems: "center",
    gap: "14px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: "18px",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    padding: "14px",
  },
  currentStepWarning: {
    borderColor: "rgba(245, 158, 11, 0.34)",
    backgroundColor: "rgba(245, 158, 11, 0.09)",
  },
  currentStepReady: {
    borderColor: "rgba(16, 185, 129, 0.34)",
    backgroundColor: "rgba(16, 185, 129, 0.1)",
  },
  setupStepCopy: {
    display: "grid",
    gap: "6px",
    color: "#cbd5e1",
    lineHeight: 1.45,
  },
  setupActions: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  setupButton: {
    borderWidth: 0,
    borderRadius: "14px",
    backgroundColor: "#8b5cf6",
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: 800,
    padding: "12px 14px",
  },
  setupButtonSecondary: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(167, 139, 250, 0.5)",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  setupUnavailable: {
    color: "#fecaca",
    fontSize: "0.86rem",
  },
  portList: {
    display: "grid",
    gap: "6px",
    marginTop: "14px",
    borderRadius: "14px",
    backgroundColor: "rgba(8, 10, 18, 0.48)",
    padding: "12px",
    color: "#cbd5e1",
    fontSize: "0.86rem",
  },
  setupMessage: {
    margin: "14px 0 0",
    color: "#ddd6fe",
    fontSize: "0.88rem",
  },
  controlsLockedPanel: {
    minHeight: "180px",
  },
  apcPanel: {
    width: "100%",
    minWidth: 0,
    marginTop: "16px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: "26px",
    backgroundColor: "#111827",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.34)",
    padding: {
      default: "clamp(10px, 1.2vw, 18px)",
      "@media (max-width: 760px)": "8px",
    },
    boxSizing: "border-box",
    overflow: "hidden",
  },
  apcHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    alignItems: "flex-start",
    marginBottom: "16px",
  },
  apcTitle: {
    margin: "0 0 6px",
    fontSize: "1.15rem",
  },
  feedbackBadge: {
    flexShrink: 0,
    borderRadius: "999px",
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    color: "#a7f3d0",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(16, 185, 129, 0.28)",
    padding: "8px 10px",
    fontSize: "0.78rem",
    fontWeight: 800,
  },
  feedbackBadgeWarning: {
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    color: "#fde68a",
    borderColor: "rgba(245, 158, 11, 0.34)",
  },
  apcSurface: {
    width: "100%",
    minWidth: 0,
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 900px)": "minmax(352px, 1fr) clamp(72px, 6.4vw, 112px)",
    },
    gap: {
      default: "clamp(6px, 0.9vw, 14px)",
      "@media (max-width: 760px)": "6px",
    },
    borderRadius: "22px",
    backgroundColor: "#050814",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.08)",
    overflowX: "auto",
    overscrollBehaviorX: "contain",
    padding: {
      default: "clamp(8px, 1vw, 14px)",
      "@media (max-width: 760px)": "6px",
    },
    boxSizing: "border-box",
  },
  padMatrix: {
    minWidth: 0,
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(8, minmax(44px, 1fr))",
      "@media (max-width: 760px)": "repeat(8, minmax(36px, 1fr))",
    },
    gap: {
      default: "clamp(4px, 0.6vw, 8px)",
      "@media (max-width: 760px)": "4px",
    },
  },
  padButton: {
    position: "relative",
    overflow: "hidden",
    aspectRatio: "1 / 1",
    minWidth: "36px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: {
      default: "12px",
      "@media (max-width: 760px)": "8px",
    },
    backgroundColor: "#1f2937",
    color: "#f8fafc",
    cursor: "pointer",
    display: "grid",
    alignContent: "center",
    justifyItems: "center",
    gap: "3px",
    padding: "4px",
    textAlign: "center",
    touchAction: "manipulation",
    userSelect: "none",
  },
  padButtonLit: {
    boxShadow: "0 0 22px rgba(255, 255, 255, 0.18)",
  },
  padLedLayer: {
    position: "absolute",
    inset: 0,
    borderRadius: "inherit",
    pointerEvents: "none",
    zIndex: 0,
  },
  padLabel: {
    position: "relative",
    zIndex: 1,
    color: "#f8fafc",
    textShadow: "0 1px 3px rgba(0, 0, 0, 0.85)",
    fontSize: {
      default: "0.7rem",
      "@media (max-width: 760px)": "0.56rem",
    },
    fontWeight: 900,
    lineHeight: 1.05,
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  },
  padMeta: {
    position: "relative",
    zIndex: 1,
    color: "rgba(255, 255, 255, 0.92)",
    textShadow: "0 1px 3px rgba(0, 0, 0, 0.85)",
    fontSize: {
      default: "0.62rem",
      "@media (max-width: 760px)": "0.5rem",
    },
  },
  sceneColumn: {
    minWidth: 0,
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(4, minmax(54px, 1fr))",
      "@media (min-width: 900px)": "1fr",
    },
    gap: {
      default: "clamp(4px, 0.6vw, 8px)",
      "@media (max-width: 760px)": "4px",
    },
  },
  sceneLaunchButton: {
    position: "relative",
    overflow: "hidden",
    minWidth: "54px",
    minHeight: {
      default: "54px",
      "@media (min-width: 900px)": "44px",
    },
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(14, 165, 233, 0.42)",
    borderRadius: "12px",
    backgroundColor: "rgba(14, 165, 233, 0.14)",
    color: "#f8fafc",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    gap: "2px",
    fontWeight: 900,
    padding: "8px",
  },
  sceneLabel: {
    position: "relative",
    zIndex: 1,
    color: "#f8fafc",
    textShadow: "0 1px 3px rgba(0, 0, 0, 0.85)",
  },
  sceneMeta: {
    position: "relative",
    zIndex: 1,
    color: "rgba(255, 255, 255, 0.92)",
    textShadow: "0 1px 3px rgba(0, 0, 0, 0.85)",
  },
  faderBank: {
    gridColumn: "1 / -1",
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(9, minmax(44px, 1fr))",
      "@media (max-width: 760px)": "repeat(9, minmax(36px, 1fr))",
    },
    gap: {
      default: "10px",
      "@media (max-width: 760px)": "4px",
    },
    width: "100%",
    minWidth: 0,
    overflowX: "visible",
    overscrollBehaviorX: "contain",
    marginTop: "10px",
  },
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
    touchAction: "none",
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
    touchAction: "none",
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
    outline: "none",
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
      "@media (max-width: 760px)": "0.58rem",
    },
    fontWeight: 900,
    lineHeight: 1,
  },
  faderName: {
    color: "#e5e7eb",
    fontSize: {
      default: "0.72rem",
      "@media (max-width: 760px)": "0.5rem",
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
      "@media (max-width: 760px)": "0.48rem",
    },
    lineHeight: 1,
  },
  warningText: {
    margin: "12px 0 0",
    borderRadius: "14px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(245, 158, 11, 0.38)",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    color: "#fde68a",
    padding: "10px 12px",
    fontSize: "0.86rem",
    lineHeight: 1.45,
  },
  lastCommandBar: {
    display: "grid",
    gap: "4px",
    marginTop: "12px",
    borderRadius: "14px",
    backgroundColor: "rgba(8, 10, 18, 0.7)",
    padding: "10px 12px",
    color: "#cbd5e1",
    fontSize: "0.82rem",
    overflowWrap: "anywhere",
  },
  fieldGroup: {
    display: "grid",
    gap: "6px",
    color: "#cbd5e1",
    fontSize: "0.84rem",
    fontWeight: 800,
  },
  checkboxField: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: "12px",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    color: "#cbd5e1",
    padding: "10px 11px",
    fontSize: "0.84rem",
    fontWeight: 800,
  },
  textInput: {
    width: "100%",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: "12px",
    backgroundColor: "#050814",
    color: "#f8fafc",
    padding: "10px 11px",
    outline: "none",
  },
  nativeSelect: {
    width: "100%",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: "12px",
    backgroundColor: "#050814",
    color: "#f8fafc",
    padding: "10px 11px",
    outline: "none",
  },
  colorSelectRow: {
    display: "grid",
    gridTemplateColumns: "32px 1fr",
    gap: "8px",
    alignItems: "center",
  },
  colorPreview: {
    width: "32px",
    height: "32px",
    borderRadius: "10px",
    borderWidth: "1px",
    borderStyle: "solid",
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 100,
    display: "grid",
    placeItems: "center",
    backgroundColor: "rgba(2, 6, 23, 0.74)",
    padding: "20px",
  },
  modalPanel: {
    width: "min(100%, 720px)",
    maxHeight: "min(92vh, 760px)",
    overflow: "auto",
    borderRadius: "24px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.14)",
    backgroundColor: "#111827",
    boxShadow: "0 30px 80px rgba(0, 0, 0, 0.5)",
    padding: "18px",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "14px",
    marginBottom: "16px",
  },
  modalTitle: {
    margin: 0,
    fontSize: "1.25rem",
  },
  iconButton: {
    width: "36px",
    height: "36px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: "12px",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    color: "#f8fafc",
    cursor: "pointer",
    fontSize: "1.3rem",
    lineHeight: 1,
  },
  modalGrid: {
    display: "grid",
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 720px)": "repeat(2, minmax(0, 1fr))",
    },
    gap: "12px",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "18px",
  },
  helpBox: {
    gridColumn: "1 / -1",
    display: "grid",
    gap: "6px",
    borderRadius: "14px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(14, 165, 233, 0.28)",
    backgroundColor: "rgba(14, 165, 233, 0.08)",
    color: "#bae6fd",
    padding: "12px",
    fontSize: "0.86rem",
    lineHeight: 1.45,
  },
})
