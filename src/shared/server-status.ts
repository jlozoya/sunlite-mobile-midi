import type { LightingSoftware } from "./lighting-software.js"

type NetworkUrlCandidate = {
  interfaceName: string
  address: string
  url: string
  priority: number
  note: string
}

type ServerStatus = {
  lightingSoftware: LightingSoftware
  port: number
  localUrl: string
  lanUrls: string[]
  networkUrlCandidates: NetworkUrlCandidate[]
  preferredLanUrl: string
  qrDataUrl: string
  midiOutputName: string | null
  midiInputName: string | null
  expectedMidiOutputName: string
  expectedMidiInputName: string
  midiReady: boolean
  feedbackReady: boolean
  feedbackDisabledReason: string | null
  midiChannel: number
  availableMidiOutputs: string[]
  availableMidiInputs: string[]
  loopMidiInstallerAvailable: boolean
  loopMidiExecutablePath: string | null
  loopMidiInstalled: boolean
  midiAutoConfigured: boolean
  midiProvisioningMessage: string | null
}
export type { NetworkUrlCandidate, ServerStatus }
