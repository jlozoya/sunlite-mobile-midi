import * as stylex from "@stylexjs/stylex"
import { useId, useState } from "react"
import { type PortDefinition, type Route } from "../../../shared/router-types"
import { ActionButton, InfoTooltip, Surface } from "../ui-kit"
import { styles } from "./RouterPanel.styles"
import { ChannelPicker } from "./ChannelPicker"
import { ClassPicker } from "./ClassPicker"
import { describeChannels } from "./router-presentation"
import { RouterNumberField } from "./RouterNumberField"

function portLabel(ports: readonly PortDefinition[], id: string): string {
  const port = ports.find((entry) => entry.id === id)
  if (!port) return "sin asignar"
  return port.deviceName || port.id
}

function RouteCard({
  route,
  ports,
  onChange,
  onRemove,
  initiallyExpanded = false,
}: {
  route: Route
  ports: PortDefinition[]
  onChange: (route: Route) => void
  onRemove: () => void
  initiallyExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded)
  const detailsId = useId()
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
        <label {...stylex.props(styles.toggle)}>
          <input
            type="checkbox"
            aria-label={`Activar ruta ${route.name}`}
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
          aria-label={`Editar ruta ${route.name}`}
          aria-expanded={expanded}
          aria-controls={detailsId}
          onPress={() => setExpanded((current) => !current)}
        >
          {expanded ? "Cerrar" : "Editar"}
        </ActionButton>
        <ActionButton variant="danger" size="small" onPress={onRemove}>
          Borrar
        </ActionButton>
      </div>

      {expanded ? (
        <div id={detailsId} {...stylex.props(styles.routeDetail)}>
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
            <div {...stylex.props(styles.labelRow)}>
              <span {...stylex.props(styles.fieldLabel)}>Canales que deja pasar</span>
              <InfoTooltip
                label="Canales de la ruta"
                content="Solo pasan los canales seleccionados. Todos permite los 16 canales; al quitar el último canal vuelve a Todos."
              />
            </div>
            <ChannelPicker
              value={route.channels}
              onChange={(channels) => onChange({ ...route, channels })}
            />
          </div>

          <div {...stylex.props(styles.fieldBlock)}>
            <div {...stylex.props(styles.labelRow)}>
              <span {...stylex.props(styles.fieldLabel)}>Tipos de mensaje</span>
              <InfoTooltip
                label="Tipos de mensaje"
                content="Elige qué mensajes pueden pasar. Una ruta sin ningún tipo de mensaje no podrá arrancar."
              />
            </div>
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

            <RouterNumberField
              label="Transponer"
              unit="semitonos"
              help="Desplaza las notas al salir. Las notas que quedarían fuera de 0–127 se descartan."
              value={route.transforms.transpose}
              min={-48}
              max={48}
              onChange={(transpose) =>
                onChange({ ...route, transforms: { ...route.transforms, transpose } })
              }
            />
            <RouterNumberField
              label="Nota mínima"
              help="Primera nota MIDI que deja pasar esta ruta. No puede superar la nota máxima."
              value={route.filters.noteRange.min}
              min={0}
              max={route.filters.noteRange.max}
              onChange={(min) =>
                onChange({
                  ...route,
                  filters: {
                    ...route.filters,
                    noteRange: { ...route.filters.noteRange, min },
                  },
                })
              }
            />
            <RouterNumberField
              label="Nota máxima"
              help="Última nota MIDI que deja pasar esta ruta. No puede ser menor que la nota mínima."
              value={route.filters.noteRange.max}
              min={route.filters.noteRange.min}
              max={127}
              onChange={(max) =>
                onChange({
                  ...route,
                  filters: {
                    ...route.filters,
                    noteRange: { ...route.filters.noteRange, max },
                  },
                })
              }
            />
          </div>
        </div>
      ) : null}
    </Surface>
  )
}
export { RouteCard }
