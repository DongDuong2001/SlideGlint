# SlideGlint

SlideGlint is a desktop presentation editor for building slide decks in Markdown.

## Features

- Markdown slide editor with a live rendered preview
- Slides separated by `---`
- Starter, blank, agenda, code demo, and project update templates
- Modern Serif, Dark Pro, and RMIT Blue themes
- Slide outline with drag-and-drop reordering
- Slide coach tips and current-slide copy polishing
- Local image import, drag and drop, and clipboard paste
- Presenter window with speaker notes, timer, and display selection
- PDF export
- Recent files and draft recovery
- Focused preview mode
- Keyboard shortcuts for open, save, navigation, and editing

## Stack

- Electron main and preload processes in TypeScript
- React 19 renderer with Vite
- `react-markdown` for slide rendering

## Development

Install dependencies and start the renderer plus Electron:

```bash
npm install
npm run dev
```

The renderer is also usable in browser mode, but desktop file, image, presenter, and PDF APIs
require Electron.

## Quality Checks

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Run the complete local CI sequence with:

```bash
npm run ci
```

Use `npm run format` to apply Prettier formatting.

## Build And Package

Create production bundles:

```bash
npm run build
```

Build a Windows x64 installer:

```bash
npm run package:win
```

Installer output is written to `release/`.

## Release Automation

- `.github/workflows/ci.yml` runs checks on pushes and pull requests.
- `.github/workflows/windows-exe-release.yml` publishes automatic prereleases after pushes to
  `main`, and stable Windows installers for `v*` tags or an explicit manual dispatch.
