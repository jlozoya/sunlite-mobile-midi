# Project structure

This project separates the Electron host, the browser interface, the standalone MIDI
router and their shared contracts. Keep changes inside the feature that owns them.

```text
src/
  main/
    main.ts                 Application composition and Electron lifecycle
    runtime-paths.ts        Packaged/development resource paths
    electron/               Trusted IPC, capture permissions and update setup
    server/                 HTTP routes, WebSocket protocol and network selection
    midi/                   Controller connection, messages and bridge provisioning
    persistence/            Profile-aware controller and MIDI feedback stores
    automation/             Training, inference, sessions and DJ/capture integrations
    router-service.ts       Router integration for the desktop application
  renderer/
    main.tsx                React entry point
    ui/
      App.tsx               Application layout and navigation
      components/           Controller controls, connection panel and shared app UI
      hooks/                General UI and connection setup hooks
      controller/           MIDI commands and LED feedback logic
      automation/           Studio sections, capture/audio hooks and timeline editors
      router/               Router panel, wizard, routes, ports and monitor
      ui-kit/               Reusable accessible UI primitives and design tokens
  router/                   Standalone MIDI routing engine and CLI
  shared/                   Browser-safe types, protocol contracts and pure helpers
  types/                    Ambient declarations for external packages
scripts/                    Development, architecture and release tooling
tests/                      Behavioural and regression tests
resources/                  Packaged application assets
python/                     Existing optional DJ LINK bridge/sidecar tooling
```

## Dependency rules

- `main` may use `shared` and `router`. Browser UI stays in `renderer`.
- `renderer` may use `shared`; it reaches desktop capabilities through the narrow
  preload API, HTTP and WebSocket, rather than importing Electron or Node services.
- `router` may use `shared` and remains usable without Electron.
- `shared` depends only on other browser-safe shared modules. Define contracts here
  once: `server-status.ts`, `midi-feedback.ts`, `automation-types.ts`, and `router-types.ts`.

## File conventions

Use PascalCase for React component files and `useFeature.ts` for hooks. Backend
services and pure utilities use descriptive kebab-case names. Feature styles live
in neighbouring `*.styles.ts` files and use the existing StyleX tokens and conventions.
Keep reusable primitives in `ui-kit`; keep domain-specific controls beside their feature.

Separate rendering, resource acquisition, persistence and transport handling when a
file starts mixing responsibilities. Aim for 200–400 lines for a substantial module;
`check:architecture` enforces a project limit of 600 lines for TypeScript source.
Split at responsibility boundaries, rather than creating arbitrary numbered chunks.
Generated output, lockfiles, documentation and test fixtures are outside that limit.

Services receive callbacks for mutable state such as the active lighting profile or
engine. This keeps profile changes visible without stale snapshots and lets route and
storage tests run without Electron or MIDI hardware. Preserve endpoint names, payloads,
stored file formats and IPC origin checks when refactoring.

## Verification

```bash
bun run check
bun run test
bun run build
```

`check` validates formatting, strict TypeScript (including unused declarations) and architecture. Tests cover controller
input, socket reconnection, routing, updates, automation, capture geometry and the
extracted HTTP/persistence services. Build compiles both Electron and the StyleX/React
renderer. Native MIDI devices, CDJs and Windows screen/audio capture also need manual
checks on a suitably connected desktop; automated tests do not emulate that hardware.
