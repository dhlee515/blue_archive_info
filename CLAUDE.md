# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Blue Archive Info — React 19 + TypeScript web app providing character info, guides, and tools (Eligma calculator) for the Korean game "Blue Archive".

## Tech Stack

- **React 19** with TypeScript 5.7 (strict mode)
- **Vite 6.2** (build tool, dev server)
- **React Router 7.6** (SPA routing)
- **Tailwind CSS 4.1** via `@tailwindcss/vite` plugin (no separate tailwind.config)
- **Zustand 5.0** (state management, stores not yet created)
- **Package manager**: npm

## Commands

```bash
npm run dev          # Vite dev server on http://localhost:5173
npm run build        # tsc + vite build → dist/
npm run preview      # Preview production build
npm run type-check   # tsc --noEmit
```

## Architecture

All source code lives under `my-site/src/`.

**Path alias**: `@/` → `src/` (configured in both tsconfig.json and vite.config.ts)

### Key directories

- `router/index.tsx` — Route definitions (all wrapped in `MainLayout`)
- `service/{feature}/pages/` — Page components per feature domain (home, student, guide, calculator)
- `service/{feature}/components/` — Feature-specific reusable components
- `components/` — Shared components (Header, Sidebar, MainLayout)
- `repositories/` — Data access layer (reads from static JSON in `data/`)
- `types/` — Domain types with barrel exports via `index.ts`
- `utils/` — Utility functions (several are stubs throwing `AppError("Not implemented")`)
- `data/` — Static JSON files (character, weapon, crafting data)
- `stores/` — Zustand stores (empty, ready for use)

### Routes

| Path | Page | Status |
|------|------|--------|
| `/` | HomePage | Complete |
| `/students` | StudentListPage | Complete |
| `/guide/nub-info` | NubInfoPage | Stub |
| `/calculator/eligma` | EligmaCalcPage | Complete |

### Data flow

Pages → Repositories → Static JSON (`src/data/`). Repositories return typed data via async functions. Components use `useState`/`useEffect` for loading.

### Styling

100% Tailwind CSS utility classes. No CSS modules or styled-components. Mobile-first responsive design.

### Type system

- Domain types in `types/student.ts` (Student, StudentDetail, StudentStats, StudentSkill)
- Common types in `types/common.ts` (ApiResponse, AsyncState)
- Custom `AppError` class with error codes in `utils/AppError.ts`

## UI Language

All UI text is hardcoded in Korean (한국어). HTML lang is `ko`.
