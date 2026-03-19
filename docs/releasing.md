# Releasing DockBricks

## CI and Release Workflows

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`

Release builds run when you push a tag like `v0.2.0` or trigger manually.

## Signing Setup

Add these repository secrets to enable signed artifacts in GitHub Actions:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

For macOS signing/notarization add:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

## Create a Release

1. Update version in `package.json` and `src-tauri/Cargo.toml`.
2. Commit and push changes.
3. Create and push a tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

4. GitHub release workflow will build artifacts and create a draft release.
5. Review draft release notes and publish.
