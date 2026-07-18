import * as stylex from "@stylexjs/stylex"
import { useEffect, useRef, useState } from "react"
import {
  DEFAULT_CONTROLLER_MODEL,
  getControllerModel,
  type ControllerCustomization,
} from "../../shared/controller-config.ts"
import { MidiController } from "./components/MidiController"
import { Toast } from "./components/Toast"
import { AutomationStudio } from "./automation/AutomationStudio"
import { useIsMobileView } from "./hooks/useIsMobileView"
import { useControllerSocket } from "./useControllerSocket"
import { useServerStatus } from "./useServerStatus"
import { ActionButton, Notice, SectionHeader, StatusBadge, Surface } from "./ui-kit"

type DesktopTab = "controller" | "automation" | "connection"

const DESKTOP_TABS: Array<{
  id: DesktopTab
  label: string
  description: string
}> = [
  { id: "controller", label: "Controlador", description: "Escenas y faders MIDI" },
  {
    id: "automation",
    label: "Automatización",
    description: "Audio, CDJ y entrenamiento",
  },
  { id: "connection", label: "Conexión", description: "Sunlite, red y teléfono" },
]

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
    sendAutomationCommand,
  } = useControllerSocket()
  const [setupMessage, setSetupMessage] = useState<string | null>(null)
  const [setupBusy, setSetupBusy] = useState<"install" | "refresh" | null>(null)
  const [activeDesktopTab, setActiveDesktopTab] = useState<DesktopTab>("controller")
  const initialTabSelected = useRef(false)

  async function runSetupAction(action: "install" | "refresh") {
    setSetupBusy(action)
    setSetupMessage(null)

    try {
      const endpoint =
        action === "install" ? "/api/loopmidi/install" : "/api/midi/refresh"
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

      const refreshedStatus = await refreshStatus()

      if (refreshedStatus?.loopMidiInstalled && refreshedStatus.midiReady) {
        setActiveDesktopTab("controller")
      }

      if (action === "install") {
        setSetupMessage(
          payload.code === 0 || payload.skipped
            ? "El puente MIDI quedó configurado automáticamente."
            : "Windows no pudo terminar la preparación del puente MIDI.",
        )
      } else {
        setSetupMessage("Puertos MIDI actualizados.")
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
  const isControllerReady = Boolean(status?.loopMidiInstalled && status?.midiReady)
  const isMobileView = useIsMobileView()
  const controllerModel = getControllerModel(
    controllerCustomization.modelId ?? DEFAULT_CONTROLLER_MODEL.id,
  )

  useEffect(() => {
    if (!status || initialTabSelected.current) return
    initialTabSelected.current = true
    setActiveDesktopTab(isControllerReady ? "controller" : "connection")
  }, [isControllerReady, status])

  return (
    <main {...stylex.props(styles.app)}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headerCopy)}>
          <p {...stylex.props(styles.eyebrow)}>Sunlite Suite 2</p>
          <h1 {...stylex.props(styles.title)}>Mobile MIDI Controller</h1>
          <p {...stylex.props(styles.subtitle)}>
            {serverMidiLabel ?? "Waiting for MIDI server"}
          </p>
        </div>

        <StatusBadge tone={isOnline ? "success" : "danger"} dot>
          {statusLabel}
        </StatusBadge>
      </header>

      {!isMobileView ? (
        <nav {...stylex.props(styles.tabs)} aria-label="Secciones de la aplicación">
          <div {...stylex.props(styles.tabList)} role="tablist">
            {DESKTOP_TABS.map((tab) => {
              const isActive = activeDesktopTab === tab.id
              const needsAttention = tab.id === "connection" && !isControllerReady

              return (
                <button
                  key={tab.id}
                  id={`desktop-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`desktop-panel-${tab.id}`}
                  {...stylex.props(
                    styles.tab,
                    isActive && styles.tabActive,
                    needsAttention && styles.tabAttention,
                  )}
                  onClick={() => setActiveDesktopTab(tab.id)}
                >
                  <span {...stylex.props(styles.tabLabel)}>{tab.label}</span>
                  <span {...stylex.props(styles.tabDescription)}>{tab.description}</span>
                </button>
              )
            })}
          </div>
          <div {...stylex.props(styles.tabConnectionSummary)}>
            <span
              {...stylex.props(
                styles.tabConnectionDot,
                isControllerReady
                  ? styles.tabConnectionDotReady
                  : styles.tabConnectionDotWarning,
              )}
            />
            {isControllerReady ? "MIDI listo" : "Configuración pendiente"}
          </div>
        </nav>
      ) : null}

      {!isMobileView ? (
        <section
          id="desktop-panel-connection"
          role="tabpanel"
          aria-labelledby="desktop-tab-connection"
          hidden={activeDesktopTab !== "connection"}
          {...stylex.props(activeDesktopTab !== "connection" && styles.tabPanelHidden)}
        >
          <section {...stylex.props(styles.heroGrid)}>
            <Surface {...stylex.props(styles.qrPanel)}>
              <SectionHeader
                title="Open on phone"
                description="Scan this QR from a device connected to the same Wi‑Fi network."
              />

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
            </Surface>

            <Surface {...stylex.props(styles.connectionPanel)}>
              <SectionHeader
                title="Conexión automática"
                description="La aplicación prepara y abre por sí sola los puertos necesarios para comunicarse con Sunlite."
              />

              <div {...stylex.props(styles.setupFlow)}>
                {!status ? (
                  <Notice>
                    <div {...stylex.props(styles.setupStepCopy)}>
                      <strong>Preparando la conexión</strong>
                      <span>Comprobando el puente MIDI y los puertos locales.</span>
                    </div>
                  </Notice>
                ) : !status.loopMidiInstalled ? (
                  <Notice tone="warning">
                    <div {...stylex.props(styles.setupStepCopy)}>
                      <strong>Se necesita preparar el puente MIDI</strong>
                      <span>Solo tendrás que aceptar el permiso de Windows.</span>
                    </div>
                    {status.loopMidiInstallerAvailable ? (
                      <ActionButton
                        isDisabled={setupBusy !== null}
                        onPress={() => void runSetupAction("install")}
                      >
                        {setupBusy === "install"
                          ? "Preparando..."
                          : "Preparar automáticamente"}
                      </ActionButton>
                    ) : (
                      <span {...stylex.props(styles.setupUnavailable)}>
                        El componente MIDI no está incluido en esta compilación.
                      </span>
                    )}
                  </Notice>
                ) : !status.midiReady ? (
                  <Notice tone="warning">
                    <div {...stylex.props(styles.setupStepCopy)}>
                      <strong>Terminando la conexión MIDI</strong>
                      <span>
                        La configuración automática no terminó correctamente. Puedes
                        volver a intentarlo sin crear puertos manualmente.
                      </span>
                    </div>
                    <div {...stylex.props(styles.setupActions)}>
                      <ActionButton
                        isDisabled={setupBusy !== null}
                        onPress={() => void runSetupAction("install")}
                      >
                        {setupBusy === "install" ? "Preparando..." : "Reintentar"}
                      </ActionButton>
                      <ActionButton
                        variant="secondary"
                        isDisabled={setupBusy !== null || isLoading}
                        onPress={() => void runSetupAction("refresh")}
                      >
                        {setupBusy === "refresh" || isLoading
                          ? "Actualizando..."
                          : "Comprobar puertos"}
                      </ActionButton>
                    </div>
                  </Notice>
                ) : (
                  <Notice tone="success">
                    <div {...stylex.props(styles.setupStepCopy)}>
                      <strong>Puente MIDI listo</strong>
                      <span>
                        Sunlite puede recibir comandos por{" "}
                        <strong>{status.midiOutputName}</strong>.{" "}
                        {status.feedbackReady ? (
                          <>
                            El retorno por <strong>{status.midiInputName}</strong> está
                            disponible.{" "}
                          </>
                        ) : (
                          <>El retorno visual es opcional. </>
                        )}
                        Canal MIDI <strong>{status.midiChannel}</strong>.
                      </span>
                    </div>
                    <div {...stylex.props(styles.setupActions)}>
                      <ActionButton
                        variant="secondary"
                        isDisabled={setupBusy !== null || isLoading}
                        onPress={() => void runSetupAction("refresh")}
                      >
                        {setupBusy === "refresh" || isLoading
                          ? "Actualizando..."
                          : "Comprobar"}
                      </ActionButton>
                    </div>
                  </Notice>
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
                <p {...stylex.props(styles.warningText)}>
                  {status.feedbackDisabledReason}
                </p>
              ) : null}
            </Surface>
          </section>
        </section>
      ) : null}

      {!isMobileView ? (
        <section
          id="desktop-panel-automation"
          role="tabpanel"
          aria-labelledby="desktop-tab-automation"
          hidden={activeDesktopTab !== "automation"}
          {...stylex.props(activeDesktopTab !== "automation" && styles.tabPanelHidden)}
        >
          <AutomationStudio sendAutomationCommand={sendAutomationCommand} />
        </section>
      ) : null}

      {isMobileView ? (
        isControllerReady ? (
          <MidiController
            model={controllerModel}
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
          <Surface {...stylex.props(styles.controlsLockedPanel)}>
            <SectionHeader
              title="Controlador no disponible"
              description={
                isMobileView ? (
                  <>
                    Termina la conexión con Sunlite desde la computadora. El controlador
                    aparecerá aquí en cuanto el puerto MIDI esté listo.
                  </>
                ) : (
                  <>
                    La conexión MIDI todavía no está lista. La aplicación puede preparar
                    los puertos automáticamente desde la pestaña Conexión.
                  </>
                )
              }
            />
            {!isMobileView ? (
              <ActionButton onPress={() => setActiveDesktopTab("connection")}>
                Ir a Conexión
              </ActionButton>
            ) : null}
          </Surface>
        )
      ) : (
        <section
          id="desktop-panel-controller"
          role="tabpanel"
          aria-labelledby="desktop-tab-controller"
          hidden={activeDesktopTab !== "controller"}
          {...stylex.props(activeDesktopTab !== "controller" && styles.tabPanelHidden)}
        >
          {isControllerReady ? (
            <MidiController
              model={controllerModel}
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
            <Surface {...stylex.props(styles.controlsLockedPanel)}>
              <SectionHeader
                title="Controlador no disponible"
                description="La conexión MIDI todavía no está lista. La aplicación puede preparar los puertos automáticamente desde la pestaña Conexión."
              />
              <ActionButton onPress={() => setActiveDesktopTab("connection")}>
                Ir a Conexión
              </ActionButton>
            </Surface>
          )}
        </section>
      )}

      {setupMessage ? (
        <Toast message={setupMessage} onDismiss={() => setSetupMessage(null)} />
      ) : null}
    </main>
  )
}

const styles = stylex.create({
  app: {
    width: "100%",
    maxWidth: "none",
    minWidth: {
      default: "360px",
      "@media (max-width: 400px)": 0,
    },
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
    flexWrap: {
      default: "nowrap",
      "@media (max-width: 760px)": "wrap",
    },
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    backgroundColor: "rgba(8, 10, 18, 0.92)",
    backdropFilter: "blur(12px)",
    padding: "18px 0 16px",
  },
  headerCopy: {
    flex: "1 1 260px",
    minWidth: 0,
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
  tabs: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "14px",
    marginTop: "16px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: "20px",
    backgroundColor: "rgba(18, 22, 38, 0.82)",
    boxShadow: "0 12px 36px rgba(0, 0, 0, 0.22)",
    padding: "7px",
  },
  tabList: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(150px, 1fr))",
    gap: "6px",
    flex: 1,
  },
  tab: {
    position: "relative",
    display: "grid",
    gap: "3px",
    minWidth: 0,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "transparent",
    borderRadius: "14px",
    backgroundColor: "transparent",
    color: "#94a3b8",
    cursor: "pointer",
    padding: "11px 14px",
    textAlign: "left",
    transition: "background-color 150ms ease, border-color 150ms ease, color 150ms ease",
  },
  tabActive: {
    borderColor: "rgba(139, 92, 246, 0.5)",
    backgroundColor: "rgba(139, 92, 246, 0.16)",
    color: "#f5f3ff",
  },
  tabAttention: {
    color: "#fcd34d",
  },
  tabLabel: {
    fontSize: "0.92rem",
    fontWeight: 900,
  },
  tabDescription: {
    color: "#94a3b8",
    fontSize: "0.72rem",
    lineHeight: 1.3,
  },
  tabConnectionSummary: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexShrink: 0,
    padding: "0 12px 0 6px",
    color: "#cbd5e1",
    fontSize: "0.78rem",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  tabConnectionDot: {
    width: "8px",
    height: "8px",
    borderRadius: "999px",
    boxShadow: "0 0 12px currentColor",
  },
  tabConnectionDotReady: {
    backgroundColor: "#34d399",
    color: "#34d399",
  },
  tabConnectionDotWarning: {
    backgroundColor: "#fbbf24",
    color: "#fbbf24",
  },
  tabPanelHidden: {
    display: "none",
  },
  heroGrid: {
    display: "grid",
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 900px)": "360px 1fr",
    },
    gap: "16px",
  },
  connectionPanel: { marginTop: "16px" },
  qrPanel: {
    marginTop: "16px",
    display: "grid",
    justifyItems: "center",
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
  controlsLockedPanel: {
    marginTop: "16px",
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
