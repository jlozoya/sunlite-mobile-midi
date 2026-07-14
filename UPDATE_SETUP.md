# Installable and updateable builds

This project uses `electron-builder` for Windows installers and `electron-updater` for update checks.

## Build an installer

Install the build-only Python dependency once. End users do not need Python:

```powershell
python -m pip install -r python/requirements-build.txt
```

```powershell
bun install
bun run dist:win
```

Artifacts are written to `release/`:

- `Sunlite Mobile MIDI-Setup-<version>-x64.exe` NSIS installer
- `Sunlite Mobile MIDI-Setup-<version>-x64.exe.blockmap`
- `Sunlite Mobile MIDI-Portable-<version>-x64.exe`
- `latest.yml`
- portable build, when enabled

The build also compiles `python/prodj_link_bridge.py` into a standalone Windows executable and packages it under `resources/prodj-link` in the installed application.

On first launch the app provisions the configured MIDI bridge, creates `Sunlite Mobile In` and `Sunlite Mobile Out`, starts it minimized and waits until the ports are usable. Public redistribution of loopMIDI is not permitted without the author's written consent; replace the private-build installer with a licensed virtualMIDI MSI before publishing.

## App icon

The application icon is stored in:

```txt
resources/icon.ico
resources/icon.png
```

Electron Builder uses `resources/icon.ico` for the Windows installer and shortcuts.
The Electron window also uses the same icon at runtime.

## Configure auto-updates

The app is wired for generic update hosting. Replace the placeholder URL in `package.json`:

```json
"publish": [
  {
    "provider": "generic",
    "url": "https://your-domain.com/sunlite-mobile-midi/updates"
  }
]
```

Then build a release:

```powershell
bun run dist:win
```

Upload these files from `release/` to that update URL:

```txt
latest.yml
*.exe
*.blockmap
```

When a newer version is available in `latest.yml`, the installed app downloads it automatically and installs it when the app quits.

## Version updates

Before creating a new release, update `package.json`:

```json
"version": "0.1.1"
```

Then rebuild and upload the new `release/` artifacts.

## Local update feed override

For testing, you can override the update feed URL at runtime:

```powershell
$env:SUNLITE_UPDATE_FEED_URL="http://localhost:8080/updates"
.\"Sunlite Mobile MIDI.exe"
```
