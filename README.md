# SlideGlint

The Developer's Presentation Engine.

## Stack

- Electron main process (TypeScript)
- React renderer with Vite (TypeScript)
- react-markdown for markdown rendering

## What is included

- Vite + React + TypeScript renderer scaffold
- Electron main and preload processes
- IPC bridge for local file operations:
  - open markdown with native file picker
  - read file
  - save file (supports save-as flow)
- Two-pane layout:
  - left side markdown textarea
  - right side live markdown preview (100ms debounce)
- Keyboard shortcuts:
  - Ctrl/Cmd + O: open file
  - Ctrl/Cmd + S: save file

## Run locally

1. Install dependencies:

   npm install

2. Start app in development mode:

   npm run dev

This starts Vite for the renderer and launches Electron once the renderer is ready.

## Build

1. Create production bundles:

   npm run build

2. Launch Electron from compiled output:

   npm run start

## Package Windows EXE

1. Build and package a Windows installer:

   npm run package:win

2. Output files are written to the `release/` folder.

## GitHub Release Automation

- Workflow file: `.github/workflows/windows-exe-release.yml`
- Trigger: every push and every tag push.
- Behavior:
  - Branch pushes create an auto-tagged prerelease and upload the generated `.exe`.
  - Tag pushes publish a release for that tag with the generated `.exe`.
