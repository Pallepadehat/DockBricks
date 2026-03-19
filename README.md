# DockBricks

DockBricks is a desktop app for creating and managing local container-backed databases.
It supports both Docker and Podman with a clean, native-feeling Tauri UI.

## Highlights

- PostgreSQL, MySQL, MariaDB, and Redis presets
- Right-click context menu (copy connection string, edit, delete)
- Start/stop lifecycle control per database
- Docker and Podman engine support with onboarding + settings switcher
- Delete flow that removes both local record and container
- Manual runtime retry flow (no aggressive background polling)

## Tech Stack

- Tauri v2 (Rust backend)
- React + TypeScript + Vite
- Tailwind CSS + shadcn/ui

## Requirements

- Node.js 20+
- Rust stable toolchain
- One container engine:
  - Docker Desktop / Docker Engine, or
  - Podman 5+

For Podman on macOS/Windows, make sure the machine is initialized and running:

```bash
podman machine init
podman machine start
```

## Quick Start

```bash
npm install
npm run tauri:dev
```

On first launch, choose Docker or Podman in onboarding.

## Development Scripts

- `npm run dev`: frontend only (Vite)
- `npm run build`: TypeScript + production frontend bundle
- `npm run tauri:dev`: run desktop app in development
- `npm run tauri:build`: build desktop release artifacts locally

## Validation

```bash
npm run build
cd src-tauri && cargo fmt --all --check && cargo clippy --all-targets && cargo check
```

## Release and Signing

GitHub Actions builds all desktop targets on version tags (`v*`) and creates a draft release:

- CI: [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)
- Release: [`.github/workflows/release.yml`](./.github/workflows/release.yml)

Signed updater artifacts and platform signing are supported through repository secrets.
Setup steps are documented in [docs/releasing.md](./docs/releasing.md).

## Documentation

- [Contributing guide](./CONTRIBUTING.md)
- [Architecture notes](./docs-architecture.md)
- [Release guide](./docs/releasing.md)
- [Security policy](./SECURITY.md)
- [Code of conduct](./CODE_OF_CONDUCT.md)

## License

MIT, see [LICENSE](./LICENSE).
