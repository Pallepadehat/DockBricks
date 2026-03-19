# Website Downloads

Use your own website for downloads, while artifacts stay hosted on GitHub Releases.

## Quick Setup

1. Keep releasing from `.github/workflows/release.yml`.
2. Add a download page on your website.
3. On that page, detect platform and redirect to:
   - `https://github.com/Pallepadehat/DockBricks/releases/latest/download/latest.json`

## Why this works

- Users download from your domain/page.
- Files are still served from stable GitHub release assets.
- In-app updater uses the same `latest.json` metadata.

## macOS note

Without Apple notarization, macOS users may need manual allow/open on first launch.
