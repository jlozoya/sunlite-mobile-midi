import * as stylex from "@stylexjs/stylex"
import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import {
  DEFAULT_CONTROLLER_MODEL,
  getControllerModel,
  type ControllerCustomization,
} from "../../shared/controller-config.ts"
import { MidiController } from "./components/MidiController"
import { AppSettings } from "./components/AppSettings"
import { AppTabIcon, type AppTabId as DesktopTab } from "./components/AppTabIcon"
import { Toast } from "./components/Toast"
import { AnimatedDisclosure } from "./components/AnimatedDisclosure"
import { AutomationStudio } from "./automation/AutomationStudio"
import { RekordboxWaveforms } from "./automation/RekordboxWaveforms"
import { useRekordboxVideoCapture } from "./automation/useRekordboxVideoCapture"
import { RouterPanel } from "./router/RouterPanel"
import { useIsMobileView } from "./hooks/useIsMobileView"
import { useControllerSocket } from "./useControllerSocket"
import { useServerStatus } from "./useServerStatus"
import { ActionButton, Notice, SectionHeader, StatusBadge, Surface } from "./ui-kit"
import { LIGHTING_SOFTWARE_LABELS } from "../../shared/lighting-software"
import { styles } from "./App.styles"
import { useConnectionSetup } from "./hooks/useConnectionSetup"

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
    description: "Dispositivos y router MIDI",
  },
  {
    id: "settings",
    label: "Configuración",
    description: "Software, móvil y actualizaciones",
  },
]

export function App() {
  useRekordboxVideoCapture()
  const {
    status,
    error: statusError,
    isLoading: statusLoading,
    refreshStatus,
  } = useServerStatus()
  const {
    connectionState,
    lastCommand,
    padStates,
    ccValues,
    controllerCustomization,
    setControllerCustomization,
    sendCommand,
    sendAutomationCommand,
  } = useControllerSocket()
  const setup = useConnectionSetup(refreshStatus)
  const { setupMessage, setSetupMessage } = setup
  const [activeDesktopTab, setActiveDesktopTab] = useState<DesktopTab>("controller")
  const initialTabSelected = useRef(false)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

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

  const software = status?.lightingSoftware ?? "sunlite"
  const softwareLabel = LIGHTING_SOFTWARE_LABELS[software]

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
  const connectionLabel = isOnline
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
    setActiveDesktopTab(isControllerReady ? "controller" : "settings")
  }, [isControllerReady, status])

  return (
    <main {...stylex.props(styles.app)}>
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
                tab.id === "settings" && Boolean(status) && !isControllerReady

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
                  <span {...stylex.props(styles.tabLabel)}>
                    <AppTabIcon tab={tab.id} />
                    {tab.label}
                  </span>
                  <span {...stylex.props(styles.tabDescription)}>{tab.description}</span>
                </button>
              )
            })}
          </div>
          <div {...stylex.props(styles.tabsStatus)}>
            <span {...stylex.props(styles.tabConnectionSummary)}>
              {statusError
                ? "Estado sin actualizar"
                : !status
                  ? "Comprobando MIDI…"
                  : isControllerReady
                    ? "MIDI listo"
                    : "Configuración pendiente"}
            </span>
            <StatusBadge
              tone={
                isOnline
                  ? "success"
                  : connectionState === "connecting"
                    ? "warning"
                    : "danger"
              }
              dot
              role="status"
            >
              {connectionLabel}
            </StatusBadge>
          </div>
        </nav>
      ) : null}

      {!isMobileView ? (
        <section
          id="desktop-panel-connection"
          role="tabpanel"
          aria-labelledby="desktop-tab-connection"
          hidden={activeDesktopTab !== "connection"}
          {...stylex.props(
            styles.desktopPanel,
            activeDesktopTab !== "connection" && styles.tabPanelHidden,
          )}
        >
          <RouterPanel />
        </section>
      ) : null}

      {!isMobileView ? (
        <section
          id="desktop-panel-automation"
          role="tabpanel"
          aria-labelledby="desktop-tab-automation"
          hidden={activeDesktopTab !== "automation"}
          {...stylex.props(
            styles.desktopPanel,
            activeDesktopTab !== "automation" && styles.tabPanelHidden,
          )}
        >
          <AutomationStudio
            key={software}
            sendAutomationCommand={sendAutomationCommand}
            captureVisible={activeDesktopTab === "automation"}
            onShowController={() => selectTab("controller")}
          />
        </section>
      ) : null}

      {isMobileView ? (
        <AnimatedDisclosure
          summary="Waveforms de Rekordbox"
          containerProps={stylex.props(styles.mobileWaveforms)}
          buttonProps={stylex.props(styles.mobileWaveformsTrigger)}
          unmountOnExit
        >
          <RekordboxWaveforms />
        </AnimatedDisclosure>
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
          {...stylex.props(
            styles.desktopPanel,
            activeDesktopTab !== "controller" && styles.tabPanelHidden,
          )}
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
                    : "La conexión MIDI todavía no está lista. La aplicación puede preparar los puertos automáticamente desde la pestaña Configuración."
                }
              />
              <ActionButton
                onPress={() => {
                  selectTab("settings")
                  tabRefs.current[3]?.focus()
                }}
              >
                Ir a Configuración
              </ActionButton>
            </Surface>
          )}
        </section>
      )}

      {!isMobileView ? (
        <section
          id="desktop-panel-settings"
          role="tabpanel"
          aria-labelledby="desktop-tab-settings"
          hidden={activeDesktopTab !== "settings"}
          {...stylex.props(
            styles.desktopPanel,
            activeDesktopTab !== "settings" && styles.tabPanelHidden,
          )}
        >
          <AppSettings status={status} statusError={statusError} setup={setup} />
        </section>
      ) : null}

      {setupMessage ? (
        <Toast message={setupMessage} onDismiss={() => setSetupMessage(null)} />
      ) : null}
    </main>
  )
}
