# Sunlite Mobile In / Sunlite Mobile Out MIDI

Installable Electron + React + TypeScript + StyleX + React Aria app for controlling Sunlite Suite 2 from a phone through a local Wi-Fi web controller.

## Architecture

```txt
Phone / tablet
  -> local Wi-Fi web controller
  -> Electron/Node server on the PC
  -> loopMIDI virtual MIDI output
  -> Sunlite Suite 2 MIDI input

Sunlite Suite 2 MIDI output
  -> loopMIDI virtual MIDI input
  -> Electron/Node server
  -> WebSocket feedback
  -> mobile pad colors and fader values
```

## Windows setup

1. Install loopMIDI from the desktop setup screen if needed.
2. Create a loopMIDI port named exactly:

```txt
Sunlite Mobile In / Sunlite Mobile Out
```

3. Open Sunlite Suite 2.
4. Select `Sunlite Mobile In / Sunlite Mobile Out` as a MIDI input in Sunlite.
5. To enable feedback colors/values, also select `Sunlite Mobile In / Sunlite Mobile Out` as MIDI output in Sunlite if your Sunlite mapping supports MIDI out feedback.
6. Start this app.
7. Scan the QR shown in the desktop app from your phone.
8. Map the notes and CC controls in Sunlite.

## APC-style controller layout

The mobile controller uses an APC Mini MK2-inspired layout:

- 8×8 pad matrix starting at MIDI note 36.
- 8 scene-launch buttons starting at MIDI note 100.
- 9 vertical faders using CC 1 through CC 9.
- Incoming MIDI note/CC messages update pad colors and fader positions.

## Default MIDI mapping

```txt
Pad 1 / Blackout  -> Note 36
Pad 2 / Full On   -> Note 37
Pad 3 / Scene 1   -> Note 38
Pad 4 / Scene 2   -> Note 39
Pad 5 / Scene 3   -> Note 40
Pad 6 / Scene 4   -> Note 41
Pad 7 / Strobe    -> Note 42
Pad 8 / Move 1    -> Note 43
Pad 9 / Move 2    -> Note 44
Pad 10 / Chase    -> Note 45

Scene Launch 1    -> Note 100
Scene Launch 2    -> Note 101
...
Scene Launch 8    -> Note 107

Dimmer            -> CC 1
Speed             -> CC 2
Red               -> CC 3
Green             -> CC 4
Blue              -> CC 5
White             -> CC 6
FX                -> CC 7
Size              -> CC 8
Master            -> CC 9
```

## MIDI feedback color mapping

If Sunlite sends MIDI notes back to the app, velocity controls the displayed pad color:

```txt
0        -> off
1-18     -> red
19-36    -> amber
37-54    -> yellow
55-72    -> green
73-90    -> cyan
91-108   -> blue
109-126  -> purple
127      -> white
```

## Development

```bash
bun install
bun run start
```

`bun run start` builds the renderer and main process, then opens Electron.

## Build installer

```bash
bun run dist
```

The installer and portable build will be generated in:

```txt
release/
```

## Change MIDI output name

PowerShell:

```powershell
$env:MIDI_OUTPUT_NAME="My MIDI Port"
bun run start
```

CMD:

```cmd
set MIDI_OUTPUT_NAME=My MIDI Port
bun run start
```

## Firewall

The phone must be on the same Wi-Fi network as the PC. Windows Firewall must allow this app / Node / Electron to accept private network connections.
