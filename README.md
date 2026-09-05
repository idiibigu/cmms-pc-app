# EEIS Desktop (cmms-pc-app)

Electron shell around the existing EEIS CMMS web app (the main `cmms eeis` project — this repo is intentionally separate from that project's manual-deploy workflow).

**Status**: scaffold only. Nothing functional is built yet.

## Plan

The full phased plan (why Electron-wrapping instead of a native rewrite, and the Phase 1–4 breakdown: login/shell → OS integration → packaging/auto-update → native polish if ever needed) lives in `.claude/skills/eeis-desktop-app/SKILL.md` in the main `cmms eeis` project repo. Read that before continuing this project.

## Dev

```
npm install
npm start
```
