import * as stylex from "@stylexjs/stylex"
import { type PortDefinition, type RouterState } from "../../../shared/router-types"
import { ActionButton } from "../ui-kit"
import { styles } from "./RouterPanel.styles"

const VIRTUAL_OPTION = "__virtual__"

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
        {...stylex.props(styles.select, styles.portDevice)}
        aria-label={`Dispositivo de ${port.role === "input" ? "entrada" : "salida"} ${port.id}`}
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
        {!isVirtual && port.deviceName && !devices.includes(port.deviceName) ? (
          <option value={port.deviceName}>{port.deviceName} (desconectado)</option>
        ) : null}
        {devices.map((device) => (
          <option key={device} value={device}>
            {device}
          </option>
        ))}
        <option value={VIRTUAL_OPTION}>Crear puerto virtual…</option>
      </select>

      {isVirtual ? (
        <input
          {...stylex.props(styles.input, styles.portDetail)}
          value={port.deviceName}
          placeholder="Nombre del puerto virtual"
          aria-label={`Nombre del puerto virtual ${port.id}`}
          onChange={(event) => onChange({ ...port, deviceName: event.target.value })}
        />
      ) : (
        <span {...stylex.props(styles.portState, styles.portDetail)}>{state}</span>
      )}

      <ActionButton
        variant="danger"
        size="small"
        aria-label={`Quitar puerto ${port.deviceName || port.id}`}
        onPress={onRemove}
        {...stylex.props(styles.portRemove)}
      >
        Quitar
      </ActionButton>
    </div>
  )
}
export { PortRow }
