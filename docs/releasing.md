# Releasing DockBricks

DockBricks uses GitHub Actions + `tauri-apps/tauri-action` for cross-platform releases.

## Workflows

- CI checks: `.github/workflows/ci.yml`
- Release pipeline: `.github/workflows/release.yml`

Release workflow runs on:

- tag push matching `v*` (for example `v0.2.0`)
- manual `workflow_dispatch`

## 1) Configure Signing Secrets

### Tauri updater signing (recommended)

Generate a key pair once:

```bash
npm run tauri signer generate -w ~/.tauri/dockbricks.key
```

Add repository secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: either
  - raw contents of the private key file, or
  - base64-encoded contents of that key file
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: password used during key generation

If you store the key as base64, use a single line (no wrapped lines):

```bash
base64 < ~/.tauri/dockbricks.key | tr -d '\n'
```

DockBricks is configured with updater plugin endpoint:

- `https://github.com/pallepadehat/DockBricks/releases/latest/download/latest.json`

and a fixed updater public key in `src-tauri/tauri.conf.json`.

### macOS signing / notarization (optional)

Add:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

`APPLE_CERTIFICATE` must be the base64-encoded content of a valid Developer ID Application `.p12` certificate export.

Example encoding command:

```bash
base64 -i certificate.p12 | pbcopy
```

Use that copied value as the `APPLE_CERTIFICATE` secret.

### Full Apple Setup (paid Developer account)

1. Create a Developer ID Application certificate in Apple Developer portal.
2. Download and install it in Keychain Access.
3. Export that certificate from Keychain as `.p12` with a password.
4. Base64 encode the `.p12` and save as GitHub secret:

```bash
base64 -i dockbricks-dev-id.p12 | pbcopy
```

5. Add these repository secrets:
   - `APPLE_CERTIFICATE`: base64 output above
   - `APPLE_CERTIFICATE_PASSWORD`: the `.p12` export password
   - `APPLE_SIGNING_IDENTITY`: exact identity string, e.g. `Developer ID Application: Your Name (TEAMID)`
   - `APPLE_ID`: your Apple ID email
   - `APPLE_PASSWORD`: Apple app-specific password (not your normal Apple ID password)
   - `APPLE_TEAM_ID`: your Apple Team ID

Get signing identity from your Mac:

```bash
security find-identity -v -p codesigning
```

## 2) Cut a Release

1. Bump version in:
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`
2. Commit and push.
3. Create and push tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

4. Wait for the release workflow to finish.
5. Open GitHub Releases and publish the generated draft.

This is the primary release path. Artifacts are built on GitHub-hosted runners, not on your local machine.

## 3) Verify Artifacts

- Confirm each target artifact was uploaded (macOS, Linux, Windows).
- Confirm signature artifacts are present for updater assets.
- Smoke test one downloaded package before announcing the release.

## macOS User Experience

- Without Apple signing/notarization, macOS users can still run the app but will see Gatekeeper warnings and may need manual allow/open steps.
- With Apple signing + notarization configured, installs and first launch are much smoother for end users.
- Current workflow is configured to release without Apple notarization so builds stay reliable.

## Local Signed Build (macOS/Linux)

Use key content (not file path) in the environment:

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/dockbricks.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
npm run tauri:build
```
