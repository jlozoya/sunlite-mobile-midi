import * as stylex from "@stylexjs/stylex"
import { useEffect, useState } from "react"
import {
  buildMergeConfig,
  buildSplitConfig,
  defaultChannelAssignments,
  MAX_SLOTS,
  MIN_SLOTS,
} from "../../../shared/router-setup"
import {
  ALL_MESSAGE_CLASSES,
  MESSAGE_CLASS_LABELS,
  type ChannelSelection,
  type MessageClass,
  type PortDefinition,
  type Route,
  type RouterConfig,
  type RouterMonitorEvent,
  type RouterState,
} from "../../../shared/router-types"
import { Toast } from "../components/Toast"
import { ActionButton, Notice, StatusBadge, Surface } from "../ui-kit"
import { useRouterPanel } from "./useRouterPanel"

const VIRTUAL_OPTION = "__virtual__"

type Scenario = "merge" | "split"

function formatTime(at: number): string {
  const date = new Date(at)
  return `${date.toTimeString().slice(0, 8)}.${String(date.getMilliseconds()).padStart(3, "0")}`
}

function describeChannels(channels: ChannelSelection): string {
  if (channels === "omni") return "todos los canales"
  if (channels.length === 1) return `solo el canal ${channels[0]}`
  return `canales ${channels.join(", ")}`
}

function portLabel(ports: readonly PortDefinition[], id: string): string {
  const port = ports.find((entry) => entry.id === id)
  if (!port) return "sin asignar"
  return port.deviceName || port.id
}

/** Omni, or the individual channels a route accepts. */
function ChannelPicker({
  value,
  onChange,
}: {
  value: ChannelSelection
  onChange: (value: ChannelSelection) => void
}) {
  const isOmni = value === "omni"
  const selected = isOmni ? [] : value

  function toggle(channel: number) {
    const next = selected.includes(channel)
      ? selected.filter((entry) => entry !== channel)
      : [...selected, channel].sort((left, right) => left - right)
    onChange(next.length === 0 || next.length === 16 ? "omni" : next)
  }

  return (
    <div {...stylex.props(styles.chipRow)}>
      <button
        type="button"
        {...stylex.props(styles.chip, isOmni && styles.chipActive)}
        onClick={() => onChange("omni")}
      >
        Todos
      </button>
      {Array.from({ length: 16 }, (_, index) => index + 1).map((channel) => (
        <button
          key={channel}
          type="button"
          {...stylex.props(
            styles.chip,
            !isOmni && selected.includes(channel) && styles.chipActive,
          )}
          onClick={() => toggle(channel)}
        >
          {channel}
        </button>
      ))}
    </div>
  )
}

function ClassPicker({
  value,
  onChange,
}: {
  value: MessageClass[]
  onChange: (value: MessageClass[]) => void
}) {
  return (
    <div {...stylex.props(styles.chipRow)}>
      {ALL_MESSAGE_CLASSES.map((entry) => {
        const isActive = value.includes(entry)
        return (
          <button
            key={entry}
            type="button"
            {...stylex.props(styles.chip, isActive && styles.chipActive)}
            onClick={() =>
              onChange(
                isActive ? value.filter((item) => item !== entry) : [...value, entry],
              )
            }
          >
            {MESSAGE_CLASS_LABELS[entry]}
          </button>
        )
      })}
    </div>
  )
}

