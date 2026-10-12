import * as stylex from "@stylexjs/stylex"
import { ActionButton, Notice, SectionHeader, Surface } from "../ui-kit"
import { LIGHTING_SOFTWARE_LABELS } from "../../../shared/lighting-software"
import { styles } from "../App.styles"
import type { ServerStatus } from "../types"
import type { useConnectionSetup } from "../hooks/useConnectionSetup"

export function ConnectionPanel({
  status,
  setup,
}: {
  status: ServerStatus | null
  setup: ReturnType<typeof useConnectionSetup>
}) {
  const software = status?.lightingSoftware ?? "sunlite"
  const softwareLabel = LIGHTING_SOFTWARE_LABELS[software]
  const { setupBusy, softwareBusy, changeLightingSoftware, runSetupAction } = setup
  return (
    <section {...stylex.props(styles.heroGrid)}>
      <Surface>
        <div {...stylex.props(styles.connectionHeading)}>
          <div {...stylex.props(styles.connectionHeadingCopy)}>
            <SectionHeader
              title="Conexión automática"
              description={`La aplicación prepara los puertos MIDI para ${softwareLabel}.`}
            />
          </div>
          <div
            role="group"
            aria-label="Software de luces"
            {...stylex.props(styles.setupActions, styles.softwareSelector)}
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
        </div>
        <div {...stylex.props(styles.setupFlow)}>
          <Notice layout="stack">
            <strong>Configurar {softwareLabel}</strong>
            {software === "freestyler" ? (
              <span>
                En Setup → FreeStyler Setup → External Control → MIDI Control, elige{" "}
                {status?.expectedMidiOutputName ?? "Sunlite Mobile In"} como entrada y{" "}
                {status?.expectedMidiInputName ?? "Sunlite Mobile Out"} como salida
                opcional. Activa Start y Learn, selecciona Note IN de la función, pulsa el
                control en esta app y guarda con Save. Usa Key Up como Note On con valor
                0. Para automatización, asigna las funciones como Page independent.
              </span>
            ) : (
              <span>
                Selecciona {status?.expectedMidiOutputName ?? "Sunlite Mobile In"} como
                entrada y {status?.expectedMidiInputName ?? "Sunlite Mobile Out"} como
                retorno MIDI. Asigna los controles a las escenas de tu show.
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
                  {setupBusy === "install" ? "Preparando..." : "Preparar automáticamente"}
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
                  La configuración automática no terminó correctamente. Puedes volver a
                  intentarlo sin crear puertos manualmente.
                </span>
                {status.midiProvisioningMessage ? (
                  <span>{status.midiProvisioningMessage}</span>
                ) : null}
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
                  {setupBusy === "refresh" ? "Actualizando..." : "Comprobar puertos"}
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
          <p {...stylex.props(styles.warningText)}>{status.feedbackDisabledReason}</p>
        ) : null}
      </Surface>
    </section>
  )
}
