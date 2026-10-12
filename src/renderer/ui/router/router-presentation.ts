import { type ChannelSelection, type PortDefinition } from "../../../shared/router-types"

function describeChannels(channels: ChannelSelection): string {
  if (channels === "omni") return "todos los canales"
  if (channels.length === 1) return `solo el canal ${channels[0]}`
  return `canales ${channels.join(", ")}`
}

/**
 * The virtual ports as the other programs have to read them: a port the router listens
 * on is the one a program sends to, so in that program's settings it is an output.
 */
function programPortGroups(
  ports: readonly PortDefinition[],
): Array<{ label: string; names: string[] }> {
  const groups = [
    {
      label: "Salida MIDI del programa (lo que envía)",
      names: ports.filter((port) => port.role === "input").map((p) => p.deviceName),
    },
    {
      label: "Entrada MIDI del programa (lo que recibe)",
      names: ports.filter((port) => port.role === "output").map((p) => p.deviceName),
    },
  ]

  return groups.filter((group) => group.names.length > 0)
}
export { describeChannels, programPortGroups }
