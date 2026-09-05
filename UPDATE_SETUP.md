# Installable and updateable builds

This project uses `electron-builder` for the Windows installer and `electron-updater`
for update checks.

## Build an installer

```powershell
bun install
bun run dist:win
```

`dist:win` builds the NSIS installer and then runs `scripts/verify-release.mjs`, which
fails the build unless the artifacts are internally consistent. It checks that
`latest.yml` matches `package.json`, that every listed installer exists with the
declared size and SHA-512, that the blockmap is present, that the packaged update feed
points at this repository, that the private driver installers are not bundled, and that
the asar contains the main process, the preload script, the renderer and both native
modules.

Artifacts are written to `release/`:

- `Sunlite-Mobile-MIDI-Setup-<version>-x64.exe` NSIS installer
- `Sunlite-Mobile-MIDI-Setup-<version>-x64.exe.blockmap`
- `latest.yml`
- `win-unpacked/` unpacked application

The installer filename must not contain spaces: `electron-updater` resolves the download
from the `url` field in `latest.yml`, and `electron-builder` writes that field with
spaces replaced by hyphens. A published asset whose name does not match that field
cannot be downloaded by the updater.

An optional portable build is available through `bun run dist:portable`. It is not part
of the update feed, and the app disables updates when it detects a portable copy.

On first launch the app provisions the configured MIDI bridge, creates `Sunlite Mobile In`
and `Sunlite Mobile Out`, starts it minimized and waits until the ports are usable.
Public redistribution of loopMIDI is not permitted without the author's written consent;
replace the private-build installer with a licensed virtualMIDI MSI before publishing.

## Code signing

The build currently produces an unsigned installer. Windows SmartScreen warns on
unsigned installers, and `electron-updater` cannot verify a publisher. Supply
`CSC_LINK` and `CSC_KEY_PASSWORD` to `electron-builder` before publishing to end users.

## App icon

The application icon is stored in:

```txt
resources/icon.ico
resources/icon.png
```

Electron Builder uses `resources/icon.ico` for the Windows installer and shortcuts.
The Electron window also uses the same icon at runtime.

## Auto-updates

Updates are served from GitHub releases of this repository:

```json
"publish": [
  {
    "provider": "github",
    "owner": "jlozoya",
    "repo": "sunlite-mobile-midi",
    "releaseType": "release"
  }
]
```

Updates are deliberately not automatic. The app never downloads or installs on its own,
and never installs on quit. The **Actualizaciones** panel exposes three explicit steps:
search, download, install. Installing is refused while a training session is recording
or while automation is not in Manual mode, so an update cannot interrupt a live show.

Updates are disabled, with the reason shown in the panel, when the app runs in
development, outside Windows, as a portable executable, or from a copy that was not
installed by the NSIS installer.

## Publishing a release

1. Update `version` in `package.json`.
2. Commit and tag the commit as `v<version>`. The `Windows installer` workflow verifies
   that the tag matches `package.json` and refuses to build otherwise.
3. Push the tag. The workflow typechecks, runs the update and automation tests, builds
   the installer and uploads it as a build artifact.
4. Attach `Sunlite-Mobile-MIDI-Setup-<version>-x64.exe`, its `.blockmap` and `latest.yml`
   to the GitHub release for that tag, preserving the filenames exactly.

The workflow does not create or publish the GitHub release itself; it only produces and
uploads the verified artifacts. Publishing stays a manual step so that signing and
release notes are reviewed before installed copies can see the new version.

## Local update feed override

For testing, override the update feed URL at runtime. The URL must use HTTPS, except on
loopback addresses, and may not carry credentials, a query string or a fragment:

```powershell
$env:SUNLITE_UPDATE_FEED_URL="http://localhost:8080/updates"
.\"Sunlite Mobile MIDI.exe"
```

Serve `latest.yml`, the installer and the blockmap from that URL.
