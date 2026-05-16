import * as stylex from "@stylexjs/stylex"
import { useState } from "react"
import { Button } from "react-aria-components"
import type { ControllerCustomization } from "../../shared/controller-config.ts"
import { ApcController } from "./components/ApcController"
import { useIsMobileView } from "./hooks/useIsMobileView"
import { styles } from "./styles"
import { useControllerSocket } from "./useControllerSocket"
import { useServerStatus } from "./useServerStatus"

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

