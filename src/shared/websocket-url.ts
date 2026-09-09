const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"])

export const DEV_BACKEND_PORT_PARAM = "sunliteBackendPort"

export function websocketUrlForPage(pageUrl: string): string {
  const page = new URL(pageUrl)
  const socketUrl = new URL(page.origin)
  const backendPort = page.searchParams.get(DEV_BACKEND_PORT_PARAM)
  const numericPort = backendPort === null ? NaN : Number(backendPort)

  if (
    LOOPBACK_HOSTS.has(page.hostname) &&
    Number.isInteger(numericPort) &&
    numericPort >= 1 &&
    numericPort <= 65_535
  ) {
    socketUrl.port = String(numericPort)
  }

  socketUrl.protocol = page.protocol === "https:" ? "wss:" : "ws:"
  socketUrl.pathname = "/ws"
  return socketUrl.toString()
}
