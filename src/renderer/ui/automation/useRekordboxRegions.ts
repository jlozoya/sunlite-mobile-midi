import { useEffect, useRef, useState, type PointerEvent } from "react"
import {
  type RekordboxCaptureRegion,
  type RekordboxCaptureStatus,
  type RekordboxDeckNumber,
} from "../../../shared/rekordbox-capture"
import { type RegionHandle } from "./rekordbox-region-geometry"
import type { RekordboxCaptureRegions } from "../../../shared/rekordbox-capture"
import { transformRegion } from "./rekordbox-region-geometry"

const emptyStatus: RekordboxCaptureStatus = { available: false, regions: {} }

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
export function useRekordboxRegions(enabled: boolean) {
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
  function cancelDrag(deck: RekordboxDeckNumber) {
    dragRef.current = null
    setDraft(statusRef.current.regions[deck] ?? null)
  }
  function invalidatePreview() {
    setPreview(null)
    setPreviewReady(false)
  }
  return {
    status,
    statusLoaded,
    preview,
    previewReady,
    setPreviewReady,
    selecting,
    draft,
    hidden,
    error,
    setError,
    selectDeck,
    finishSelection,
    toggleDeck,
    beginDrag,
    moveDrag,
    finishDrag,
    deleteDeck,
    configured,
    saveRegions,
    cancelDrag,
    invalidatePreview,
  }
}
const decks = [1, 2, 3, 4] as const
