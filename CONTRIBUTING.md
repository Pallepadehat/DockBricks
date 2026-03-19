# Contributing

Thanks for contributing to DockBricks.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Run the app:

```bash
npm run tauri:dev
```

## Project Conventions

- Keep domain types in `src/types`.
- Keep pure helpers in `src/lib`.
- Keep side effects and polling logic in `src/hooks`.
- Keep presentational UI in `src/components`.
- Prefer small, composable components over monolith files.
- Prefer shadcn/ui primitives instead of ad-hoc custom widgets.

## Validation Before PR

```bash
npm run build
cd src-tauri && cargo fmt --all --check && cargo clippy --all-targets && cargo check
```

## PR Expectations

- Explain what changed and why.
- Include screenshots or short recordings for UI changes.
- Keep refactors behavior-safe and incremental.
- Mention manual test notes (engine used, create/start/stop/delete verified).
