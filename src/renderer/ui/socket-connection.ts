type SocketHandlers = {
  onConnect?: (socket: WebSocket) => void
  onOpen?: () => void
  onMessage: (event: MessageEvent) => void
  onClose?: () => void
  onError?: () => void
}

/** Reconnect after a network loss and discard events from closed connections. */
export function createReconnectingSocket(url: string, handlers: SocketHandlers) {
  let disposed = false
  let socket: WebSocket
  let connection: AbortController
  let retryTimer: number | undefined

  function connect() {
    if (disposed) return
    retryTimer = undefined
    socket = new WebSocket(url)
    connection = new AbortController()
    const { signal } = connection
    handlers.onConnect?.(socket)

    socket.addEventListener("open", () => handlers.onOpen?.(), { signal })
    socket.addEventListener("message", handlers.onMessage, { signal })
    socket.addEventListener("error", () => handlers.onError?.(), { signal })
    socket.addEventListener(
      "close",
      () => {
        connection.abort()
        handlers.onClose?.()
        if (!disposed) retryTimer = window.setTimeout(connect, 1000)
      },
      { signal },
    )
  }

  connect()
  return () => {
    if (disposed) return
    disposed = true
    window.clearTimeout(retryTimer)
    connection.abort()
    socket.close()
  }
}
