declare module "easymidi" {
  export function getOutputs(): string[]
  export function getInputs(): string[]

  export type NoteMessage = { note: number; velocity: number; channel: number }
  export type ControlChangeMessage = { controller: number; value: number; channel: number }

  export class Output {
    constructor(name: string, virtual?: boolean)
    send(type: "noteon", message: NoteMessage): void
    send(type: "noteoff", message: NoteMessage): void
    send(type: "cc", message: ControlChangeMessage): void
    send(type: "program", message: { number: number; channel: number }): void
    close(): void
  }

  export class Input {
    constructor(name: string, virtual?: boolean)
    on(type: "noteon", callback: (message: NoteMessage) => void): void
    on(type: "noteoff", callback: (message: NoteMessage) => void): void
    on(type: "cc", callback: (message: ControlChangeMessage) => void): void
    close(): void
  }
}
