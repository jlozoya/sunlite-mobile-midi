import { useRef } from "react"
import type { KeyboardEvent, PointerEvent } from "react"

const TAP_CANCEL_DISTANCE_PX = 12

export type MidiButtonPressHandlers = {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onPointerMove: (event: PointerEvent<HTMLElement>) => void
  onPointerUp: (event: PointerEvent<HTMLElement>) => void
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  onKeyUp: (event: KeyboardEvent<HTMLElement>) => void
}

export function useMidiButtonPress(options: {
  isMobileView: boolean
  onPressStart: () => void
  onPressEnd: () => void
}): MidiButtonPressHandlers {
  const pointerStartRef = useRef<{
    pointerId: number
    x: number
    y: number
    didStartMidi: boolean
    canceled: boolean
  } | null>(null)
  const keyboardActiveRef = useRef(false)

  function cancelPointerPress(target: HTMLElement, pointerId: number) {
    const pointerStart = pointerStartRef.current
    if (!pointerStart || pointerStart.pointerId !== pointerId) return

    if (pointerStart.didStartMidi) {
      options.onPressEnd()
    }

    if (target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId)
    }

    pointerStartRef.current = null
  }

  return {
    onPointerDown(event) {
      if (event.pointerType === "mouse" && event.button !== 0) return

      pointerStartRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        didStartMidi: !options.isMobileView,
        canceled: false,
      }

      // Desktop behaves like a hardware momentary button. Mobile does not
      // capture the pointer and waits until pointer-up so normal page scroll
      // gestures do not trigger a MIDI click.
      if (!options.isMobileView) {
        event.currentTarget.setPointerCapture(event.pointerId)
        options.onPressStart()
      }
    },
    onPointerMove(event) {
      const pointerStart = pointerStartRef.current
      if (!pointerStart || pointerStart.pointerId !== event.pointerId) return

      const deltaX = event.clientX - pointerStart.x
      const deltaY = event.clientY - pointerStart.y
      const distance = Math.hypot(deltaX, deltaY)

      if (options.isMobileView && distance > TAP_CANCEL_DISTANCE_PX) {
        pointerStart.canceled = true
        cancelPointerPress(event.currentTarget, event.pointerId)
      }
    },
    onPointerUp(event) {
      const pointerStart = pointerStartRef.current
      if (!pointerStart || pointerStart.pointerId !== event.pointerId) return

      if (options.isMobileView) {
        const deltaX = event.clientX - pointerStart.x
        const deltaY = event.clientY - pointerStart.y
        const distance = Math.hypot(deltaX, deltaY)

        if (!pointerStart.canceled && distance <= TAP_CANCEL_DISTANCE_PX) {
          options.onPressStart()
          options.onPressEnd()
        }
      } else if (pointerStart.didStartMidi) {
        options.onPressEnd()
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }

      pointerStartRef.current = null
    },
    onPointerCancel(event) {
      cancelPointerPress(event.currentTarget, event.pointerId)
    },
    onKeyDown(event) {
      if (event.key !== " " && event.key !== "Enter") return
      if (keyboardActiveRef.current) return

      keyboardActiveRef.current = true
      options.onPressStart()
    },
    onKeyUp(event) {
      if (event.key !== " " && event.key !== "Enter") return
      if (!keyboardActiveRef.current) return

      keyboardActiveRef.current = false
      options.onPressEnd()
    },
  }
}
