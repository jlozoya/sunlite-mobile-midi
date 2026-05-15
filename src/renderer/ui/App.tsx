import * as stylex from "@stylexjs/stylex"
import { useEffect, useMemo, useState } from "react"
import { Button, Input, Label, Slider, SliderOutput, SliderThumb, SliderTrack, TextField } from "react-aria-components"
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
  const { connectionState, lastCommand, serverMidiLabel, padVelocities, ccValues, controllerCustomization, setControllerCustomization, sendCommand } = useControllerSocket()
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
                      MIDI to Sunlite <strong>{status.midiOutputName}</strong> is ready. {status.feedbackReady ? <>Feedback from Sunlite <strong>{status.midiInputName}</strong> is enabled. </> : <>MIDI feedback is disabled or missing; colors will use local button state/configuration. </>}
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
          padVelocities={padVelocities}
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
  padVelocities: Record<number, number>
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

function ApcController({ padVelocities, ccValues, lastCommand, customization, onSaveCustomization, isMobileView, feedbackReady, feedbackWarning, midiChannel, sendCommand }: ApcControllerProps) {
  const [editingControl, setEditingControl] = useState<EditableControl | null>(null)
  const [activeButtons, setActiveButtons] = useState<Record<string, boolean>>({})

  function setButtonActive(id: string, active: boolean) {
    setActiveButtons((current) => ({ ...current, [id]: active }))
  }

  function toggleButtonActive(id: string) {
    setActiveButtons((current) => ({ ...current, [id]: !current[id] }))
  }

  return (
    <section {...stylex.props(styles.apcPanel)}>
      <div {...stylex.props(styles.apcHeader)}>
        <div>
          <h2 {...stylex.props(styles.apcTitle)}>APC-style performance grid</h2>
          <p {...stylex.props(styles.sectionDescription)}>
            8×8 pads, 8 scene-launch buttons, and 9 vertical faders. On desktop, right-click any pad/scene/fader to edit its MIDI configuration, label, and colors.
          </p>
        </div>
        <div {...stylex.props(styles.feedbackBadge, !feedbackReady && styles.feedbackBadgeWarning)}>{feedbackReady ? "MIDI feedback enabled" : "Manual color mode"}</div>
      </div>

      {feedbackWarning ? <p {...stylex.props(styles.warningText)}>{feedbackWarning}</p> : null}

      <div {...stylex.props(styles.apcSurface)}>
        <div {...stylex.props(styles.padMatrix)}>
          {PAD_GRID.map((pad) => {
            const config = customization.pads[String(pad.note)]
            const isActive = Boolean(activeButtons[`pad-${pad.note}`]) || Boolean(padVelocities[config?.midiNumber ?? pad.note])
            return (
              <PadButton
                key={pad.id}
                pad={pad}
                config={config}
                isActive={isActive}
                isMobileView={isMobileView}
                sendCommand={sendCommand}
                setButtonActive={setButtonActive}
                toggleButtonActive={toggleButtonActive}
                onEdit={() => setEditingControl({ kind: "pad", id: pad.id, note: pad.note })}
              />
            )
          })}
        </div>

        <div {...stylex.props(styles.sceneColumn)}>
          {SCENE_BUTTONS.map((button) => {
            const config = customization.sceneButtons[String(button.note)]
            const isActive = Boolean(activeButtons[`scene-${button.note}`]) || Boolean(padVelocities[config?.midiNumber ?? button.note])
            const color = isActive ? config?.onColor ?? "white" : config?.offColor ?? "blue"

            return (
              <Button
                key={button.id}
                {...stylex.props(styles.sceneLaunchButton, padColorStyles[color])}
                onPress={() => triggerButton(config, sendCommand, `scene-${button.note}`, isActive, setButtonActive, toggleButtonActive)}
                onPressStart={() => startButtonPress(config, sendCommand, `scene-${button.note}`, setButtonActive)}
                onPressEnd={() => endButtonPress(config, sendCommand, `scene-${button.note}`, setButtonActive)}
                onContextMenu={(event) => {
                  if (isMobileView) return
                  event.preventDefault()
                  setEditingControl({ kind: "scene", id: button.id, note: button.note })
                }}
              >
                <span>{config?.label ?? button.label}</span>
                <small>{formatButtonMidiMeta(config)}</small>
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
              feedbackValue={ccValues[customization.faders[String(fader.controller)]?.controller ?? fader.controller]}
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
  isMobileView: boolean
  sendCommand: ApcControllerProps["sendCommand"]
  setButtonActive: (id: string, active: boolean) => void
  toggleButtonActive: (id: string) => void
  onEdit: () => void
}

function PadButton({ pad, config, isActive, isMobileView, sendCommand, setButtonActive, toggleButtonActive, onEdit }: PadButtonProps) {
  const resolvedConfig = config ?? {
    label: pad.label,
    offColor: pad.defaultColor ?? "off",
    onColor: "green",
    messageType: "note" as const,
    midiNumber: pad.note,
    onValue: 127,
    offValue: 0,
    mode: "trigger" as const,
    offDelayMs: 0,
  }
  const color = isActive ? resolvedConfig.onColor : resolvedConfig.offColor
  const isLit = color !== "off"
  const id = `pad-${pad.note}`

  return (
    <Button
      {...stylex.props(styles.padButton, isLit && styles.padButtonLit, padColorStyles[color])}
      onPress={() => triggerButton(resolvedConfig, sendCommand, id, isActive, setButtonActive, toggleButtonActive)}
      onPressStart={() => startButtonPress(resolvedConfig, sendCommand, id, setButtonActive)}
      onPressEnd={() => endButtonPress(resolvedConfig, sendCommand, id, setButtonActive)}
      onContextMenu={(event) => {
        if (isMobileView) return
        event.preventDefault()
        onEdit()
      }}
    >
      <span {...stylex.props(styles.padLabel)}>{resolvedConfig.label}</span>
      <small {...stylex.props(styles.padMeta)}>{formatButtonMidiMeta(resolvedConfig)}</small>
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
  const [value, setValue] = useState(resolvedConfig.defaultValue)

  useEffect(() => {
    setValue(resolvedConfig.defaultValue)
  }, [resolvedConfig.defaultValue, resolvedConfig.controller])

  useEffect(() => {
    if (typeof feedbackValue === "number") {
      setValue(feedbackValue)
    }
  }, [feedbackValue])

  return (
    <div
      {...stylex.props(styles.faderStrip)}
      onContextMenu={(event) => {
        if (isMobileView) return
        event.preventDefault()
        onEdit()
      }}
    >
      <Slider
        aria-label={resolvedConfig.label}
        orientation="vertical"
        value={value}
        minValue={resolvedConfig.minValue}
        maxValue={resolvedConfig.maxValue}
        onChange={(nextValue) => {
          const midiValue = Number(nextValue)
          setValue(midiValue)
          sendCommand({ type: "cc", controller: resolvedConfig.controller, value: midiValue })
        }}
      >
        <SliderTrack {...stylex.props(styles.verticalSliderTrack)}>
          {({ state }) => (
            <>
              <div {...stylex.props(styles.verticalSliderFill)} style={{ height: `${state.getThumbPercent(0) * 100}%` }} />
              <SliderThumb {...stylex.props(styles.verticalSliderThumb)} />
            </>
          )}
        </SliderTrack>
        <SliderOutput {...stylex.props(styles.faderValue)} />
      </Slider>
      <strong {...stylex.props(styles.faderName)}>{resolvedConfig.label}</strong>
      <small {...stylex.props(styles.faderCc)}>CC {resolvedConfig.controller}</small>
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
      onSave({
        ...customization,
        pads: {
          ...customization.pads,
          [String(control.note)]: buttonDraft,
        },
      })
      return
    }

    if (control.kind === "scene" && buttonDraft) {
      onSave({
        ...customization,
        sceneButtons: {
          ...customization.sceneButtons,
          [String(control.note)]: buttonDraft,
        },
      })
      return
    }

    if (control.kind === "fader" && faderDraft) {
      onSave({
        ...customization,
        faders: {
          ...customization.faders,
          [String(control.controller)]: faderDraft,
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

            <NativeSelect<MidiButtonMessageType> label="MIDI message" value={buttonDraft.messageType} options={MIDI_BUTTON_MESSAGE_TYPES} onChange={(messageType) => setButtonDraft({ ...buttonDraft, messageType })} />
            <NumberField label={buttonDraft.messageType === "cc" ? "CC number" : buttonDraft.messageType === "program" ? "Program number" : "Note number"} value={buttonDraft.midiNumber} min={0} max={127} onChange={(midiNumber) => setButtonDraft({ ...buttonDraft, midiNumber })} />
            <NativeSelect<MidiButtonMode> label="Button mode" value={buttonDraft.mode} options={MIDI_BUTTON_MODES} onChange={(mode) => setButtonDraft({ ...buttonDraft, mode })} />
            <NumberField label={buttonDraft.messageType === "cc" ? "On value" : "On velocity"} value={buttonDraft.onValue} min={0} max={127} onChange={(onValue) => setButtonDraft({ ...buttonDraft, onValue })} />
            <NumberField label={buttonDraft.messageType === "cc" ? "Off value" : "Off velocity"} value={buttonDraft.offValue} min={0} max={127} onChange={(offValue) => setButtonDraft({ ...buttonDraft, offValue })} />
            <NumberField label="Note Off delay ms" value={buttonDraft.offDelayMs} min={0} max={5000} onChange={(offDelayMs) => setButtonDraft({ ...buttonDraft, offDelayMs })} />
            <ColorSelect label="Off color" value={buttonDraft.offColor} onChange={(offColor) => setButtonDraft({ ...buttonDraft, offColor })} />
            <ColorSelect label="On color" value={buttonDraft.onColor} onChange={(onColor) => setButtonDraft({ ...buttonDraft, onColor })} />

            <div {...stylex.props(styles.helpBox)}>
              <strong>Suggested Sunlite mapping</strong>
              <span>For scene activation, use message type <strong>note</strong>, mode <strong>trigger</strong>, on velocity <strong>127</strong>, and link it to <strong>Button activation</strong>.</span>
            </div>
          </div>
        ) : null}

        {target.kind === "fader" && faderDraft ? (
          <div {...stylex.props(styles.modalGrid)}>
            <TextField {...stylex.props(styles.fieldGroup)} value={faderDraft.label} onChange={(label) => setFaderDraft({ ...faderDraft, label })}>
              <Label>Fader text</Label>
              <Input {...stylex.props(styles.textInput)} />
            </TextField>
            <NumberField label="CC number" value={faderDraft.controller} min={0} max={127} onChange={(controller) => setFaderDraft({ ...faderDraft, controller })} />
            <NumberField label="Minimum value" value={faderDraft.minValue} min={0} max={127} onChange={(minValue) => setFaderDraft({ ...faderDraft, minValue })} />
            <NumberField label="Maximum value" value={faderDraft.maxValue} min={0} max={127} onChange={(maxValue) => setFaderDraft({ ...faderDraft, maxValue })} />
            <NumberField label="Default value" value={faderDraft.defaultValue} min={0} max={127} onChange={(defaultValue) => setFaderDraft({ ...faderDraft, defaultValue })} />
            <div {...stylex.props(styles.helpBox)}>
              <strong>Suggested Sunlite mapping</strong>
              <span>Use CC controls for Dimmer, Speed, RGBW, size, phasing, or other continuous parameters.</span>
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

function triggerButton(config: ButtonCustomization | undefined, sendCommand: (command: MidiCommand) => void, id: string, isActive: boolean, setButtonActive: (id: string, active: boolean) => void, toggleButtonActive: (id: string) => void) {
  if (!config || config.mode === "momentary") return

  if (config.mode === "toggle") {
    const nextActive = !isActive
    sendButtonValue(config, nextActive ? config.onValue : config.offValue, nextActive, sendCommand)
    toggleButtonActive(id)
    return
  }

  sendButtonValue(config, config.onValue, true, sendCommand)
  setButtonActive(id, true)

  if (config.offDelayMs > 0) {
    window.setTimeout(() => {
      sendButtonValue(config, config.offValue, false, sendCommand)
      setButtonActive(id, false)
    }, config.offDelayMs)
  }
}

function startButtonPress(config: ButtonCustomization | undefined, sendCommand: (command: MidiCommand) => void, id: string, setButtonActive: (id: string, active: boolean) => void) {
  if (!config || config.mode !== "momentary") return
  sendButtonValue(config, config.onValue, true, sendCommand)
  setButtonActive(id, true)
}

function endButtonPress(config: ButtonCustomization | undefined, sendCommand: (command: MidiCommand) => void, id: string, setButtonActive: (id: string, active: boolean) => void) {
  if (!config || config.mode !== "momentary") return
  sendButtonValue(config, config.offValue, false, sendCommand)
  setButtonActive(id, false)
}

function sendButtonValue(config: ButtonCustomization, value: number, isOn: boolean, sendCommand: (command: MidiCommand) => void) {
  if (config.messageType === "cc") {
    sendCommand({ type: "cc", controller: config.midiNumber, value })
    return
  }

  if (config.messageType === "program") {
    if (isOn) sendCommand({ type: "program", number: config.midiNumber })
    return
  }

  if (!isOn) {
    sendCommand({ type: "noteoff", note: config.midiNumber, velocity: value })
    return
  }

  if (config.mode === "trigger" && config.offDelayMs > 0) {
    sendCommand({ type: "note", note: config.midiNumber, velocity: value, offDelayMs: config.offDelayMs })
    return
  }

  sendCommand({ type: "noteon", note: config.midiNumber, velocity: value })
}

function formatButtonMidiMeta(config: ButtonCustomization | undefined): string {
  if (!config) return "MIDI"
  if (config.messageType === "cc") return `CC ${config.midiNumber}`
  if (config.messageType === "program") return `P ${config.midiNumber}`
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
    width: "min(100%, 1280px)",
    margin: "0 auto",
    padding: {
      default: "18px",
      "@media (max-width: 760px)": "8px",
    },
    paddingBottom: "48px",
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
    marginTop: "16px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: "26px",
    backgroundColor: "#111827",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.34)",
    padding: {
      default: "18px",
      "@media (max-width: 760px)": "10px",
    },
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
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 900px)": "minmax(0, 1fr) 112px",
    },
    gap: "14px",
    borderRadius: "22px",
    backgroundColor: "#050814",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.08)",
    padding: {
      default: "14px",
      "@media (max-width: 760px)": "8px",
    },
  },
  padMatrix: {
    display: "grid",
    gridTemplateColumns: "repeat(8, minmax(34px, 1fr))",
    gap: {
      default: "8px",
      "@media (max-width: 760px)": "5px",
    },
  },
  padButton: {
    aspectRatio: "1 / 1",
    minWidth: 0,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: {
      default: "12px",
      "@media (max-width: 760px)": "8px",
    },
    backgroundColor: "#1f2937",
    color: "#e5e7eb",
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
  padLabel: {
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
    color: "rgba(255, 255, 255, 0.68)",
    fontSize: {
      default: "0.62rem",
      "@media (max-width: 760px)": "0.5rem",
    },
  },
  sceneColumn: {
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(4, minmax(0, 1fr))",
      "@media (min-width: 900px)": "1fr",
    },
    gap: "8px",
  },
  sceneLaunchButton: {
    minHeight: {
      default: "54px",
      "@media (min-width: 900px)": "auto",
    },
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(14, 165, 233, 0.42)",
    borderRadius: "12px",
    backgroundColor: "rgba(14, 165, 233, 0.14)",
    color: "#bae6fd",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    gap: "2px",
    fontWeight: 900,
    padding: "8px",
  },
  faderBank: {
    gridColumn: "1 / -1",
    display: "grid",
    gridTemplateColumns: "repeat(9, minmax(48px, 1fr))",
    gap: {
      default: "10px",
      "@media (max-width: 760px)": "6px",
    },
    marginTop: "10px",
  },
  faderStrip: {
    display: "grid",
    gridTemplateRows: "160px auto auto",
    justifyItems: "center",
    gap: "7px",
    borderRadius: "14px",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.08)",
    padding: "10px 4px",
    cursor: "context-menu",
  },
  verticalSliderTrack: {
    position: "relative",
    width: "8px",
    height: "150px",
    borderRadius: "999px",
    backgroundColor: "rgba(148, 163, 184, 0.22)",
  },
  verticalSliderFill: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: "999px",
    backgroundColor: "#8b5cf6",
  },
  verticalSliderThumb: {
    width: "28px",
    height: "18px",
    borderRadius: "7px",
    backgroundColor: "#e5e7eb",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "#111827",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.35)",
  },
  faderValue: {
    color: "#ddd6fe",
    fontSize: "0.72rem",
    fontWeight: 900,
  },
  faderName: {
    color: "#e5e7eb",
    fontSize: {
      default: "0.72rem",
      "@media (max-width: 760px)": "0.58rem",
    },
    textAlign: "center",
    lineHeight: 1.1,
  },
  faderCc: {
    color: "#94a3b8",
    fontSize: "0.62rem",
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
