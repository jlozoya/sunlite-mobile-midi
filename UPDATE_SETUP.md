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
modules, and that the executable contains the application name and icon.

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

The build currently produces an unsigned installer because `win.signExecutable` is
`false`. Windows SmartScreen may warn, and `electron-updater` cannot verify a
publisher. To sign a future release, remove that setting and provide `CSC_LINK` and
`CSC_KEY_PASSWORD` to the build.

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

The installed app checks five seconds after startup and every four hours. When a new
stable version is found, it downloads automatically and reports progress in the
**Actualizaciones** panel. Failed downloads can be retried from the panel or through
the next scheduled check. Only one check/download runs at a time, and a downloaded
installer is preserved until you choose **Instalar y reiniciar**.

The app never installs on ordinary quit. Installing is refused while a training
session is recording or while automation is not in Manual mode, so an update cannot
interrupt a live show.

Updates are disabled, with the reason shown in the panel, when the app runs in
development, outside Windows, as a portable executable, or from a copy that was not
installed by the NSIS installer.

## Publishing a release

1. Increase `version` in `package.json` to a stable `x.y.z` version newer than the
   current published release.
2. Commit and push the changes to `master`. The `Windows installer` workflow checks
   the version, runs checks/tests, builds the NSIS installer and verifies its files.
3. CI creates a draft GitHub release tagged `v<version>` at the triggering commit,
   uploads the installer, its `.blockmap`, and `latest.yml`, then makes it public.
   Installed copies automatically find and download it.

No local publishing token is required: CI uses `github.token` with write access only
in the publish job. The repository must be public for installed clients to download
updates without credentials. GitHub Actions must be enabled and repository policies
must allow the workflow to create tags and releases.

Existing published versions are skipped, and older versions cannot replace the latest
stable release. Upload failures leave a draft which can be resumed by rerunning the
workflow. Publication is serialized to avoid concurrent uploads. A version tag that
already points at a different commit is rejected.

Pushing a matching `v<version>` tag also supports the same pipeline. Manual
`workflow_dispatch` runs build without publishing by default; select **publish** to
publish from `master` or a matching version tag. Version tags must match `package.json`.

Run `bun run test:updates` to verify download behavior and release planning locally.
Installed copies must first receive a build containing this automatic download logic;
older builds retain their previous manual download behavior.

## Local update feed override

For testing, override the update feed URL at runtime. The URL must use HTTPS, except on
loopback addresses, and may not carry credentials, a query string or a fragment:

```powershell
$env:SUNLITE_UPDATE_FEED_URL="http://localhost:8080/updates"
.\"Sunlite Mobile MIDI.exe"
```

Serve `latest.yml`, the installer and the blockmap from that URL.
