import * as stylex from "@stylexjs/stylex"
import { useState } from "react"
import {
  buildRouterSetup,
  isProgramPort,
  matchingDeviceOutput,
  MAX_SLOTS,
  MIN_SLOTS,
  sharedAssignments,
} from "../../../shared/router-setup"
import { readRouterSetup } from "../../../shared/router-draft"
import type { RouterConfig, RouterState } from "../../../shared/router-types"
import { ActionButton, InfoTooltip, Notice } from "../ui-kit"
import { AnimatedDisclosure } from "../components/AnimatedDisclosure"
import { styles } from "./RouterPanel.styles"
import { ChannelPicker } from "./ChannelPicker"
import { ProgramConnectionGuide } from "./ProgramConnectionGuide"

export function RouterWizard({
  devices,
  busy,
  refreshing,
  progressLabel,
  initialConfig,
  onRefresh,
  onCancel,
  onApply,
}: {
  devices: RouterState["devices"]
  busy: boolean
  refreshing: boolean
  progressLabel: string
  initialConfig?: RouterConfig
  onRefresh: () => void
  onCancel?: () => void
  onApply: (config: RouterConfig) => void
}) {
  const inputs = devices.inputs.filter((name) => !isProgramPort(name))
  const outputs = devices.outputs.filter((name) => !isProgramPort(name))
  const defaults = readRouterSetup(initialConfig)
  const [listenTo, setListenTo] = useState(defaults.listenTo)
  const [writeTo, setWriteTo] = useState(defaults.writeTo)
  const [slots, setSlots] = useState(defaults.slots)
  const [perChannel, setPerChannel] = useState(defaults.perChannel)
  const [channels, setChannels] = useState(defaults.channels)
  const ready = inputs.includes(listenTo) && outputs.includes(writeTo)
  const needsReturn = Boolean(listenTo) && !outputs.includes(writeTo)
  const assignments = perChannel ? channels.slice(0, slots) : sharedAssignments(slots)
  const replacing = Boolean(initialConfig?.ports.length)
  return (
    <div {...stylex.props(styles.wizard)}>
      <fieldset disabled={busy} {...stylex.props(styles.wizardFields)}>
        <div {...stylex.props(styles.wizardBasics)}>
          <div {...stylex.props(styles.field)}>
            <div {...stylex.props(styles.labelRow)}>
              <label htmlFor="router-device" {...stylex.props(styles.fieldLabel)}>
                1. Dispositivo MIDI
              </label>
              <InfoTooltip
                label="Dispositivo MIDI"
                content="Comparte un controlador con varios programas. Se emparejan automáticamente su entrada y su salida cuando Windows las identifica con el mismo nombre."
              />
            </div>
            <div {...stylex.props(styles.deviceSelectRow)}>
              <select
                id="router-device"
                {...stylex.props(styles.select)}
                value={listenTo}
                onChange={(event) => {
                  const next = event.target.value
                  setListenTo(next)
                  setWriteTo(matchingDeviceOutput(next, outputs))
                }}
              >
                <option value="">Selecciona un dispositivo</option>
                {listenTo && !inputs.includes(listenTo) ? (
                  <option value={listenTo}>{listenTo} (desconectado)</option>
                ) : null}
                {inputs.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <ActionButton
                variant="secondary"
                size="small"
                onPress={onRefresh}
                isDisabled={busy || refreshing}
              >
                {refreshing ? "Actualizando…" : "Actualizar"}
              </ActionButton>
            </div>
          </div>
          <div {...stylex.props(styles.field)}>
            <div {...stylex.props(styles.labelRow)}>
              <label htmlFor="router-programs" {...stylex.props(styles.fieldLabel)}>
                2. Programas
              </label>
              <InfoTooltip
                label="Número de programas"
                content="Cada programa necesita su propio par de puertos virtuales: uno para recibir MIDI y otro para enviar respuestas."
                detail="De 2 a 8 programas. Todos reciben todos los canales por defecto."
              />
            </div>
            <select
              id="router-programs"
              value={slots}
              {...stylex.props(styles.select)}
              onChange={(event) => setSlots(Number(event.target.value))}
            >
              {Array.from(
                { length: MAX_SLOTS - MIN_SLOTS + 1 },
                (_, i) => i + MIN_SLOTS,
              ).map((count) => (
                <option key={count} value={count}>
                  {count} programas
                </option>
              ))}
            </select>
          </div>
        </div>
        {inputs.length === 0 ? (
          <Notice tone="warning" role="status">
            No hay dispositivos MIDI. Conecta el controlador y pulsa Actualizar.
          </Notice>
        ) : null}
        {needsReturn ? (
          <Notice tone="warning" layout="stack" role="status">
            <strong>
              {!inputs.includes(listenTo)
                ? "El dispositivo está desconectado"
                : "Selecciona la salida del dispositivo"}
            </strong>
            <span>
              No se pudo emparejar la entrada y la salida. Elige la salida para habilitar
              Compartir y arrancar.
            </span>
          </Notice>
        ) : null}
        {needsReturn ? (
          <OutputField value={writeTo} outputs={outputs} onChange={setWriteTo} />
        ) : null}
        <AnimatedDisclosure
          summary="Opciones avanzadas"
          buttonProps={stylex.props(styles.disclosure, styles.advancedSummary)}
        >
          <div {...stylex.props(styles.advancedFields)}>
            {!needsReturn ? (
              <OutputField value={writeTo} outputs={outputs} onChange={setWriteTo} />
            ) : null}
            <div {...stylex.props(styles.labelRow)}>
              <label {...stylex.props(styles.checkboxLabel)}>
                <input
                  type="checkbox"
                  checked={perChannel}
                  onChange={(event) => setPerChannel(event.target.checked)}
                />
                Repartir por canales
              </label>
              <InfoTooltip
                label="Repartir por canales"
                content="El filtro solo afecta lo que recibe cada programa. Sus respuestas llegan al dispositivo sin filtrar. Todos significa que recibe los 16 canales."
              />
            </div>
            {perChannel
              ? channels.slice(0, slots).map((assignment, index) => (
                  <div key={index} {...stylex.props(styles.assignmentRow)}>
                    <span {...stylex.props(styles.assignmentName)}>
                      Programa {index + 1}
                    </span>
                    <ChannelPicker
                      value={assignment.length === 0 ? "omni" : assignment}
                      onChange={(next) =>
                        setChannels((current) =>
                          current.map((entry, position) =>
                            position === index ? (next === "omni" ? [] : next) : entry,
                          ),
                        )
                      }
                    />
                  </div>
                ))
              : null}
          </div>
        </AnimatedDisclosure>
        <div {...stylex.props(styles.guideHeading)}>
          <strong>3. Revisa los puertos</strong>
          <InfoTooltip
            label="Puertos de los programas"
            content={`Se prepararán ${slots * 2} puertos virtuales. Después de arrancar, abre la configuración MIDI de cada programa y selecciona su par de la tabla.`}
            detail="Desactiva MIDI Thru en los programas si reenvían automáticamente lo que reciben."
          />
        </div>
        <ProgramConnectionGuide slots={slots} />
        <div {...stylex.props(styles.wizardActions)}>
          <span {...stylex.props(styles.fieldHelp)}>
            {ready
              ? `${slots} programas · ${slots * 2} puertos virtuales`
              : "Selecciona la entrada y la salida para continuar."}
          </span>
          <div {...stylex.props(styles.cardActions)}>
            {onCancel ? (
              <ActionButton
                variant="ghost"
                size="small"
                onPress={onCancel}
                isDisabled={busy}
              >
                Cancelar
              </ActionButton>
            ) : null}
            {replacing ? (
              <InfoTooltip
                label="Rehacer configuración"
                content="El asistente reemplazará las rutas actuales al aplicar. Si el router está en marcha, se detendrá brevemente para preparar los puertos."
              />
            ) : null}
            <ActionButton
              tone="cyan"
              isDisabled={!ready || busy || refreshing}
              onPress={() =>
                onApply(
                  buildRouterSetup({
                    writeTo,
                    listenTo,
                    channelsPerProgram: assignments,
                  }),
                )
              }
            >
              {busy
                ? progressLabel
                : replacing
                  ? "Aplicar y arrancar"
                  : "Compartir y arrancar"}
            </ActionButton>
          </div>
        </div>
      </fieldset>
    </div>
  )
}

function OutputField({
  value,
  outputs,
  onChange,
}: {
  value: string
  outputs: string[]
  onChange: (value: string) => void
}) {
  return (
    <div {...stylex.props(styles.field)}>
      <div {...stylex.props(styles.labelRow)}>
        <label htmlFor="router-device-output" {...stylex.props(styles.fieldLabel)}>
          Salida hacia el dispositivo
        </label>
        <InfoTooltip
          label="Salida hacia el dispositivo"
          content="Elige la salida del mismo controlador. Aquí llegan las respuestas de los programas. Windows puede darle un nombre distinto al de la entrada."
        />
      </div>
      <select
        id="router-device-output"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...stylex.props(styles.select)}
      >
        <option value="">Selecciona la salida</option>
        {value && !outputs.includes(value) ? (
          <option value={value}>{value} (desconectada)</option>
        ) : null}
        {outputs.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  )
}
