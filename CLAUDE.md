# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Blue Archive Info — React 19 + TypeScript web app providing character info, guides, tools (Eligma/crafting calculators), and admin CMS for the Korean game "Blue Archive". Backend powered by Supabase (Auth, DB, Storage).

## Tech Stack

- **React 19** with TypeScript 5.7 (strict mode, target ES2020)
- **Vite 6.2** (build tool, dev server)
- **React Router 7.6** (SPA routing)
- **Tailwind CSS 4.1** via `@tailwindcss/vite` plugin (no separate tailwind.config)
- **Zustand 5.0** (state management)
- **Supabase** (Auth, PostgreSQL DB via PostgREST, Storage)
- **Tiptap** (rich text editor for guide authoring)
- **dnd-kit** (drag-and-drop for category ordering)
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
- `service/{feature}/pages/` — Page components per feature domain (home, student, guide, calculator, auth, admin)
- `service/{feature}/components/` — Feature-specific components (GuideCard, RichTextEditor, StudentCard)
- `components/` — Shared components (Header, Sidebar, MainLayout, AdminRoute guard)
- `repositories/` — Data access layer (Supabase for dynamic data, static JSON for game data)
- `types/` — Domain types with barrel exports via `index.ts`
- `utils/` — Utility functions (`AppError` is active; `api.ts`, `format.ts` are stubs)
- `data/` — Static JSON files (character, crafting data; weapon JSONs are empty stubs)
- `stores/` — Zustand stores (`authStore` is active)
- `lib/supabase.ts` — Supabase client initialization
- `styles/` — `global.css` (Tailwind imports), `editor.css` (Tiptap styles)

### Routes

| Path | Page | Guard |
|------|------|-------|
| `/` | HomePage | — |
| `/students` | StudentListPage | — |
| `/guide` | GuideListPage | — |
| `/guide/new` | GuideFormPage (lazy) | EditorRoute |
| `/guide/:id` | GuideDetailPage | — |
| `/guide/:id/edit` | GuideFormPage (lazy) | EditorRoute |
| `/calculator/eligma` | EligmaCalcPage | — |
| `/calculator/crafting` | CraftingCalcPage | — |
| `/login` | LoginPage | — |
| `/signup` | SignUpPage | — |
| `/mypage` | MyPage | — |
| `/admin/users` | UserManagePage | AdminRoute |
| `/admin/categories` | CategoryManagePage | AdminRoute |
| `/admin/guide-logs/:id` | GuideLogPage | AdminRoute |
| `/admin/deleted-guides` | DeletedGuidesPage | AdminRoute |
| `/admin/notices` | InternalNoticePage | EditorRoute |
| `/admin/internal-categories` | InternalCategoryManagePage | AdminRoute |

### Role-based access

4 roles: `admin`, `editor`, `user`, `pending`
- **AdminRoute** — admin only
- **EditorRoute** — admin + editor

### Data flow

- **Dynamic data** (guides, users, categories): Pages → Repositories → **Supabase** (PostgREST + JS SDK)
- **Static game data** (characters, crafting): Pages → Repositories → Static JSON (`src/data/`)
- Guide content is **Base64 encoded** before storage, decoded on read
- Images stored in **Supabase Storage** (`guide-images` bucket)
- Deletes are **soft delete** (`deleted_at` column)
- Guide edits tracked via `guide_logs` table

### Repositories

| Repository | Backend | Purpose |
|------------|---------|---------|
| `authRepository` | Supabase | Auth, user profiles, role management |
| `guideRepository` | Supabase (SDK + REST) | Guide CRUD, image upload, audit logs |
| `categoryRepository` | Supabase | Guide categories |
| `internalCategoryRepository` | Supabase | Internal notice categories |
| `studentRepository` | Static JSON | Character data from `character.json` |
| `craftingRepository` | Static JSON | Crafting data from `crafting/*.json` |

### Styling

100% Tailwind CSS utility classes. Dark mode supported (`dark:` variants). Mobile-first responsive design. Tiptap editor has dedicated styles in `styles/editor.css`.

### Type system

- `types/auth.ts` — UserRole, AuthUser, UserProfile
- `types/student.ts` — Student, StudentDetail, StudentStats, StudentSkill, etc.
- `types/guide.ts` — Category, Guide, GuideLog, GuideFormData
- `types/crafting.ts` — CraftingNode, CraftingItem
- `types/common.ts` — ApiResponse, AsyncState, RoutePath
- Custom `AppError` class with error codes in `utils/AppError.ts`

### Environment variables

```
VITE_SUPABASE_URL=       # Supabase project URL
VITE_SUPABASE_ANON_KEY=  # Supabase anon/public key
```

## UI Language

All UI text is hardcoded in Korean (한국어). HTML lang is `ko`.
