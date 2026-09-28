import * as stylex from "@stylexjs/stylex"
import { useEffect, useRef, useState, type PointerEvent } from "react"
import {
  REKORDBOX_EXPORT_REGIONS,
  type RekordboxCaptureRegion,
  type RekordboxCaptureRegions,
  type RekordboxCaptureStatus,
  type RekordboxDeckNumber,
} from "../../../shared/rekordbox-capture"
import { transformRegion, type RegionHandle } from "./rekordbox-region-geometry"
import { getRekordboxFrame } from "./useRekordboxVideoCapture"
import { AnimatedDisclosure } from "../components/AnimatedDisclosure"

const decks = [1, 2, 3, 4] as const
const emptyStatus: RekordboxCaptureStatus = { available: false, regions: {} }
const loadingSpin = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
})
type Point = { x: number; y: number }
type Drag = {
  pointerId: number
  mode: "create" | RegionHandle
  start: Point
  initial: RekordboxCaptureRegion | null
}

function pointInPreview(event: PointerEvent<HTMLDivElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
  }
}

function regionFromPoints(start: Point, end: Point): RekordboxCaptureRegion {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(start.x - end.x),
    height: Math.abs(start.y - end.y),
  }
}

function regionStyle(region: RekordboxCaptureRegion) {
  return {
    left: `${region.x * 100}%`,
    top: `${region.y * 100}%`,
    width: `${region.width * 100}%`,
    height: `${region.height * 100}%`,
  }
}

function LoadingIndicator({ label }: { label: string }) {
  return (
    <div role="status" {...stylex.props(styles.loadingIndicator)}>
      <span aria-hidden="true" {...stylex.props(styles.loadingSpinner)} />
      <span>{label}</span>
    </div>
  )
}

function LiveDeckCanvas({
  deck,
  region,
  enabled,
}: {
  deck: RekordboxDeckNumber
  region: RekordboxCaptureRegion
  enabled: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const readyRef = useRef(false)
  useEffect(() => {
    if (!enabled) {
      readyRef.current = false
      setReady(false)
      return
    }
    let active = true
    let timer = 0
    let animationFrame = 0
    let controller: AbortController | null = null
    let sequence = 0
    const desktop = Boolean(window.rekordboxCapture)
    const markReady = () => {
      if (readyRef.current) return
      readyRef.current = true
      setReady(true)
    }

    // On this PC, draw from the captured video before JPEG encoding or HTTP delivery.
    const drawLocal = () => {
      const frame = getRekordboxFrame()
      const canvas = canvasRef.current
      if (frame && canvas && frame.width > 0 && frame.height > 0) {
        const x = Math.floor(region.x * frame.width)
        const y = Math.floor(region.y * frame.height)
        const width = Math.max(
          1,
          Math.min(frame.width - x, Math.ceil(region.width * frame.width)),
        )
        const height = Math.max(
          1,
          Math.min(frame.height - y, Math.ceil(region.height * frame.height)),
        )
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width
          canvas.height = height
        }
        const context = canvas.getContext("2d")
        if (context) {
          context.drawImage(frame.image, x, y, width, height, 0, 0, width, height)
          markReady()
        }
      }
      if (active) animationFrame = window.requestAnimationFrame(drawLocal)
    }
    if (desktop) drawLocal()

    // The server remains the fallback on this PC and the live source on phones.
    const drawRemote = async () => {
      if (desktop && getRekordboxFrame()) {
        if (active) timer = window.setTimeout(() => void drawRemote(), 350)
        return
      }
      controller = new AbortController()
      let delay = desktop ? 350 : 70
      try {
        const response = await fetch(
          `/api/automation/rekordbox/decks/${deck}/frame?at=${sequence++}`,
          { cache: "no-store", signal: controller.signal },
        )
        if (!response.ok) throw new Error("La imagen no está disponible")
        const bitmap = await createImageBitmap(await response.blob())
        if (active && canvasRef.current && (!desktop || !getRekordboxFrame())) {
          const canvas = canvasRef.current
          if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
            canvas.width = bitmap.width
            canvas.height = bitmap.height
          }
          const context = canvas.getContext("2d")
          if (context) {
            context.drawImage(bitmap, 0, 0)
            markReady()
          }
        }
        bitmap.close()
      } catch {
        delay = 400
      }
      if (active) timer = window.setTimeout(() => void drawRemote(), delay)
    }
    void drawRemote()
    return () => {
      active = false
      controller?.abort()
      window.clearTimeout(timer)
      window.cancelAnimationFrame(animationFrame)
    }
  }, [deck, enabled, region.x, region.y, region.width, region.height])
  return (
    <div
      aria-busy={!ready && enabled}
      {...stylex.props(styles.canvasShell, !ready && styles.canvasShellLoading)}
    >
      <canvas
        ref={canvasRef}
        width={1200}
        height={70}
        role="img"
        aria-label={`Waveform y posición del deck ${deck} en Rekordbox`}
        {...stylex.props(styles.deckImage, !ready && styles.deckImagePending)}
      />
      {!ready && enabled ? (
        <div {...stylex.props(styles.canvasLoading)}>
          <LoadingIndicator label={`Cargando waveform del deck ${deck}…`} />
        </div>
      ) : null}
    </div>
  )
}