/** The two things a router is actually for, offered before any model detail. */
function StartChooser({ onPick }: { onPick: (scenario: Scenario | "manual") => void }) {
  return (
    <div {...stylex.props(styles.chooser)}>
      <button
        type="button"
        {...stylex.props(styles.scenarioCard)}
        onClick={() => onPick("merge")}
      >
        <span {...stylex.props(styles.scenarioTitle)}>
          Varios programas → un dispositivo
        </span>
        <span {...stylex.props(styles.scenarioBody)}>
          Sunlite, Ableton y lo que quieras escriben a la vez en la misma mesa o
          controlador. Windows normalmente solo deja que un programa abra el dispositivo;
          el router lo abre él y reparte.
        </span>
        <span {...stylex.props(styles.scenarioDiagram)}>
          Programa A ┐{"\n"}Programa B ┼→ dispositivo{"\n"}Programa C ┘
        </span>
      </button>

      <button
        type="button"
        {...stylex.props(styles.scenarioCard)}
        onClick={() => onPick("split")}
      >
        <span {...stylex.props(styles.scenarioTitle)}>
          Un dispositivo → varios programas
        </span>
        <span {...stylex.props(styles.scenarioBody)}>
          Reparte tu controlador por canal MIDI: el canal 1 va a un programa, el 2 a otro.
          Cada programa recibe solo lo suyo.
        </span>
        <span {...stylex.props(styles.scenarioDiagram)}>
          {"          ┌ CH 1 → Programa A\n"}
          {"controlador ┼ CH 2 → Programa B\n"}
          {"          └ CH 3 → Programa C"}
        </span>
      </button>

      <button
        type="button"
        {...stylex.props(styles.manualLink)}
        onClick={() => onPick("manual")}
      >
        O configurar puertos y rutas a mano
      </button>
    </div>
  )
}

