import * as stylex from "@stylexjs/stylex"
import { useState } from "react"
import { Button } from "react-aria-components"
import type { ControllerCustomization } from "../../shared/controller-config.ts"
import { ApcController } from "./components/ApcController"
import { useIsMobileView } from "./hooks/useIsMobileView"
import { useControllerSocket } from "./useControllerSocket"
import { useServerStatus } from "./useServerStatus"

export function App() {
  const { status, error: statusError, isLoading, refreshStatus } = useServerStatus()
  const {
    connectionState,
    lastCommand,
    serverMidiLabel,
    padStates,
    ccValues,
    controllerCustomization,
    setControllerCustomization,
    sendCommand,
  } = useControllerSocket()
  const [setupMessage, setSetupMessage] = useState<string | null>(null)
  const [setupBusy, setSetupBusy] = useState<"install" | "open" | "refresh" | null>(null)

  async function runSetupAction(action: "install" | "open" | "refresh") {
    setSetupBusy(action)
    setSetupMessage(null)

    try {
      const endpoint =
        action === "install"
          ? "/api/loopmidi/install"
          : action === "open"
            ? "/api/loopmidi/open"
            : "/api/midi/refresh"
      const response = await fetch(endpoint, { method: "POST" })
      const payload = (await response.json()) as {
        ok?: boolean
        message?: string
        code?: number | null
        skipped?: boolean
      }

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
        setSetupMessage(
          "loopMIDI was opened. Create two ports named Sunlite Mobile In and Sunlite Mobile Out, then refresh MIDI ports.",
        )
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
      const payload = (await response.json().catch(() => null)) as {
        message?: string
      } | null
      throw new Error(
        payload?.message ?? `Failed to save controller config: ${response.status}`,
      )
    }

    const saved = (await response.json()) as ControllerCustomization
    setControllerCustomization(saved)
  }

  const isOnline = connectionState === "online"
  const statusLabel = isOnline
    ? "Online"
    : connectionState === "connecting"
      ? "Connecting"
      : "Offline"
  const shouldShowOpenLoopMidi = Boolean(status?.loopMidiExecutablePath)
  const isControllerReady = Boolean(status?.loopMidiInstalled && status?.midiReady)
  const isMobileView = useIsMobileView()

  return (
    <main {...stylex.props(styles.app)}>
      <header {...stylex.props(styles.header)}>
        <div>
          <p {...stylex.props(styles.eyebrow)}>Sunlite Suite 2</p>
          <h1 {...stylex.props(styles.title)}>Mobile MIDI Controller</h1>
          <p {...stylex.props(styles.subtitle)}>
            {serverMidiLabel ?? "Waiting for MIDI server"}
          </p>
        </div>

        <div
          {...stylex.props(
            styles.status,
            isOnline ? styles.statusOnline : styles.statusOffline,
          )}
        >
          {statusLabel}
        </div>
      </header>

      {!isMobileView ? (
        <section {...stylex.props(styles.heroGrid)}>
          <section {...stylex.props(styles.panel, styles.qrPanel)}>
            <div {...stylex.props(styles.sectionHeader)}>
              <h2 {...stylex.props(styles.sectionTitle)}>Open on phone</h2>
              <p {...stylex.props(styles.sectionDescription)}>
                Scan this QR from a device connected to the same Wi‑Fi network.
              </p>
            </div>

            {status?.qrDataUrl ? (
              <div {...stylex.props(styles.qrWrap)}>
                <img
                  {...stylex.props(styles.qrImage)}
                  src={status.qrDataUrl}
                  alt="Mobile controller QR code"
                />
              </div>
            ) : (
              <div {...stylex.props(styles.qrPlaceholder)}>Loading QR</div>
            )}

            <div {...stylex.props(styles.urlBox)}>
              {status?.preferredLanUrl ?? "Detecting LAN URL"}
            </div>

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

            {statusError ? (
              <p {...stylex.props(styles.errorText)}>{statusError}</p>
            ) : null}
          </section>

          <section {...stylex.props(styles.panel)}>
            <div {...stylex.props(styles.sectionHeader)}>
              <h2 {...stylex.props(styles.sectionTitle)}>Setup</h2>
              <p {...stylex.props(styles.sectionDescription)}>
                Configure two loopMIDI ports once. The controller appears after{" "}
                <strong>Sunlite Mobile In</strong> is ready.{" "}
                <strong>Sunlite Mobile Out</strong> is optional and only used for
                feedback.
              </p>
            </div>

            <div {...stylex.props(styles.setupFlow)}>
              {!status ? (
                <div {...stylex.props(styles.currentStep)}>
                  <div {...stylex.props(styles.setupStepCopy)}>
                    <strong>Loading setup status</strong>
                    <span>
                      Checking loopMIDI, available MIDI ports, and LAN controller URL.
                    </span>
                  </div>
                </div>
              ) : !status.loopMidiInstalled ? (
                <div {...stylex.props(styles.currentStep, styles.currentStepWarning)}>
                  <div {...stylex.props(styles.setupStepCopy)}>
                    <strong>1. Install loopMIDI</strong>
                    <span>Install the virtual MIDI driver first.</span>
                  </div>
                  {status.loopMidiInstallerAvailable ? (
                    <Button
                      {...stylex.props(styles.setupButton)}
                      isDisabled={setupBusy !== null}
                      onPress={() => void runSetupAction("install")}
                    >
                      {setupBusy === "install" ? "Installing..." : "Install loopMIDI"}
                    </Button>
                  ) : (
                    <span {...stylex.props(styles.setupUnavailable)}>
                      loopMIDI installer is not bundled with this app.
                    </span>
                  )}
                </div>
              ) : !status.midiReady ? (
                <div {...stylex.props(styles.currentStep, styles.currentStepWarning)}>
                  <div {...stylex.props(styles.setupStepCopy)}>
                    <strong>2. Create the Sunlite Mobile MIDI ports</strong>
                    <span>
                      Open loopMIDI. Create <strong>Sunlite Mobile In</strong> first.
                      Create <strong>Sunlite Mobile Out</strong> only if you want feedback
                      from Sunlite. Then refresh.
                    </span>
                  </div>
                  <div {...stylex.props(styles.setupActions)}>
                    {shouldShowOpenLoopMidi ? (
                      <Button
                        {...stylex.props(styles.setupButton)}
                        isDisabled={setupBusy !== null}
                        onPress={() => void runSetupAction("open")}
                      >
                        {setupBusy === "open" ? "Opening..." : "Open loopMIDI"}
                      </Button>
                    ) : (
                      <span {...stylex.props(styles.setupUnavailable)}>
                        loopMIDI executable not found.
                      </span>
                    )}
                    <Button
                      {...stylex.props(styles.setupButton, styles.setupButtonSecondary)}
                      isDisabled={setupBusy !== null || isLoading}
                      onPress={() => void runSetupAction("refresh")}
                    >
                      {setupBusy === "refresh" || isLoading
                        ? "Refreshing..."
                        : "Refresh MIDI ports"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div {...stylex.props(styles.currentStep, styles.currentStepReady)}>
                  <div {...stylex.props(styles.setupStepCopy)}>
                    <strong>Setup complete</strong>
                    <span>
                      MIDI to Sunlite <strong>{status.midiOutputName}</strong> is ready.{" "}
                      {status.feedbackReady ? (
                        <>
                          Feedback from Sunlite <strong>{status.midiInputName}</strong> is
                          enabled.{" "}
                        </>
                      ) : (
                        <>
                          MIDI feedback is disabled or missing; buttons stay unlit until
                          Sunlite MIDI OUT is configured.{" "}
                        </>
                      )}
                      In Sunlite, use MIDI channel <strong>{status.midiChannel}</strong>.
                    </span>
                  </div>
                  <Button
                    {...stylex.props(styles.setupButton, styles.setupButtonSecondary)}
                    isDisabled={setupBusy !== null || isLoading}
                    onPress={() => void runSetupAction("refresh")}
                  >
                    {setupBusy === "refresh" || isLoading
                      ? "Refreshing..."
                      : "Refresh MIDI ports"}
                  </Button>
                </div>
              )}
            </div>

            {status && (!status.midiReady || !status.feedbackReady) ? (
              <div {...stylex.props(styles.portList)}>
                <strong>Available MIDI outputs</strong>
                <span>
                  {status.availableMidiOutputs.length
                    ? status.availableMidiOutputs.join(", ")
                    : "No MIDI outputs detected yet."}
                </span>
                <strong>Available MIDI inputs</strong>
                <span>
                  {status.availableMidiInputs.length
                    ? status.availableMidiInputs.join(", ")
                    : "No MIDI inputs detected yet."}
                </span>
              </div>
            ) : null}

            {status?.feedbackDisabledReason ? (
              <p {...stylex.props(styles.warningText)}>{status.feedbackDisabledReason}</p>
            ) : null}
            {setupMessage ? (
              <p {...stylex.props(styles.setupMessage)}>{setupMessage}</p>
            ) : null}
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
              {isMobileView ? (
                <>
                  Finish loopMIDI and Sunlite setup on the computer first. This mobile
                  view only shows the controller once the MIDI output port is ready.
                </>
              ) : (
                <>
                  The controller appears after loopMIDI is installed and{" "}
                  <strong>Sunlite Mobile In</strong> is detected.{" "}
                  <strong>Sunlite Mobile Out</strong> is optional for feedback.
                </>
              )}
            </p>
          </div>
        </section>
      )}
    </main>
  )
}

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
})
