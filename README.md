# DockBricks

DockBricks is a desktop app for creating and managing local Docker-backed databases with a clean UI.

## Stack

- Tauri (Rust backend)
- React + TypeScript + Vite (frontend)
- shadcn/ui + Tailwind CSS

## Quick Start

```bash
npm install
npm run tauri dev
```

## Scripts

- `npm run dev`: frontend only
- `npm run build`: TypeScript + production frontend build
- `npm run tauri dev`: run full desktop app

## Project Structure

- `src/types`: shared domain models
- `src/lib`: pure helpers + Tauri command wrappers
- `src/hooks`: stateful side effects and orchestration
- `src/components`: reusable UI components/dialogs
- `src/App.tsx`: app composition layer

## Documentation

- Contribution guide: [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- Architecture notes: [`docs-architecture.md`](./docs-architecture.md)
