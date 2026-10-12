import * as stylex from "@stylexjs/stylex"
import { useState } from "react"
import type { RouterConfig, RouterState, PortRole } from "../../../shared/router-types"
import { createDraftRoute, nextRouterPortId } from "../../../shared/router-draft"
import { ActionButton, InfoTooltip, Surface } from "../ui-kit"
import { styles } from "./RouterPanel.styles"
import { PortRow } from "./PortRow"
import { RouteCard } from "./RouteCard"
export function RouterManualEditor({
  config,
  state,
  update,
  onWizard,
}: {
  config: RouterConfig
  state: RouterState
  update: (config: RouterConfig) => void
  onWizard: () => void
}) {
  const [newRouteId, setNewRouteId] = useState<string | null>(null)
  function addPort(role: PortRole) {
    update({
      ...config,
      ports: [
        ...config.ports,
        {
          id: nextRouterPortId(config.ports, role),
          role,
          kind: "hardware",
          deviceName: "",
          match: "exact",
        },
      ],
    })
  }
  return (
    <>
      <Surface
        as="article"
        variant="subtle"
        padding="custom"
        {...stylex.props(styles.card)}
      >
        <div {...stylex.props(styles.cardHeading)}>
          <div {...stylex.props(styles.labelRow)}>
            <strong>Puertos y dispositivos</strong>
            <InfoTooltip
              label="Puertos y dispositivos"
              content="Primero añade entradas y salidas. Una entrada recoge MIDI de un dispositivo o programa; una salida entrega MIDI. Elige un puerto virtual para crear una conexión entre aplicaciones."
            />
          </div>
          <span {...stylex.props(styles.cardDetail)}>
            {config.ports.length} configurados
          </span>
        </div>
        {config.ports.length === 0 ? (
          <span {...stylex.props(styles.emptyText)}>
            Añade una entrada y una salida para crear tu primera ruta.
          </span>
        ) : null}
        {config.ports.map((port) => (
          <PortRow
            key={port.id}
            port={port}
            devices={port.role === "input" ? state.devices.inputs : state.devices.outputs}
            status={state.ports.find((entry) => entry.id === port.id)}
            onChange={(next) =>
              update({
                ...config,
                ports: config.ports.map((entry) => (entry.id === port.id ? next : entry)),
              })
            }
            onRemove={() =>
              update({
                ...config,
                ports: config.ports.filter((entry) => entry.id !== port.id),
                routes: config.routes.filter(
                  (route) => route.source !== port.id && route.destination !== port.id,
                ),
              })
            }
          />
        ))}
        <div {...stylex.props(styles.cardActions)}>
          <ActionButton variant="secondary" size="small" onPress={() => addPort("input")}>
            Añadir entrada
          </ActionButton>
          <ActionButton
            variant="secondary"
            size="small"
            onPress={() => addPort("output")}
          >
            Añadir salida
          </ActionButton>
        </div>
      </Surface>
      <Surface
        as="article"
        variant="subtle"
        padding="custom"
        {...stylex.props(styles.card)}
      >
        <div {...stylex.props(styles.cardHeading)}>
          <div {...stylex.props(styles.labelRow)}>
            <strong>Rutas</strong>
            <InfoTooltip
              label="Rutas MIDI"
              content="Varias rutas desde la misma entrada reparten sus mensajes. Varias hacia la misma salida combinan sus mensajes. La validación detecta referencias incorrectas y bucles de feedback."
            />
          </div>
          <ActionButton
            variant="secondary"
            size="small"
            isDisabled={
              !config.ports.some((port) => port.role === "input") ||
              !config.ports.some((port) => port.role === "output")
            }
            onPress={() => {
              const next = createDraftRoute(config)
              if (next) {
                update({ ...config, routes: [...config.routes, next] })
                setNewRouteId(next.id)
              }
            }}
          >
            Añadir ruta
          </ActionButton>
        </div>
        {config.routes.length === 0 ? (
          <span {...stylex.props(styles.emptyText)}>
            {config.ports.some((port) => port.role === "input") &&
            config.ports.some((port) => port.role === "output")
              ? "Pulsa Añadir ruta para conectar una entrada con una salida."
              : "Necesitas una entrada y una salida antes de añadir rutas."}
          </span>
        ) : (
          config.routes.map((route) => (
            <RouteCard
              key={route.id}
              route={route}
              ports={config.ports}
              initiallyExpanded={route.id === newRouteId}
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
          <ActionButton variant="ghost" size="small" onPress={onWizard}>
            Volver al asistente
          </ActionButton>
          <ActionButton
            variant="danger"
            size="small"
            onPress={() => {
              update({ version: 1, ports: [], routes: [] })
              setNewRouteId(null)
            }}
          >
            Vaciar borrador
          </ActionButton>
        </div>
      </Surface>
    </>
  )
}