function Wizard({
  scenario,
  devices,
  onCancel,
  onApply,
}: {
  scenario: Scenario
  devices: string[]
  onCancel: () => void
  onApply: (config: RouterConfig) => void
}) {
  const [device, setDevice] = useState("")
  const [slots, setSlots] = useState(3)
  const [channels, setChannels] = useState<number[][]>(defaultChannelAssignments(3))

  useEffect(() => {
    setChannels((current) =>
      Array.from({ length: slots }, (_, index) => current[index] ?? [index + 1]),
    )
  }, [slots])

  const isMerge = scenario === "merge"

  return (
    <Surface
      as="article"
      variant="inset"
      padding="custom"
      {...stylex.props(styles.wizard)}
    >
      <div {...stylex.props(styles.cardHeading)}>
        <strong>
          {isMerge
            ? "Varios programas hacia un dispositivo"
            : "Un dispositivo repartido entre programas"}
        </strong>
        <span {...stylex.props(styles.cardDetail)}>
          Dos preguntas y te dejo las rutas montadas. Podrás retocarlas después.
        </span>
      </div>

      <label {...stylex.props(styles.field)}>
        <span {...stylex.props(styles.fieldLabel)}>
          {isMerge
            ? "1. ¿En qué dispositivo quieres que escriban?"
            : "1. ¿Qué dispositivo quieres repartir?"}
        </span>
        <select
          {...stylex.props(styles.select)}
          value={device}
          onChange={(event) => setDevice(event.target.value)}
        >
          <option value="">Selecciona un dispositivo…</option>
          {devices.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
        {devices.length === 0 ? (
          <span {...stylex.props(styles.fieldHelp)}>
            No se detecta ningún dispositivo. Conéctalo y vuelve a abrir esta pestaña.
          </span>
        ) : null}
      </label>

      <label {...stylex.props(styles.field)}>
        <span {...stylex.props(styles.fieldLabel)}>
          {isMerge ? "2. ¿Cuántos programas?" : "2. ¿Cuántos destinos?"}
        </span>
        <input
          type="number"
          min={MIN_SLOTS}
          max={MAX_SLOTS}
          {...stylex.props(styles.input, styles.narrow)}
          value={slots}
          onChange={(event) => setSlots(Number(event.target.value))}
        />
        <span {...stylex.props(styles.fieldHelp)}>
          Se crearán {slots} puertos virtuales. Cada programa elige el suyo en su propia
          configuración MIDI.
        </span>
      </label>

      {!isMerge ? (
        <div {...stylex.props(styles.field)}>
          <span {...stylex.props(styles.fieldLabel)}>
            3. ¿Qué canal va a cada destino?
          </span>
          {channels.map((assignment, index) => (
            <div key={index} {...stylex.props(styles.assignmentRow)}>
              <span {...stylex.props(styles.assignmentName)}>Salida {index + 1}</span>
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
          ))}
        </div>
      ) : null}

      <div {...stylex.props(styles.wizardActions)}>
        <ActionButton variant="ghost" size="small" onPress={onCancel}>
          Cancelar
        </ActionButton>
        <ActionButton
          tone="cyan"
          isDisabled={!device}
          onPress={() =>
            onApply(
              isMerge
                ? buildMergeConfig(device, slots)
                : buildSplitConfig(device, channels),
            )
          }
        >
          Crear las rutas
        </ActionButton>
      </div>
    </Surface>
  )
}

function RouteCard({
  route,
  ports,
  onChange,
  onRemove,
}: {
  route: Route
  ports: PortDefinition[]
  onChange: (route: Route) => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const inputs = ports.filter((port) => port.role === "input")
  const outputs = ports.filter((port) => port.role === "output")

  return (
    <Surface
      as="article"
      variant="inset"
      padding="custom"
      {...stylex.props(styles.routeCard, !route.enabled && styles.routeDisabled)}
    >
      <div {...stylex.props(styles.routeSummary)}>
        <label {...stylex.props(styles.toggle)} title="Activar o desactivar esta ruta">
          <input
            type="checkbox"
            checked={route.enabled}
            onChange={(event) => onChange({ ...route, enabled: event.target.checked })}
          />
        </label>

        <span {...stylex.props(styles.routeSentence)}>
          <strong>{portLabel(ports, route.source)}</strong>
          <span {...stylex.props(styles.arrow)}>→</span>
          <strong>{portLabel(ports, route.destination)}</strong>
          <span {...stylex.props(styles.routeMeta)}>
            · {describeChannels(route.channels)}
          </span>
        </span>

        <ActionButton
          variant="ghost"
          size="small"
          onPress={() => setExpanded((current) => !current)}
        >
          {expanded ? "Cerrar" : "Editar"}
        </ActionButton>
        <ActionButton variant="danger" size="small" onPress={onRemove}>
          Borrar
        </ActionButton>
      </div>

      {expanded ? (
        <div {...stylex.props(styles.routeDetail)}>
          <div {...stylex.props(styles.routeFlow)}>
            <label {...stylex.props(styles.field)}>
              <span {...stylex.props(styles.fieldLabel)}>Desde</span>
              <select
                {...stylex.props(styles.select)}
                value={route.source}
                onChange={(event) => onChange({ ...route, source: event.target.value })}
              >
                <option value="">Sin asignar</option>
                {inputs.map((port) => (
                  <option key={port.id} value={port.id}>
                    {port.deviceName || port.id}
                  </option>
                ))}
              </select>
            </label>
            <label {...stylex.props(styles.field)}>
              <span {...stylex.props(styles.fieldLabel)}>Hacia</span>
              <select
                {...stylex.props(styles.select)}
                value={route.destination}
                onChange={(event) =>
                  onChange({ ...route, destination: event.target.value })
                }
              >
                <option value="">Sin asignar</option>
                {outputs.map((port) => (
                  <option key={port.id} value={port.id}>
                    {port.deviceName || port.id}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div {...stylex.props(styles.fieldBlock)}>
            <span {...stylex.props(styles.fieldLabel)}>Canales que deja pasar</span>
            <ChannelPicker
              value={route.channels}
              onChange={(channels) => onChange({ ...route, channels })}
            />
          </div>

          <div {...stylex.props(styles.fieldBlock)}>
            <span {...stylex.props(styles.fieldLabel)}>Tipos de mensaje</span>
            <ClassPicker
              value={route.filters.allow}
              onChange={(allow) =>
                onChange({ ...route, filters: { ...route.filters, allow } })
              }
            />
          </div>

          <div {...stylex.props(styles.advancedGrid)}>
            <label {...stylex.props(styles.field)}>
              <span {...stylex.props(styles.fieldLabel)}>Cambiar canal de salida</span>
              <select
                {...stylex.props(styles.select)}
                value={route.transforms.channelRemap ?? ""}
                onChange={(event) =>
                  onChange({
                    ...route,
                    transforms: {
                      ...route.transforms,
                      channelRemap: event.target.value
                        ? Number(event.target.value)
                        : null,
                    },
                  })
                }
              >
                <option value="">Mantener el original</option>
                {Array.from({ length: 16 }, (_, index) => index + 1).map((channel) => (
                  <option key={channel} value={channel}>
                    Canal {channel}
                  </option>
                ))}
              </select>
            </label>

            <label {...stylex.props(styles.field)}>
              <span {...stylex.props(styles.fieldLabel)}>Transponer (semitonos)</span>
              <input
                type="number"
                min={-48}
                max={48}
                {...stylex.props(styles.input)}
                value={route.transforms.transpose}
                onChange={(event) =>
                  onChange({
                    ...route,
                    transforms: {
                      ...route.transforms,
                      transpose: Number(event.target.value),
                    },
                  })
                }
              />
            </label>

            <label {...stylex.props(styles.field)}>
              <span {...stylex.props(styles.fieldLabel)}>Notas: desde</span>
              <input
                type="number"
                min={0}
                max={127}
                {...stylex.props(styles.input)}
                value={route.filters.noteRange.min}
                onChange={(event) =>
                  onChange({
                    ...route,
                    filters: {
                      ...route.filters,
                      noteRange: {
                        ...route.filters.noteRange,
                        min: Number(event.target.value),
                      },
                    },
                  })
                }
              />
            </label>

            <label {...stylex.props(styles.field)}>
              <span {...stylex.props(styles.fieldLabel)}>Notas: hasta</span>
              <input
                type="number"
                min={0}
                max={127}
                {...stylex.props(styles.input)}
                value={route.filters.noteRange.max}
                onChange={(event) =>
                  onChange({
                    ...route,
                    filters: {
                      ...route.filters,
                      noteRange: {
                        ...route.filters.noteRange,
                        max: Number(event.target.value),
                      },
                    },
                  })
                }
              />
            </label>
          </div>
        </div>
      ) : null}
    </Surface>
  )
}

function PortRow({
  port,
  devices,
  status,
  onChange,
  onRemove,
}: {
  port: PortDefinition
  devices: string[]
  status: RouterState["ports"][number] | undefined
  onChange: (port: PortDefinition) => void
  onRemove: () => void
}) {
  const isVirtual = port.kind === "virtual"
  const state = status?.connected ? "Abierto" : (status?.error ?? "Sin abrir")

  return (
    <div {...stylex.props(styles.portRow)}>
      <span {...stylex.props(styles.portRole)}>
        {port.role === "input" ? "ENTRADA" : "SALIDA"}
      </span>

      <select
        {...stylex.props(styles.select)}
        value={isVirtual ? VIRTUAL_OPTION : port.deviceName}
        onChange={(event) => {
          const value = event.target.value
          if (value === VIRTUAL_OPTION) {
            onChange({ ...port, kind: "virtual", deviceName: port.deviceName || "" })
          } else {
            onChange({ ...port, kind: "hardware", deviceName: value })
          }
        }}
      >
        <option value="">Selecciona un dispositivo…</option>
        {devices.map((device) => (
          <option key={device} value={device}>
            {device}
          </option>
        ))}
        <option value={VIRTUAL_OPTION}>Crear puerto virtual…</option>
      </select>

      {isVirtual ? (
        <input
          {...stylex.props(styles.input)}
          value={port.deviceName}
          placeholder="Nombre del puerto virtual"
          onChange={(event) => onChange({ ...port, deviceName: event.target.value })}
        />
      ) : (
        <span {...stylex.props(styles.portState)}>{state}</span>
      )}

      <ActionButton variant="danger" size="small" onPress={onRemove}>
        Quitar
      </ActionButton>
    </div>
  )
}

function MonitorList({ events }: { events: RouterMonitorEvent[] }) {
  if (events.length === 0) {
    return (
      <span {...stylex.props(styles.emptyText)}>
        Sin actividad todavía. Arranca el router y toca algo en el dispositivo.
      </span>
    )
  }

  return (
    <div {...stylex.props(styles.monitor)}>
      {events
        .slice()
        .reverse()
        .map((event, index) => (
          <div key={`${event.at}-${index}`} {...stylex.props(styles.monitorRow)}>
            <span {...stylex.props(styles.monitorTime)}>{formatTime(event.at)}</span>
            <span
              {...stylex.props(
                styles.monitorDirection,
                event.direction === "out" && styles.monitorOut,
              )}
            >
              {event.direction === "in" ? "IN" : "OUT"}
            </span>
            <span {...stylex.props(styles.monitorPort)}>{event.portId}</span>
            <span {...stylex.props(styles.monitorChannel)}>
              {event.channel === null ? "—" : `CH ${event.channel}`}
            </span>
            <span {...stylex.props(styles.monitorText)}>{event.text}</span>
          </div>
        ))}
    </div>
  )
}

export function RouterPanel() {
  const router = useRouterPanel()
  const [draft, setDraft] = useState<RouterConfig | null>(null)
  const [dirty, setDirty] = useState(false)
  const [wizard, setWizard] = useState<Scenario | null>(null)
  const [manual, setManual] = useState(false)
  const [showPorts, setShowPorts] = useState(false)

  useEffect(() => {
    if (router.state && !dirty) setDraft(router.state.config)
  }, [router.state, dirty])

  const config = draft ?? router.state?.config ?? null
  const state = router.state

  function update(next: RouterConfig) {
    setDraft(next)
    setDirty(true)
  }

  if (!config || !state) {
    return (
      <section {...stylex.props(styles.panel)}>
        <span {...stylex.props(styles.emptyText)}>Cargando el router…</span>
      </section>
    )
  }

  const isEmpty = config.ports.length === 0 && config.routes.length === 0
  const virtualPorts = config.ports.filter((port) => port.kind === "virtual")

  return (
    <section {...stylex.props(styles.panel)}>
      <div {...stylex.props(styles.headingRow)}>
        <div>
          <span {...stylex.props(styles.eyebrow)}>MIDI ROUTER</span>
          <h2 {...stylex.props(styles.title)}>División y unión de canales MIDI</h2>
        </div>
        <div {...stylex.props(styles.headingActions)}>
          <StatusBadge tone={state.running ? "success" : "neutral"}>
            {state.running ? "En marcha" : "Detenido"}
          </StatusBadge>
          {!isEmpty ? (
            <ActionButton
              tone="cyan"
              isDisabled={
                router.busy !== null || (!state.running && state.errors.length > 0)
              }
              onPress={() => void (state.running ? router.stop() : router.start())}
            >
              {state.running ? "Detener" : "Arrancar router"}
            </ActionButton>
          ) : null}
        </div>
      </div>

      {state.errors.length > 0 ? (
        <Notice tone="warning" layout="stack">
          <strong>Revisa esto antes de arrancar</strong>
          <ul {...stylex.props(styles.noticeList)}>
            {state.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {state.warnings.map((warning) => (
        <Notice key={warning} tone="warning" layout="stack">
          <strong>Conflicto con el controlador</strong>
          {warning}
        </Notice>
      ))}

      {state.provisioning && !state.provisioning.ok ? (
        <Notice tone="danger" layout="stack">
          <strong>Puertos virtuales</strong>
          {state.provisioning.message}
        </Notice>
      ) : null}

      {isEmpty && !wizard && !manual ? (
        <StartChooser
          onPick={(choice) => {
            if (choice === "manual") setManual(true)
            else setWizard(choice)
          }}
        />
      ) : null}

      {wizard ? (
        <Wizard
          scenario={wizard}
          devices={wizard === "merge" ? state.devices.outputs : state.devices.inputs}
          onCancel={() => setWizard(null)}
          onApply={(next) => {
            update(next)
            setWizard(null)
          }}
        />
      ) : null}

      {!isEmpty || manual ? (
        <>
          {virtualPorts.length > 0 ? (
            <Notice tone="info" layout="stack">
              <strong>Qué elegir en los otros programas</strong>
              <span>
                Estos puertos aparecen en la lista MIDI de cualquier aplicación:{" "}
                {virtualPorts.map((port) => port.deviceName).join(" · ")}
              </span>
            </Notice>
          ) : null}

          <Surface
            as="article"
            variant="subtle"
            padding="custom"
            {...stylex.props(styles.card)}
          >
            <div {...stylex.props(styles.cardHeading)}>
              <strong>Rutas</strong>
              <span {...stylex.props(styles.cardDetail)}>
                Varias rutas desde la misma entrada la reparten; varias hacia la misma
                salida la unen.
              </span>
            </div>

            {config.routes.length === 0 ? (
              <span {...stylex.props(styles.emptyText)}>Todavía no hay rutas.</span>
            ) : (
              config.routes.map((route) => (
                <RouteCard
                  key={route.id}
                  route={route}
                  ports={config.ports}
                  onChange={(next) =>
                    update({
                      ...config,
                      routes: config.routes.map((entry) =>
                        entry.id === route.id ? next : entry,
                      ),
                    })
                  }
                  onRemove={() =>
                    update({
                      ...config,
                      routes: config.routes.filter((entry) => entry.id !== route.id),
                    })
                  }
                />
              ))
            )}

            <div {...stylex.props(styles.cardActions)}>
              <ActionButton
                variant="secondary"
                size="small"
                onPress={() => setWizard("merge")}
              >
                Añadir: varios programas → un dispositivo
              </ActionButton>
              <ActionButton
                variant="secondary"
                size="small"
                onPress={() => setWizard("split")}
              >
                Añadir: un dispositivo → varios programas
              </ActionButton>
              <ActionButton
                variant="ghost"
                size="small"
                onPress={() => {
                  update({ version: 1, ports: [], routes: [] })
                  setManual(false)
                }}
              >
                Empezar de cero
              </ActionButton>
            </div>
          </Surface>

          <Surface
            as="article"
            variant="subtle"
            padding="custom"
            {...stylex.props(styles.card)}
          >
            <button
              type="button"
              {...stylex.props(styles.disclosure)}
              onClick={() => setShowPorts((current) => !current)}
            >
              <strong>Puertos y dispositivos</strong>
              <span {...stylex.props(styles.cardDetail)}>
                {showPorts ? "Ocultar" : "Mostrar"} · {config.ports.length} configurados
              </span>
            </button>

            {showPorts ? (
              <>
                {config.ports.map((port) => (
                  <PortRow
                    key={port.id}
                    port={port}
                    devices={
                      port.role === "input" ? state.devices.inputs : state.devices.outputs
                    }
                    status={state.ports.find((entry) => entry.id === port.id)}
                    onChange={(next) =>
                      update({
                        ...config,
                        ports: config.ports.map((entry) =>
                          entry.id === port.id ? next : entry,
                        ),
                      })
                    }
                    onRemove={() =>
                      update({
                        ...config,
                        ports: config.ports.filter((entry) => entry.id !== port.id),
                        routes: config.routes.filter(
                          (route) =>
                            route.source !== port.id && route.destination !== port.id,
                        ),
                      })
                    }
                  />
                ))}
                <div {...stylex.props(styles.cardActions)}>
                  <ActionButton
                    variant="secondary"
                    size="small"
                    onPress={() =>
                      update({
                        ...config,
                        ports: [
                          ...config.ports,
                          {
                            id: `in-${config.ports.length + 1}`,
                            role: "input",
                            kind: "hardware",
                            deviceName: "",
                            match: "contains",
                          },
                        ],
                      })
                    }
                  >
                    Añadir entrada
                  </ActionButton>
                  <ActionButton
                    variant="secondary"
                    size="small"
                    onPress={() =>
                      update({
                        ...config,
                        ports: [
                          ...config.ports,
                          {
                            id: `out-${config.ports.length + 1}`,
                            role: "output",
                            kind: "hardware",
                            deviceName: "",
                            match: "contains",
                          },
                        ],
                      })
                    }
                  >
                    Añadir salida
                  </ActionButton>
                </div>
              </>
            ) : null}
          </Surface>

          <div {...stylex.props(styles.footer)}>
            <span {...stylex.props(styles.dirtyHint)}>
              {dirty
                ? "Tienes cambios sin guardar; se aplican al pulsar Guardar."
                : "Sin cambios pendientes."}
            </span>
            <ActionButton
              tone="cyan"
              isDisabled={!dirty || router.busy === "save"}
              onPress={() => {
                void router.saveConfig(config).then(() => setDirty(false))
              }}
            >
              Guardar configuración
            </ActionButton>
          </div>

          <Surface
            as="article"
            variant="subtle"
            padding="custom"
            {...stylex.props(styles.card)}
          >
            <div {...stylex.props(styles.cardHeading)}>
              <strong>Monitor MIDI</strong>
              <span {...stylex.props(styles.cardDetail)}>
                recibidos {state.stats.received} · enviados {state.stats.sent} · filtrados{" "}
                {state.stats.dropped} · sin entregar {state.stats.undelivered}
              </span>
            </div>
            <MonitorList events={router.monitor} />
            {router.monitor.length > 0 ? (
              <div {...stylex.props(styles.cardActions)}>
                <ActionButton variant="ghost" size="small" onPress={router.clearMonitor}>
                  Limpiar
                </ActionButton>
              </div>
            ) : null}
          </Surface>
        </>
      ) : null}

      {router.message ? (
        <Toast message={router.message} onDismiss={router.clearMessage} />
      ) : null}
    </section>
  )
}

const styles = stylex.create({
  panel: {
    marginTop: "16px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(34, 211, 238, 0.2)",
    borderRadius: "24px",
    backgroundColor: "rgba(11, 17, 31, 0.94)",
    boxShadow: "0 22px 70px rgba(0, 0, 0, 0.34)",
    padding: "18px",
    display: "grid",
    gap: "12px",
  },
  headingRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "12px",
  },
  headingActions: { display: "flex", alignItems: "center", gap: "9px" },
  eyebrow: {
    color: "#22d3ee",
    fontSize: "0.66rem",
    fontWeight: 800,
    letterSpacing: "0.12em",
  },
  title: { margin: "4px 0 0", color: "#f8fafc", fontSize: "1.15rem" },
  chooser: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "11px",
  },
  scenarioCard: {
    display: "grid",
    gap: "7px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: {
      default: "rgba(34, 211, 238, 0.28)",
      ":hover": "rgba(34, 211, 238, 0.6)",
    },
    borderRadius: "16px",
    backgroundColor: {
      default: "rgba(15, 23, 42, 0.7)",
      ":hover": "rgba(34, 211, 238, 0.08)",
    },
    cursor: "pointer",
    padding: "14px",
    textAlign: "left",
    transition: "border-color 150ms ease, background-color 150ms ease",
  },
  scenarioTitle: { color: "#f8fafc", fontSize: "0.86rem", fontWeight: 700 },
  scenarioBody: { color: "#94a3b8", fontSize: "0.74rem", lineHeight: 1.45 },
  scenarioDiagram: {
    marginTop: "3px",
    color: "#64748b",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "0.66rem",
    lineHeight: 1.5,
    whiteSpace: "pre",
  },
  manualLink: {
    borderStyle: "none",
    backgroundColor: "transparent",
    color: "#64748b",
    cursor: "pointer",
    fontSize: "0.72rem",
    gridColumn: "1 / -1",
    padding: "4px",
    textAlign: "center",
    textDecoration: "underline",
  },
  wizard: { padding: "14px", display: "grid", gap: "11px" },
  wizardActions: { display: "flex", justifyContent: "flex-end", gap: "8px" },
  assignmentRow: {
    display: "grid",
    gridTemplateColumns: "90px 1fr",
    alignItems: "center",
    gap: "8px",
  },
  assignmentName: { color: "#cbd5e1", fontSize: "0.72rem" },
  card: { padding: "13px", display: "grid", gap: "9px" },
  cardHeading: { display: "grid", gap: "2px" },
  cardDetail: { color: "#7c8ba1", fontSize: "0.72rem", lineHeight: 1.4 },
  cardActions: { display: "flex", gap: "8px", flexWrap: "wrap" },
  disclosure: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "8px",
    borderStyle: "none",
    backgroundColor: "transparent",
    color: "#f8fafc",
    cursor: "pointer",
    padding: 0,
    textAlign: "left",
    width: "100%",
  },
  emptyText: { color: "#64748b", fontSize: "0.74rem" },
  noticeList: { margin: "4px 0 0", paddingLeft: "18px" },
  portRow: {
    display: "grid",
    gridTemplateColumns: "auto minmax(160px, 1fr) minmax(140px, 1fr) auto",
    alignItems: "center",
    gap: "9px",
  },
  portRole: {
    color: "#22d3ee",
    fontSize: "0.62rem",
    fontWeight: 800,
    letterSpacing: "0.08em",
  },
  portState: { color: "#94a3b8", fontSize: "0.72rem" },
  routeCard: { padding: "10px 12px", display: "grid", gap: "9px" },
  routeDisabled: { opacity: 0.55 },
  routeSummary: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "8px",
  },
  routeSentence: {
    display: "flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: "6px",
    flexGrow: 1,
    color: "#e2e8f0",
    fontSize: "0.78rem",
  },
  routeMeta: { color: "#7c8ba1", fontSize: "0.72rem" },
  routeDetail: {
    display: "grid",
    gap: "10px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "rgba(255, 255, 255, 0.07)",
    paddingTop: "10px",
  },
  toggle: { display: "flex", alignItems: "center" },
  routeFlow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "9px",
  },
  arrow: { color: "#22d3ee" },
  fieldBlock: { display: "grid", gap: "5px" },
  field: { display: "grid", gap: "4px", alignContent: "start" },
  fieldLabel: { color: "#cbd5e1", fontSize: "0.72rem", fontWeight: 600 },
  fieldHelp: { color: "#8496ad", fontSize: "0.68rem", lineHeight: 1.35 },
  advancedGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "10px",
  },
  chipRow: { display: "flex", flexWrap: "wrap", gap: "4px" },
  chip: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: "999px",
    backgroundColor: "#0f172a",
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: "0.68rem",
    padding: "3px 9px",
  },
  chipActive: {
    borderColor: "rgba(34, 211, 238, 0.5)",
    backgroundColor: "rgba(34, 211, 238, 0.16)",
    color: "#e0f2fe",
  },
  input: {
    minWidth: 0,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: "10px",
    backgroundColor: "#0f172a",
    color: "#e2e8f0",
    padding: "8px 10px",
    fontSize: "0.76rem",
  },
  narrow: { maxWidth: "110px" },
  select: {
    width: "100%",
    minWidth: 0,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: "10px",
    backgroundColor: "#0f172a",
    color: "#e2e8f0",
    padding: "8px 10px",
    fontSize: "0.76rem",
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "9px",
  },
  dirtyHint: { color: "#94a3b8", fontSize: "0.72rem" },
  monitor: {
    display: "grid",
    gap: "2px",
    maxHeight: "260px",
    overflowY: "auto",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "0.68rem",
  },
  monitorRow: {
    display: "grid",
    gridTemplateColumns: "auto 34px minmax(80px, 1fr) 56px minmax(120px, 2fr)",
    gap: "7px",
    color: "#94a3b8",
  },
  monitorTime: { color: "#5c6b82" },
  monitorDirection: { color: "#22d3ee", fontWeight: 700 },
  monitorOut: { color: "#a78bfa" },
  monitorPort: { color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis" },
  monitorChannel: { color: "#7c8ba1" },
  monitorText: { color: "#e2e8f0" },
})
