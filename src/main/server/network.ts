import http from "node:http"
import os from "node:os"
import type { NetworkUrlCandidate } from "../../shared/server-status.js"

const MAX_PORT_ATTEMPTS = 25

function isLikelyVirtualInterface(interfaceName: string): boolean {
  const name = interfaceName.toLowerCase()
  const virtualMarkers = [
    "vethernet",
    "virtual",
    "vmware",
    "virtualbox",
    "docker",
    "wsl",
    "hyper-v",
    "tailscale",
    "zerotier",
    "vpn",
    "tap",
    "wintun",
    "hamachi",
    "anyconnect",
    "nord",
    "loopback",
    "bluetooth",
    "npcap",
  ]

  return virtualMarkers.some((marker) => name.includes(marker))
}

function isPreferredLanInterface(interfaceName: string): boolean {
  const name = interfaceName.toLowerCase()
  return (
    name.includes("wi-fi") ||
    name.includes("wifi") ||
    name.includes("wireless") ||
    name.includes("wlan") ||
    name.includes("ethernet")
  )
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number)

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false
  }

  const [first, second] = parts

  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

function isLinkLocalIpv4(address: string): boolean {
  return address.startsWith("169.254.")
}

function getNetworkUrlCandidates(port: number): NetworkUrlCandidate[] {
  const interfaces = os.networkInterfaces()
  const candidates: NetworkUrlCandidate[] = []

  for (const [interfaceName, addresses] of Object.entries(interfaces)) {
    if (!addresses) continue

    for (const address of addresses) {
      if (address.family !== "IPv4" || address.internal) continue

      const isVirtual = isLikelyVirtualInterface(interfaceName)
      const isPreferredInterface = isPreferredLanInterface(interfaceName)
      const isPrivate = isPrivateIpv4(address.address)
      const isLinkLocal = isLinkLocalIpv4(address.address)

      let priority = 0
      if (isPreferredInterface) priority += 100
      if (isPrivate) priority += 40
      if (isVirtual) priority -= 200
      if (isLinkLocal) priority -= 120

      candidates.push({
        interfaceName,
        address: address.address,
        url: `http://${address.address}:${port}`,
        priority,
        note: isVirtual
          ? "virtual adapter"
          : isPreferredInterface
            ? "preferred LAN adapter"
            : isPrivate
              ? "private LAN adapter"
              : "network adapter",
      })
    }
  }

  return candidates.sort(
    (a, b) => b.priority - a.priority || a.interfaceName.localeCompare(b.interfaceName),
  )
}

function isPortInUseError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "EADDRINUSE"
  )
}

function listenWithPortFallback(
  httpServer: http.Server,
  preferredPort: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let currentPort = preferredPort
    let attempts = 0

    function tryListen() {
      httpServer.removeAllListeners("error")

      httpServer.once("error", (error) => {
        if (!isPortInUseError(error) || attempts >= MAX_PORT_ATTEMPTS) {
          reject(error)
          return
        }

        console.warn(
          `[HTTP] Port ${currentPort} is busy. Trying port ${currentPort + 1}.`,
        )

        attempts += 1
        currentPort += 1
        setTimeout(tryListen, 50)
      })

      httpServer.listen(currentPort, "0.0.0.0", () => {
        const address = httpServer.address()
        const resolvedPort =
          typeof address === "object" && address?.port ? address.port : currentPort

        if (resolvedPort !== preferredPort) {
          console.warn(
            `[HTTP] Preferred port ${preferredPort} was busy. Server started on ${resolvedPort}.`,
          )
        } else {
          console.info(`[HTTP] Server started on port ${resolvedPort}.`)
        }

        resolve(resolvedPort)
      })
    }

    tryListen()
  })
}
export { getNetworkUrlCandidates, listenWithPortFallback }
