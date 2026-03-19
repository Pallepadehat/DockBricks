# DockBricks

DockBricks is a desktop app for creating and managing local container-backed databases with a clean UI.
It supports both Docker and Podman with first-run engine selection.

## Stack

- Tauri (Rust backend)
- React + TypeScript + Vite (frontend)
- shadcn/ui + Tailwind CSS

## Quick Start

```bash
npm install
npm run tauri dev
```

On first launch, DockBricks asks whether to use Docker or Podman.

## Features

- Create local database containers (MariaDB, MySQL, PostgreSQL, Redis)
- Right-click context actions (copy connection string, edit, delete)
- Start/stop controls per database
- Engine support for Docker and Podman
- Engine settings dialog for switching runtime
- Persistent local state for categories/databases/runtime selection

## Scripts

- `npm run dev`: frontend only
- `npm run build`: TypeScript + production frontend build
- `npm run tauri dev`: run full desktop app
- `npm run tauri build`: create desktop production bundles

## Project Structure

- `src/types`: shared domain models
- `src/lib`: pure helpers + Tauri command wrappers
- `src/hooks`: stateful side effects and orchestration
- `src/components`: reusable UI components/dialogs
- `src/App.tsx`: app composition layer

## Development

```bash
npm install
npm run build
cd src-tauri && cargo check
```

## GitHub Workflows

- CI checks on push/PR: `.github/workflows/ci.yml`
- Cross-platform release builds: `.github/workflows/release.yml`

Release workflow supports signing via repository secrets (see docs below).

## Documentation

- Contribution guide: [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- Architecture notes: [`docs-architecture.md`](./docs-architecture.md)
- Release and signing guide: [`docs/releasing.md`](./docs/releasing.md)

## License

[MIT](./LICENSE)
