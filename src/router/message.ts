/**
 * Raw MIDI byte helpers.
 *
 * The router works on raw bytes rather than parsed objects so that anything it does
 * not understand - SysEx, MIDI Time Code, manufacturer specific system messages -
 * still reaches its destination untouched.
 */
import { type MessageClass } from "./types.js"

export const NOTE_OFF = 0x80
export const NOTE_ON = 0x90
export const POLY_AFTERTOUCH = 0xa0
export const CONTROL_CHANGE = 0xb0
export const PROGRAM_CHANGE = 0xc0
export const CHANNEL_AFTERTOUCH = 0xd0
export const PITCH_BEND = 0xe0
export const SYSTEM_PREFIX = 0xf0

export const SYSEX_START = 0xf0
export const MTC_QUARTER_FRAME = 0xf1
export const SONG_POSITION = 0xf2
export const SONG_SELECT = 0xf3
export const TUNE_REQUEST = 0xf6
export const CLOCK = 0xf8
export const START = 0xfa
export const CONTINUE = 0xfb
export const STOP = 0xfc
export const ACTIVE_SENSING = 0xfe
export const SYSTEM_RESET = 0xff

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function isStatusByte(byte: number): boolean {
  return byte >= 0x80
}

/** True for note/cc/program/aftertouch/pitch-bend messages, which carry a channel. */
export function isChannelMessage(bytes: readonly number[]): boolean {
  const status = bytes[0]
  return status !== undefined && status >= 0x80 && status < 0xf0
}

/** High nibble for channel messages, full status byte for system messages. */
export function getMessageType(bytes: readonly number[]): number {
  const status = bytes[0] ?? 0
  return isChannelMessage(bytes) ? status & 0xf0 : status
}

/** 1-based MIDI channel, or `null` for system messages. */
export function getChannel(bytes: readonly number[]): number | null {
  if (!isChannelMessage(bytes)) return null
  return ((bytes[0] ?? 0) & 0x0f) + 1
}

/** Copy of `bytes` addressed to a 1-based `channel`. System messages pass through. */
export function withChannel(bytes: readonly number[], channel: number): number[] {
  if (!isChannelMessage(bytes)) return [...bytes]
  const zeroBased = clamp(Math.round(channel), 1, 16) - 1
  const next = [...bytes]
  next[0] = ((bytes[0] ?? 0) & 0xf0) | zeroBased
  return next
}

/** A note-on with velocity 0 is a note-off, and every device is expected to honour that. */
export function isNoteOn(bytes: readonly number[]): boolean {
  return getMessageType(bytes) === NOTE_ON && (bytes[2] ?? 0) > 0
}

export function isNoteOff(bytes: readonly number[]): boolean {
  const type = getMessageType(bytes)
  if (type === NOTE_OFF) return true
  return type === NOTE_ON && (bytes[2] ?? 0) === 0
}

export function classifyMessage(bytes: readonly number[]): MessageClass | null {
  const status = bytes[0]
  if (status === undefined || status < 0x80) return null

  switch (getMessageType(bytes)) {
    case NOTE_OFF:
    case NOTE_ON:
      return "note"
    case POLY_AFTERTOUCH:
    case CHANNEL_AFTERTOUCH:
      return "aftertouch"
    case CONTROL_CHANGE:
      return "cc"
    case PROGRAM_CHANGE:
      return "programChange"
    case PITCH_BEND:
      return "pitchBend"
    case SYSEX_START:
      return "sysex"
    case MTC_QUARTER_FRAME:
    case SONG_POSITION:
    case SONG_SELECT:
    case TUNE_REQUEST:
      return "systemCommon"
    case CLOCK:
    case ACTIVE_SENSING:
      return "clock"
    case START:
    case CONTINUE:
    case STOP:
    case SYSTEM_RESET:
      return "transport"
    default:
      return null
  }
}

export function noteNumberToName(note: number): string {
  const index = clamp(Math.round(note), 0, 127)
  const name = NOTE_NAMES[index % 12] ?? "?"
  return `${name}${Math.floor(index / 12) - 1}`
}

/** Compact one-line rendering used by the monitor. */
export function describeMessage(bytes: readonly number[]): string {
  const type = getMessageType(bytes)
  const data1 = bytes[1] ?? 0
  const data2 = bytes[2] ?? 0

  switch (type) {
    case NOTE_ON:
      return data2 > 0
        ? `Note On    ${noteNumberToName(data1).padEnd(4)} ${data2}`
        : `Note Off   ${noteNumberToName(data1).padEnd(4)} 0`
    case NOTE_OFF:
      return `Note Off   ${noteNumberToName(data1).padEnd(4)} ${data2}`
    case POLY_AFTERTOUCH:
      return `Poly AT    ${noteNumberToName(data1).padEnd(4)} ${data2}`
    case CONTROL_CHANGE:
      return `CC         ${String(data1).padEnd(4)} ${data2}`
    case PROGRAM_CHANGE:
      return `Program    ${data1}`
    case CHANNEL_AFTERTOUCH:
      return `Channel AT ${data1}`
    case PITCH_BEND:
      return `Pitch Bend ${(data2 << 7) + data1 - 8192}`
    case SYSEX_START:
      return `SysEx      ${bytes.length} bytes`
    case CLOCK:
      return "Clock"
    case START:
      return "Start"
    case CONTINUE:
      return "Continue"
    case STOP:
      return "Stop"
    case SONG_POSITION:
      return `Song Pos   ${(data2 << 7) + data1}`
    case SONG_SELECT:
      return `Song Sel   ${data1}`
    case ACTIVE_SENSING:
      return "Active Sensing"
    case SYSTEM_RESET:
      return "Reset"
    default:
      return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(" ")
  }
}
