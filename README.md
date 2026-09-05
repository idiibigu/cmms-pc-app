# EEIS Desktop

Electron shell around the existing EEIS CMMS web app (see the main project at the repo root's `..` — this folder is intentionally its own git repository, separate from the web app's manual-deploy workflow).

**Status**: scaffold only. Nothing functional is built yet.

## Plan

The full phased plan (why Electron-wrapping instead of a native rewrite, and the Phase 1–4 breakdown: login/shell → OS integration → packaging/auto-update → native polish if ever needed) lives in `.claude/skills/eeis-desktop-app/SKILL.md` in the main project repo. Read that before continuing this project.

## Dev

```
cd desktop
npm install
npm start
```
