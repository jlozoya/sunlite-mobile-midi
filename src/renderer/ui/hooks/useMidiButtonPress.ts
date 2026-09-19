import { useEffect, useRef } from "react"
import type { KeyboardEvent, PointerEvent } from "react"
import type { PressEvent } from "react-aria-components"

const TAP_CANCEL_DISTANCE_PX = 12

type ActivePress = {
  release: (() => void) | null
} & (
  | { kind: "pointer"; pointerId: number; x: number; y: number; target: HTMLElement }
  | { kind: "keyboard"; key: string }
)

export type MidiButtonPressHandlers = {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onPointerMove: (event: PointerEvent<HTMLElement>) => void
  onPointerUp: (event: PointerEvent<HTMLElement>) => void
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void
  onLostPointerCapture: (event: PointerEvent<HTMLElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  onKeyUp: (event: KeyboardEvent<HTMLElement>) => void
  onBlur: () => void
  onPress: (event: PressEvent) => void
}

export function useMidiButtonPress(options: {
  isMobileView: boolean
  isDisabled?: boolean
  onPressStart: () => void
  onPressEnd: () => void
}): MidiButtonPressHandlers {
  const activePressRef = useRef<ActivePress | null>(null)

  function releasePress() {
    const activePress = activePressRef.current
    if (!activePress) return

    // Clear first: releasing capture can synchronously dispatch another cancellation.
    activePressRef.current = null
    activePress.release?.()
    if (
      activePress.kind === "pointer" &&
      activePress.target.hasPointerCapture(activePress.pointerId)
    ) {
      activePress.target.releasePointerCapture(activePress.pointerId)
    }
  }

  function cancelPointerPress(pointerId: number) {
    const activePress = activePressRef.current
    if (activePress?.kind === "pointer" && activePress.pointerId === pointerId) {
      releasePress()
    }
  }

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) releasePress()
    }
    window.addEventListener("blur", releasePress)
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      window.removeEventListener("blur", releasePress)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      releasePress()
    }
  }, [])

  useEffect(() => {
    if (options.isDisabled) releasePress()
  }, [options.isDisabled])

  return {
    onPointerDown(event) {
      if (options.isDisabled || activePressRef.current) return
      if (event.button !== 0) return

      activePressRef.current = {
        kind: "pointer",
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        target: event.currentTarget,
        release: options.isMobileView ? null : options.onPressEnd,
      }

      // Mobile waits until pointer-up so scrolling never fires a MIDI note.
      if (!options.isMobileView) {
        event.currentTarget.setPointerCapture(event.pointerId)
        options.onPressStart()
      }
    },
    onPointerMove(event) {
      const activePress = activePressRef.current
      if (activePress?.kind !== "pointer" || activePress.pointerId !== event.pointerId) {
        return
      }

      if (
        !activePress.release &&
        Math.hypot(event.clientX - activePress.x, event.clientY - activePress.y) >
          TAP_CANCEL_DISTANCE_PX
      ) {
        releasePress()
      }
    },
    onPointerUp(event) {
      const activePress = activePressRef.current
      if (activePress?.kind !== "pointer" || activePress.pointerId !== event.pointerId) {
        return
      }

      if (
        !options.isDisabled &&
        !activePress.release &&
        Math.hypot(event.clientX - activePress.x, event.clientY - activePress.y) <=
          TAP_CANCEL_DISTANCE_PX
      ) {
        activePress.release = options.onPressEnd
        options.onPressStart()
      }
      releasePress()
    },
    onPointerCancel(event) {
      cancelPointerPress(event.pointerId)
    },
    onLostPointerCapture(event) {
      cancelPointerPress(event.pointerId)
    },
    onKeyDown(event) {
      if (event.key !== " " && event.key !== "Enter") return
      event.preventDefault()
      if (options.isDisabled || event.repeat || activePressRef.current) return

      activePressRef.current = {
        kind: "keyboard",
        key: event.key,
        release: options.onPressEnd,
      }
      options.onPressStart()
    },
    onKeyUp(event) {
      if (event.key !== " " && event.key !== "Enter") return
      event.preventDefault()
      const activePress = activePressRef.current
      if (activePress?.kind === "keyboard" && activePress.key === event.key) {
        releasePress()
      }
    },
    onBlur: releasePress,
    onPress(event) {
      // Screen readers can activate a button without pointer or keyboard events.
      if (
        event.pointerType !== "virtual" ||
        options.isDisabled ||
        activePressRef.current
      ) {
        return
      }
      options.onPressStart()
      options.onPressEnd()
    },
  }
}
