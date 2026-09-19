import * as stylex from "@stylexjs/stylex"
import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import {
  DEFAULT_CONTROLLER_MODEL,
  getControllerModel,
  type ControllerCustomization,
} from "../../shared/controller-config.ts"
import { MidiController } from "./components/MidiController"
import { AppUpdates } from "./components/AppUpdates"
import { Toast } from "./components/Toast"
import { AutomationStudio } from "./automation/AutomationStudio"
import { RouterPanel } from "./router/RouterPanel"
import { useIsMobileView } from "./hooks/useIsMobileView"
import { useControllerSocket } from "./useControllerSocket"
import { useServerStatus } from "./useServerStatus"
import { ActionButton, Notice, SectionHeader, StatusBadge, Surface } from "./ui-kit"

import {
  LIGHTING_SOFTWARE_LABELS,
  type LightingSoftware,
} from "../../shared/lighting-software"

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
  {
    id: "connection",
    label: "Conexión",
    description: "Software, red, teléfono y router MIDI",
  },
]

export function App() {
  const {
    status,
    error: statusError,
    isLoading: statusLoading,
    refreshStatus,
  } = useServerStatus()
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
  const [softwareBusy, setSoftwareBusy] = useState(false)
  const [copyBusy, setCopyBusy] = useState(false)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const urlRef = useRef<HTMLInputElement | null>(null)

  function selectTab(tab: DesktopTab) {
    initialTabSelected.current = true
    setActiveDesktopTab(tab)
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex =
      event.key === "ArrowRight"
        ? (index + 1) % DESKTOP_TABS.length
        : event.key === "ArrowLeft"
          ? (index + DESKTOP_TABS.length - 1) % DESKTOP_TABS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? DESKTOP_TABS.length - 1
              : null
    if (nextIndex === null) return
    event.preventDefault()
    selectTab(DESKTOP_TABS[nextIndex].id)
    tabRefs.current[nextIndex]?.focus()
  }

  async function copyControllerUrl() {
    if (!status?.preferredLanUrl || copyBusy) return
    setCopyBusy(true)
    try {
      await navigator.clipboard.writeText(status.preferredLanUrl)
      setSetupMessage(
        "Enlace copiado. Ábrelo en un dispositivo conectado a la misma red Wi-Fi.",
      )
    } catch {
      urlRef.current?.focus()
      urlRef.current?.select()
      setSetupMessage(
        "No se pudo copiar automáticamente. El enlace está seleccionado para copiarlo manualmente.",
      )
    } finally {
      setCopyBusy(false)
    }
  }
  const software = status?.lightingSoftware ?? "sunlite"
  const softwareLabel = LIGHTING_SOFTWARE_LABELS[software]

  async function changeLightingSoftware(next: LightingSoftware) {
    setSoftwareBusy(true)
    try {
      const response = await fetch("/api/lighting-software", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ software: next }),
      })
      if (!response.ok) {
        const payload = await response.json()
        throw new Error(payload.message ?? "No se pudo cambiar de software")
      }
      await refreshStatus()
      setSetupMessage(
        "Perfil cargado en modo Manual. Revisa el mapeo antes de activar Auto.",
      )
    } catch (error) {
      setSetupMessage(
        error instanceof Error ? error.message : "Error al cambiar de software",
      )
    } finally {
      setSoftwareBusy(false)
    }
  }

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

      await refreshStatus()

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
        payload?.message ?? `No se pudo guardar la configuración: ${response.status}`,
      )
    }

    const saved = (await response.json()) as ControllerCustomization
    setControllerCustomization(saved)
  }

  const isOnline = connectionState === "online"
  const statusLabel = isOnline
    ? "Conectado"
    : connectionState === "connecting"
      ? "Conectando…"
      : "Sin conexión"
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
          <p {...stylex.props(styles.eyebrow)}>{softwareLabel}</p>
          <h1 {...stylex.props(styles.title)}>Controlador MIDI</h1>
          <p {...stylex.props(styles.subtitle)}>
            {serverMidiLabel ?? "Esperando conexión con el servidor MIDI"}
          </p>
        </div>

        <StatusBadge
          tone={
            isOnline ? "success" : connectionState === "connecting" ? "warning" : "danger"
          }
          dot
          role="status"
        >
          {statusLabel}
        </StatusBadge>
      </header>

      {!isOnline || statusError ? (
        <Notice
          tone={statusError ? "danger" : "warning"}
          {...stylex.props(styles.connectionNotice)}
          role="status"
        >
          <div {...stylex.props(styles.setupStepCopy)}>
            <strong>
              {!isOnline
                ? "Reconectando con el servidor"
                : "No se pudo actualizar el estado"}
            </strong>
            <span>
              {!isOnline
                ? "Los controles MIDI estarán disponibles cuando se restablezca la conexión. Comprueba que la aplicación siga abierta en la computadora."
                : statusError}
            </span>
          </div>
          <ActionButton
            variant="secondary"
            isDisabled={statusLoading}
            onPress={() => void refreshStatus()}
          >
            {statusLoading ? "Comprobando…" : "Comprobar conexión"}
          </ActionButton>
        </Notice>
      ) : null}

      {!isMobileView ? <AppUpdates /> : null}

      {!isMobileView ? (
        <nav {...stylex.props(styles.tabs)} aria-label="Secciones de la aplicación">
          <div
            {...stylex.props(styles.tabList)}
            role="tablist"
            aria-label="Secciones de la aplicación"
          >
            {DESKTOP_TABS.map((tab, index) => {
              const isActive = activeDesktopTab === tab.id
              const needsAttention =
                tab.id === "connection" && Boolean(status) && !isControllerReady

              return (
                <button
                  key={tab.id}
                  id={`desktop-tab-${tab.id}`}
                  type="button"
                  ref={(element) => {
                    tabRefs.current[index] = element
                  }}
                  tabIndex={isActive ? 0 : -1}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`desktop-panel-${tab.id}`}
                  {...stylex.props(
                    styles.tab,
                    isActive && styles.tabActive,
                    needsAttention && styles.tabAttention,
                  )}
                  onClick={() => selectTab(tab.id)}
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
            {statusError
              ? "Estado sin actualizar"
              : !status
                ? "Comprobando MIDI…"
                : isControllerReady
                  ? "MIDI listo"
                  : "Configuración pendiente"}
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
                title="Conecta tu teléfono"
                description="Escanea el código QR desde un dispositivo conectado a la misma red Wi-Fi."
              />

              {status?.qrDataUrl ? (
                <div {...stylex.props(styles.qrWrap)}>
                  <img
                    {...stylex.props(styles.qrImage)}
                    src={status.qrDataUrl}
                    alt="Código QR para abrir el controlador en tu teléfono"
                  />
                </div>
              ) : (
                <div {...stylex.props(styles.qrPlaceholder)}>
                  {statusError ? "Código QR no disponible" : "Preparando código QR…"}
                </div>
              )}

              <div {...stylex.props(styles.shareLink)}>
                <label htmlFor="controller-url" {...stylex.props(styles.shareLabel)}>
                  Enlace del controlador
                </label>
                <input
                  id="controller-url"
                  ref={urlRef}
                  {...stylex.props(styles.urlBox)}
                  readOnly
                  value={status?.preferredLanUrl ?? ""}
                  placeholder="Detectando dirección de red…"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <ActionButton
                  variant="secondary"
                  stretch
                  isDisabled={!status?.preferredLanUrl || copyBusy}
                  onPress={() => void copyControllerUrl()}
                >
                  {copyBusy ? "Copiando…" : "Copiar enlace"}
                </ActionButton>
              </div>

              {status?.networkUrlCandidates && status.networkUrlCandidates.length > 1 ? (
                <div {...stylex.props(styles.networkList)}>
                  <strong>Otras direcciones de red</strong>
                  {status.networkUrlCandidates.slice(1).map((candidate) => (
                    <span key={`${candidate.interfaceName}-${candidate.address}`}>
                      {candidate.url} · {candidate.interfaceName} · {candidate.note}
                    </span>
                  ))}
                </div>
              ) : null}
            </Surface>

            <Surface {...stylex.props(styles.connectionPanel)}>
              <SectionHeader
                title="Conexión automática"
                description={`La aplicación prepara los puertos MIDI para ${softwareLabel}.`}
              />

              <div {...stylex.props(styles.setupFlow)}>
                <div
                  role="group"
                  aria-label="Software de luces"
                  {...stylex.props(styles.setupActions)}
                >
                  {(["sunlite", "freestyler"] as const).map((value) => (
                    <ActionButton
                      key={value}
                      variant={software === value ? "primary" : "secondary"}
                      aria-pressed={software === value}
                      isDisabled={!status || softwareBusy}
                      onPress={() => {
                        if (software !== value) void changeLightingSoftware(value)
                      }}
                    >
                      {LIGHTING_SOFTWARE_LABELS[value]}
                    </ActionButton>
                  ))}
                </div>
                <Notice layout="stack">
                  <strong>Configurar {softwareLabel}</strong>
                  {software === "freestyler" ? (
                    <span>
                      En Setup → FreeStyler Setup → External Control → MIDI Control, elige{" "}
                      {status?.expectedMidiOutputName ?? "Sunlite Mobile In"} como entrada
                      y {status?.expectedMidiInputName ?? "Sunlite Mobile Out"} como
                      salida opcional. Activa Start y Learn, selecciona Note IN de la
                      función, pulsa el control en esta app y guarda con Save. Usa Key Up
                      como Note On con valor 0. Para automatización, asigna las funciones
                      como Page independent.
                    </span>
                  ) : (
                    <span>
                      Selecciona {status?.expectedMidiOutputName ?? "Sunlite Mobile In"}{" "}
                      como entrada y{" "}
                      {status?.expectedMidiInputName ?? "Sunlite Mobile Out"} como retorno
                      MIDI. Asigna los controles a las escenas de tu show.
                    </span>
                  )}
                  <span>
                    Los controles y el entrenamiento se guardan por software. Graba desde
                    Controlador y prueba el modo Asistido antes de Auto. El retorno visual
                    requiere que el software envíe feedback.
                  </span>
                </Notice>
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
                      <span>
                        {status.loopMidiInstallerAvailable
                          ? "Solo tendrás que aceptar el permiso de Windows."
                          : "Instala el puente MIDI una vez en este equipo."}
                      </span>
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
                        Instala loopMIDI desde{" "}
                        <a
                          href="https://www.tobias-erichsen.de/software/loopmidi.html"
                          target="_blank"
                          rel="noreferrer"
                        >
                          su sitio oficial
                        </a>{" "}
                        y pulsa Reintentar para crear los puertos.
                        <ActionButton
                          variant="secondary"
                          isDisabled={setupBusy !== null}
                          onPress={() => void runSetupAction("install")}
                        >
                          Reintentar
                        </ActionButton>
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
                        isDisabled={setupBusy !== null}
                        onPress={() => void runSetupAction("refresh")}
                      >
                        {setupBusy === "refresh"
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
                        {softwareLabel} puede recibir comandos por{" "}
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
                        isDisabled={setupBusy !== null}
                        onPress={() => void runSetupAction("refresh")}
                      >
                        {setupBusy === "refresh" ? "Actualizando..." : "Comprobar"}
                      </ActionButton>
                    </div>
                  </Notice>
                )}
              </div>

              {status && (!status.midiReady || !status.feedbackReady) ? (
                <div {...stylex.props(styles.portList)}>
                  <strong>Salidas MIDI disponibles</strong>
                  <span>
                    {status.availableMidiOutputs.length
                      ? status.availableMidiOutputs.join(", ")
                      : "Todavía no se detectan salidas MIDI."}
                  </span>
                  <strong>Entradas MIDI disponibles</strong>
                  <span>
                    {status.availableMidiInputs.length
                      ? status.availableMidiInputs.join(", ")
                      : "Todavía no se detectan entradas MIDI."}
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

          <RouterPanel />
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
          <AutomationStudio
            key={software}
            sendAutomationCommand={sendAutomationCommand}
          />
        </section>
      ) : null}

      {isMobileView ? (
        isControllerReady ? (
          <MidiController
            isConnected={isOnline}
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
              title={
                !status && !statusError
                  ? "Preparando el controlador"
                  : "Controlador no disponible"
              }
              description={
                !status ? (
                  "Comprobando la conexión MIDI con la computadora…"
                ) : (
                  <>
                    Termina la conexión con {softwareLabel} desde la computadora. El
                    controlador aparecerá aquí en cuanto el puerto MIDI esté listo.
                  </>
                )
              }
            />
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
              isConnected={isOnline}
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
                title={
                  !status && !statusError
                    ? "Preparando el controlador"
                    : "Controlador no disponible"
                }
                description={
                  !status
                    ? (statusError ?? "Comprobando el puente MIDI y los puertos locales…")
                    : "La conexión MIDI todavía no está lista. La aplicación puede preparar los puertos automáticamente desde la pestaña Conexión."
                }
              />
              <ActionButton
                onPress={() => {
                  selectTab("connection")
                  tabRefs.current[2]?.focus()
                }}
              >
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
    flexWrap: "nowrap",
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
    fontSize: {
      default: "clamp(1.9rem, 4vw, 3rem)",
      "@media (max-width: 760px)": "1.3rem",
    },
    lineHeight: 1.02,
  },
  subtitle: {
    overflowWrap: "anywhere",
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
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
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
    outline: { default: "none", ":focus-visible": "2px solid #a78bfa" },
    outlineOffset: "2px",
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
    display: { default: "flex", "@media (max-width: 1050px)": "none" },
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
      "@media (min-width: 1100px)": "340px minmax(0, 1fr)",
    },
    gap: "16px",
  },
  connectionPanel: { marginTop: "16px" },
  qrPanel: {
    marginTop: "16px",
    display: "grid",
    justifyItems: "center",
    alignSelf: "start",
  },
  qrWrap: {
    width: "min(100%, 260px)",
    boxSizing: "border-box",
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
  connectionNotice: {
    marginTop: "12px",
    flexWrap: "wrap",
  },
  shareLink: {
    display: "grid",
    gap: "10px",
    width: "100%",
    marginTop: "16px",
  },
  shareLabel: {
    fontSize: "0.78rem",
    fontWeight: 800,
    color: "#cbd5e1",
  },
  urlBox: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid rgba(139, 92, 246, 0.3)",
    outline: { default: "none", ":focus-visible": "2px solid #a78bfa" },
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
    boxSizing: "border-box",
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
