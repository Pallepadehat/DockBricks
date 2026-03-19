# Architecture

DockBricks uses a lightweight feature-oriented frontend structure:

- `src/types`: shared domain models (`Category`, `Database`, service enums).
- `src/lib`: pure utility functions and Tauri command wrappers.
- `src/hooks`: stateful side-effect orchestration (Docker health/runtime polling).
- `src/components`: UI building blocks and dialogs.
- `src/App.tsx`: app composition/orchestration layer.

## Core Design Principles

- Keep business rules in hooks/utilities, not inside UI components.
- Keep Tauri command usage behind typed wrappers in `src/lib/tauri-commands.ts`.
- Prefer explicit, typed interfaces for dialog/components props.
- Keep data persistence and runtime state independent.

## Runtime State Model

Docker runtime state is tracked per database by ID with:

- `exists`
- `running`
- `loading`
- `error`

This allows async state transitions without coupling UI rendering to Docker command internals.
