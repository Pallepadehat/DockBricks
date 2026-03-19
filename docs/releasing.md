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

- `TAURI_SIGNING_PRIVATE_KEY`: contents of the private key file
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: password used during key generation

### macOS signing / notarization (optional but recommended for distribution)

Add:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

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

## 3) Verify Artifacts

- Confirm each target artifact was uploaded (macOS, Linux, Windows).
- Confirm signature artifacts are present for updater assets.
- Smoke test one downloaded package before announcing the release.