export function RekordboxWaveforms({ enabled = true }: { enabled?: boolean }) {
  const [status, setStatus] = useState<RekordboxCaptureStatus>(emptyStatus)
  const [statusLoaded, setStatusLoaded] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [previewReady, setPreviewReady] = useState(false)
  const [selecting, setSelecting] = useState<RekordboxDeckNumber | null>(null)
  const [draft, setDraft] = useState<RekordboxCaptureRegion | null>(null)
  const [hidden, setHidden] = useState<Partial<Record<RekordboxDeckNumber, boolean>>>(
    () => {
      try {
        return JSON.parse(localStorage.getItem("rekordbox-hidden-decks") || "{}")
      } catch {
        return {}
      }
    },
  )
  const [error, setError] = useState<string | null>(null)
  const selectingRef = useRef(selecting)
  const statusRef = useRef(status)
  const draftRef = useRef(draft)
  const dragRef = useRef<Drag | null>(null)
  const previewBusyRef = useRef(false)
  selectingRef.current = selecting
  statusRef.current = status
  draftRef.current = draft

  async function refreshPreview() {
    if (!window.rekordboxCapture || previewBusyRef.current) return
    previewBusyRef.current = true
    try {
      const image = await window.rekordboxCapture.preview()
      if (selectingRef.current && image) setPreview(image)
    } catch {
      // The next status refresh retries a transient capture failure.
    } finally {
      previewBusyRef.current = false
    }
  }

  useEffect(() => {
    if (!enabled) return
    let active = true
    let busy = false
    const update = async () => {
      if (busy) return
      busy = true
      try {
        const response = await fetch("/api/automation/rekordbox/status", {
          cache: "no-store",
        })
        if (!response.ok) throw new Error("No se pudo consultar Rekordbox")
        const next = (await response.json()) as RekordboxCaptureStatus
        if (!active) return
        setStatus(next)
        setStatusLoaded(true)
        if (window.rekordboxCapture && next.available && selectingRef.current) {
          await refreshPreview()
        } else if (active && !next.available) {
          setPreview(null)
          setPreviewReady(false)
        }
      } catch (cause) {
        if (active) {
          setStatus(emptyStatus)
          setStatusLoaded(true)
          setPreview(null)
          setPreviewReady(false)
          setError(cause instanceof Error ? cause.message : "Error al capturar Rekordbox")
        }
      } finally {
        busy = false
      }
    }
    void update()
    const timer = window.setInterval(() => void update(), 1500)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [enabled])

  async function saveRegions(regions: RekordboxCaptureRegions, keepEditing = false) {
    if (!window.rekordboxCapture) return
    try {
      const saved = await window.rekordboxCapture.saveRegions(regions)
      setStatus((current) => ({ ...current, regions: saved }))
      if (!keepEditing) finishSelection()
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la selección")
    }
  }

  function selectDeck(deck: RekordboxDeckNumber) {
    if (selectingRef.current === deck) {
      finishSelection()
      return
    }
    setSelecting(deck)
    selectingRef.current = deck
    setDraft(statusRef.current.regions[deck] ?? null)
    setPreview(null)
    setPreviewReady(false)
    setError(null)
    if (statusRef.current.available) void refreshPreview()
  }

  function finishSelection() {
    setSelecting(null)
    selectingRef.current = null
    setDraft(null)
    draftRef.current = null
    dragRef.current = null
    setPreview(null)
    setPreviewReady(false)
  }

  function toggleDeck(deck: RekordboxDeckNumber) {
    setHidden((current) => {
      const next = { ...current, [deck]: !current[deck] }
      try {
        localStorage.setItem("rekordbox-hidden-decks", JSON.stringify(next))
      } catch {
        /* private mode */
      }
      return next
    })
  }

  function beginDrag(event: PointerEvent<HTMLDivElement>) {
    if (!selectingRef.current) return
    const target = event.target as Element
    const control = target.closest<HTMLElement>("[data-region-control]")?.dataset
      .regionControl
    const mode: Drag["mode"] =
      control === "move" ||
      control === "nw" ||
      control === "ne" ||
      control === "sw" ||
      control === "se"
        ? control
        : "create"
    if (mode !== "create" && !draftRef.current) return
    const point = pointInPreview(event)
    dragRef.current = {
      pointerId: event.pointerId,
      mode,
      start: point,
      initial: draftRef.current,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (mode === "create") {
      const region = regionFromPoints(point, point)
      draftRef.current = region
      setDraft(region)
    }
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const point = pointInPreview(event)
    const region =
      drag.mode === "create"
        ? regionFromPoints(drag.start, point)
        : transformRegion(
            drag.initial!,
            drag.mode,
            point.x - drag.start.x,
            point.y - drag.start.y,
          )
    draftRef.current = region
    setDraft(region)
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    const deck = selectingRef.current
    if (!drag || !deck || drag.pointerId !== event.pointerId) return
    moveDrag(event)
    dragRef.current = null
    const region = draftRef.current
    if (!region || region.width < 0.02 || region.height < 0.02) {
      setDraft(drag.initial)
      draftRef.current = drag.initial
      setError("Arrastra un rectángulo más grande sobre la onda completa del deck.")
      return
    }
    void saveRegions({ ...statusRef.current.regions, [deck]: region }, true)
  }

  function deleteDeck(deck: RekordboxDeckNumber) {
    const regions = { ...statusRef.current.regions }
    delete regions[deck]
    void saveRegions(regions)
  }

  const configured = decks.filter((deck) => status.regions[deck])
  return (
    <section {...stylex.props(styles.panel)}>
      <div {...stylex.props(styles.heading)}>
        <div>
          <span {...stylex.props(styles.eyebrow)}>REKORDBOX</span>
          <strong>Waveforms de los decks</strong>
        </div>
        <span {...stylex.props(styles.detail)}>
          {status.available ? "En vivo" : "Esperando Rekordbox"}
        </span>
      </div>

      {configured.length ? (
        <div {...stylex.props(styles.grid)}>
          {configured.map((deck) => (
            <div key={deck} {...stylex.props(styles.deck)}>
              <div
                {...stylex.props(
                  styles.deckHeading,
                  hidden[deck] && styles.deckHeadingCollapsed,
                )}
              >
                <strong>Deck {deck}</strong>
                {window.rekordboxCapture ? (
                  <div {...stylex.props(styles.deckActions)}>
                    <button
                      type="button"
                      {...stylex.props(styles.iconButton)}
                      aria-label={`${hidden[deck] ? "Mostrar" : "Ocultar"} waveform del deck ${deck}`}
                      aria-controls={`rekordbox-deck-waveform-${deck}`}
                      aria-expanded={!hidden[deck]}
                      title={hidden[deck] ? "Mostrar waveform" : "Ocultar waveform"}
                      onClick={() => toggleDeck(deck)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="19"
                        height="19"
                        aria-hidden="true"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" />
                        <circle cx="12" cy="12" r="3" />
                        {hidden[deck] ? <path d="M3 21 21 3" /> : null}
                      </svg>
                    </button>
                    <button
                      type="button"
                      {...stylex.props(
                        styles.iconButton,
                        selecting === deck && styles.iconButtonActive,
                      )}
                      aria-label={`${selecting === deck ? "Finalizar ajuste" : "Ajustar zona"} del deck ${deck}`}
                      aria-pressed={selecting === deck}
                      title={selecting === deck ? "Finalizar ajuste" : "Ajustar zona"}
                      onClick={() => selectDeck(deck)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="19"
                        height="19"
                        aria-hidden="true"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      {...stylex.props(styles.iconButton, styles.iconButtonDanger)}
                      aria-label={`Eliminar selección del deck ${deck}`}
                      title="Eliminar selección"
                      onClick={() => deleteDeck(deck)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="19"
                        height="19"
                        aria-hidden="true"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6m4-6v6" />
                      </svg>
                    </button>
                  </div>
                ) : null}
              </div>
              <div
                id={`rekordbox-deck-waveform-${deck}`}
                aria-hidden={hidden[deck]}
                {...stylex.props(
                  styles.waveformArea,
                  hidden[deck] && styles.waveformAreaCollapsed,
                )}
              >
                <div {...stylex.props(styles.waveformContent)}>
                  {status.available ? (
                    <LiveDeckCanvas
                      deck={deck}
                      region={status.regions[deck]!}
                      enabled={enabled && !hidden[deck]}
                    />
                  ) : (
                    <span {...stylex.props(styles.detail)}>
                      Abre Rekordbox para ver el deck.
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : !statusLoaded ? (
        <LoadingIndicator label="Buscando waveforms de Rekordbox…" />
      ) : (
        <p {...stylex.props(styles.detail)}>
          {window.rekordboxCapture
            ? "Selecciona en la ventana de Rekordbox la onda completa de cada deck."
            : "Configura las zonas de los decks desde la aplicación de este PC."}
        </p>
      )}

      {window.rekordboxCapture ? (
        <AnimatedDisclosure
          summary="Configurar decks"
          containerProps={stylex.props(styles.deckConfiguration)}
          buttonProps={stylex.props(styles.deckConfigurationTrigger)}
          indicatorPosition="start"
        >
          <div {...stylex.props(styles.controls)}>
            <button
              type="button"
              {...stylex.props(styles.button)}
              onClick={() => void saveRegions(REKORDBOX_EXPORT_REGIONS)}
            >
              Vista estándar (2 decks)
            </button>
            {decks
              .filter((deck) => !status.regions[deck])
              .map((deck) => (
                <button
                  key={deck}
                  type="button"
                  {...stylex.props(
                    styles.button,
                    selecting === deck && styles.activeButton,
                  )}
                  onClick={() => selectDeck(deck)}
                  disabled={!status.available}
                >
                  Seleccionar deck {deck}
                </button>
              ))}
          </div>
        </AnimatedDisclosure>
      ) : null}

      {selecting ? (
        <div>
          <div {...stylex.props(styles.editingHeader)}>
            <p {...stylex.props(styles.detail)}>
              Arrastra para crear la zona del deck {selecting}. Usa las esquinas para
              cambiar su tamaño o el icono central para moverla.
            </p>
            <button
              type="button"
              {...stylex.props(styles.button)}
              onClick={finishSelection}
            >
              Finalizar ajuste
            </button>
          </div>
          <div
            aria-busy={status.available && !previewReady}
            {...stylex.props(styles.previewShell)}
          >
            {preview ? (
              <div
                {...stylex.props(styles.preview, !previewReady && styles.previewPending)}
                onPointerDown={previewReady ? beginDrag : undefined}
                onPointerMove={previewReady ? moveDrag : undefined}
                onPointerUp={previewReady ? finishDrag : undefined}
                onPointerCancel={() => {
                  dragRef.current = null
                  setDraft(statusRef.current.regions[selecting] ?? null)
                }}
              >
                <img
                  src={preview}
                  alt="Ventana de Rekordbox para elegir la zona del deck"
                  draggable={false}
                  onLoad={() => setPreviewReady(true)}
                  onError={() => {
                    setPreview(null)
                    setPreviewReady(false)
                  }}
                  {...stylex.props(styles.previewImage)}
                />
                {previewReady
                  ? decks.map((deck) => {
                      const region = deck === selecting ? draft : status.regions[deck]
                      if (!region) return null
                      return (
                        <span
                          key={deck}
                          style={regionStyle(region)}
                          {...stylex.props(
                            styles.region,
                            deck === selecting && styles.activeRegion,
                          )}
                        >
                          <span {...stylex.props(styles.regionLabel)}>{deck}</span>
                          {deck === selecting ? (
                            <>
                              {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                                <button
                                  key={corner}
                                  type="button"
                                  data-region-control={corner}
                                  aria-label={`Redimensionar esquina ${corner} del deck ${deck}`}
                                  {...stylex.props(
                                    styles.corner,
                                    corner === "nw" && styles.nw,
                                    corner === "ne" && styles.ne,
                                    corner === "sw" && styles.sw,
                                    corner === "se" && styles.se,
                                  )}
                                />
                              ))}
                              <button
                                type="button"
                                data-region-control="move"
                                aria-label={`Mover zona del deck ${deck}`}
                                title="Mover zona"
                                {...stylex.props(styles.moveHandle)}
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  width="20"
                                  height="20"
                                  aria-hidden="true"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3" />
                                </svg>
                              </button>
                            </>
                          ) : null}
                        </span>
                      )
                    })
                  : null}
              </div>
            ) : null}
            {!previewReady ? (
              <div {...stylex.props(styles.previewLoading)}>
                {status.available ? (
                  <LoadingIndicator label="Capturando vista de Rekordbox…" />
                ) : (
                  <span {...stylex.props(styles.detail)}>
                    Abre Rekordbox para ajustar la zona.
                  </span>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {error}
        </p>
      ) : null}
    </section>
  )
}

const styles = stylex.create({
  panel: {
    marginTop: "12px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(34, 211, 238, 0.18)",
    borderRadius: "18px",
    backgroundColor: "rgba(7, 12, 24, 0.72)",
    padding: "14px",
  },
  heading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "11px",
  },
  eyebrow: {
    display: "block",
    marginBottom: "3px",
    color: "#22d3ee",
    fontSize: "0.64rem",
    fontWeight: 900,
    letterSpacing: "0.1em",
  },
  detail: { color: "#94a3b8", fontSize: "0.8rem", lineHeight: 1.5 },
  loadingIndicator: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "9px",
    color: "#a5f3fc",
    fontSize: "0.78rem",
    padding: "8px",
  },
  loadingSpinner: {
    width: "17px",
    height: "17px",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "rgba(103,232,249,0.28)",
    borderTopColor: "#67e8f9",
    borderRadius: "50%",
    animationName: loadingSpin,
    animationDuration: "800ms",
    animationIterationCount: "infinite",
    animationTimingFunction: "linear",
    "@media (prefers-reduced-motion: reduce)": { animationDuration: "0ms" },
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: "10px",
  },
  deck: {
    minWidth: 0,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: "14px",
    backgroundColor: "rgba(15,23,42,0.72)",
    padding: "11px",
  },
  deckHeading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "8px",
    marginBottom: "8px",
    flexWrap: "wrap",
    transitionProperty: "margin-bottom",
    transitionDuration: "220ms",
    transitionTimingFunction: "ease",
    "@media (prefers-reduced-motion: reduce)": { transitionDuration: "0ms" },
  },
  deckHeadingCollapsed: { marginBottom: 0 },
  waveformArea: {
    display: "grid",
    gridTemplateRows: "1fr",
    opacity: 1,
    transitionProperty: "grid-template-rows, opacity",
    transitionDuration: "220ms",
    transitionTimingFunction: "ease",
    "@media (prefers-reduced-motion: reduce)": { transitionDuration: "0ms" },
  },
  waveformAreaCollapsed: { gridTemplateRows: "0fr", opacity: 0 },
  waveformContent: { minHeight: 0, overflow: "hidden" },
  deckActions: { display: "flex", gap: "5px" },
  iconButton: {
    display: "grid",
    placeItems: "center",
    width: "32px",
    height: "32px",
    padding: "5px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(34,211,238,0.35)",
    borderRadius: "7px",
    backgroundColor: "rgba(34,211,238,0.08)",
    color: "#67e8f9",
    cursor: "pointer",
    ":hover": { backgroundColor: "rgba(34,211,238,0.2)" },
    ":focus-visible": {
      outlineColor: "#67e8f9",
      outlineStyle: "solid",
      outlineWidth: "2px",
    },
  },
  iconButtonActive: { backgroundColor: "rgba(34,211,238,0.28)" },
  iconButtonDanger: {
    color: "#fca5a5",
    borderColor: "rgba(252,165,165,0.35)",
    backgroundColor: "rgba(252,165,165,0.06)",
    ":hover": { backgroundColor: "rgba(252,165,165,0.18)" },
  },
  canvasShell: {
    position: "relative",
    overflow: "hidden",
    borderRadius: "7px",
    backgroundColor: "#030712",
  },
  canvasShellLoading: { minHeight: "56px" },
  canvasLoading: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    pointerEvents: "none",
  },
  deckImage: {
    display: "block",
    width: "100%",
    height: "auto",
    borderRadius: "7px",
    opacity: 1,
    transitionProperty: "opacity",
    transitionDuration: "160ms",
    "@media (prefers-reduced-motion: reduce)": { transitionDuration: "0ms" },
  },
  deckImagePending: { opacity: 0 },
  deckConfiguration: {
    marginTop: "10px",
    color: "#67e8f9",
    fontSize: "0.8rem",
  },
  deckConfigurationTrigger: {
    display: "flex",
    alignItems: "center",
    width: "auto",
    minHeight: "28px",
    borderWidth: 0,
    backgroundColor: "transparent",
    color: "inherit",
    cursor: "pointer",
    padding: 0,
    fontSize: "inherit",
  },
  editingHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "8px",
    marginTop: "10px",
    marginBottom: "8px",
  },
  controls: { display: "flex", flexWrap: "wrap", gap: "7px", marginTop: "10px" },
  button: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(34,211,238,0.4)",
    borderRadius: "8px",
    backgroundColor: "rgba(34,211,238,0.1)",
    color: "#cffafe",
    padding: "7px 9px",
    cursor: "pointer",
    ":disabled": { opacity: 0.4, cursor: "default" },
  },
  activeButton: { backgroundColor: "rgba(34,211,238,0.3)" },
  preview: {
    position: "relative",
    touchAction: "none",
    cursor: "crosshair",
    userSelect: "none",
    opacity: 1,
    transitionProperty: "opacity",
    transitionDuration: "160ms",
    "@media (prefers-reduced-motion: reduce)": { transitionDuration: "0ms" },
  },
  previewPending: { opacity: 0, pointerEvents: "none" },
  previewShell: {
    position: "relative",
    minHeight: "160px",
    overflow: "hidden",
    borderRadius: "7px",
    backgroundColor: "#030712",
  },
  previewLoading: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    pointerEvents: "none",
  },
  previewImage: {
    display: "block",
    width: "100%",
    height: "auto",
    pointerEvents: "none",
  },
  region: {
    position: "absolute",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "#f59e0b",
    color: "#fef3c7",
    fontWeight: 900,
    pointerEvents: "none",
  },
  activeRegion: { borderColor: "#22d3ee", backgroundColor: "rgba(34,211,238,0.16)" },
  regionLabel: {
    position: "absolute",
    left: "4px",
    top: "2px",
    textShadow: "0 1px 3px #000",
  },
  corner: {
    position: "absolute",
    width: "16px",
    height: "16px",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "#083344",
    borderRadius: "4px",
    backgroundColor: "#67e8f9",
    pointerEvents: "auto",
    touchAction: "none",
    padding: 0,
    zIndex: 2,
  },
  nw: { left: "-8px", top: "-8px", cursor: "nwse-resize" },
  ne: { right: "-8px", top: "-8px", cursor: "nesw-resize" },
  sw: { left: "-8px", bottom: "-8px", cursor: "nesw-resize" },
  se: { right: "-8px", bottom: "-8px", cursor: "nwse-resize" },
  moveHandle: {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    display: "grid",
    placeItems: "center",
    width: "32px",
    height: "32px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#0e7490",
    borderRadius: "50%",
    backgroundColor: "#164e63",
    color: "#ecfeff",
    cursor: "move",
    pointerEvents: "auto",
    touchAction: "none",
    zIndex: 2,
  },
  error: { color: "#fca5a5", fontSize: "0.8rem" },
})
