# Releasing DockBricks

DockBricks uses GitHub Actions + `tauri-apps/tauri-action` for cross-platform releases.

## Workflows

- CI checks: `.github/workflows/ci.yml`
- Release pipeline: `.github/workflows/release.yml`

Release workflow runs on:

- tag push matching `v*` (for example `v0.2.0`)
- manual `workflow_dispatch`

## 1) Configure Signing Secrets

### macOS signing / notarization

The release workflow passes Apple signing/notarization secrets through to Tauri on the macOS runner.

Required for Developer ID signing:

- `APPLE_CERTIFICATE`: base64-encoded Developer ID Application `.p12` export
- `APPLE_CERTIFICATE_PASSWORD`: the `.p12` export password
- `APPLE_SIGNING_IDENTITY`: exact identity string, e.g. `Developer ID Application: Your Name (TEAMID)`
- `KEYCHAIN_PASSWORD`: arbitrary temporary CI keychain password used by the macOS runner

Required for notarization, choose one credential style:

**App Store Connect API key (recommended)**

- `APPLE_API_ISSUER`: Issuer ID from App Store Connect > Users and Access > Integrations
- `APPLE_API_KEY`: Key ID
- `APPLE_API_KEY_P8`: contents of the downloaded private key file (`AuthKey_XXXXXXXXXX.p8`)

**Apple ID app-specific password**

- `APPLE_ID`: your Apple ID email
- `APPLE_PASSWORD`: Apple app-specific password, not your normal Apple ID password
- `APPLE_TEAM_ID`: your Apple Team ID

`APPLE_CERTIFICATE` must be the base64-encoded content of a valid Developer ID Application `.p12` certificate export:

```bash
openssl base64 -A -in dockbricks-dev-id.p12 -out certificate-base64.txt
pbcopy < certificate-base64.txt
```

Use that copied value as the `APPLE_CERTIFICATE` secret.

### Full Apple Setup (paid Developer account)

1. Create a Developer ID Application certificate in Apple Developer portal.
2. Download and install it in Keychain Access.
3. Export that certificate from Keychain as `.p12` with a password.
4. Base64 encode the `.p12` with the command above.
5. Add the GitHub Actions secrets listed above.

Get signing identity from your Mac:

```bash
security find-identity -v -p codesigning
```

## 2) Validate Locally

Run the same checks CI runs:

```bash
npm run typecheck
npm run build
npm run test:rust
npm run check:rust
```

## 3) Cut a Release

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

## 4) Verify Artifacts

- Confirm each target artifact was uploaded (macOS, Linux, Windows).
- Confirm package names, versions, and checksums look correct.
- Smoke test one downloaded package before announcing the release.

## macOS User Experience

- Without Apple signing/notarization, macOS users can still run the app but will see Gatekeeper warnings and may need manual allow/open steps.
- With Apple signing + notarization configured, installs and first launch are much smoother for end users.
- The release workflow signs and notarizes macOS artifacts when the Apple secrets above are configured. If `APPLE_CERTIFICATE` is missing, it emits a warning and builds unsigned macOS artifacts.

## Local Build

```bash
npm run tauri:build
```

Local release builds are useful for smoke testing. Publishing should happen through the GitHub release workflow so each platform is built on its native runner.
