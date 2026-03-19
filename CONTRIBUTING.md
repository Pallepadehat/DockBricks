# Contributing

Thanks for contributing to DockBricks.

## Development Setup

1. Install dependencies:

```bash
npm install
```

2. Run the frontend:

```bash
npm run dev
```

3. Run Tauri app:

```bash
npm run tauri dev
```

## Project Conventions

- Keep domain types in `src/types`.
- Keep pure helpers in `src/lib`.
- Keep side effects and polling logic in `src/hooks`.
- Keep presentational UI in `src/components`.
- Prefer small, composable components over monolith files.

## Validation Before PR

```bash
npm run build
cd src-tauri && cargo check
```

## PR Expectations

- Explain what changed and why.
- Include screenshots or short recordings for UI changes.
- Keep refactors behavior-safe and incremental.
