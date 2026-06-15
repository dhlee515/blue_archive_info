# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Blue Archive Info — React 19 + TypeScript app for the Korean game "Blue Archive". Provides character info (SchaleDB-backed), guides, calculators (Eligma / crafting / event), a cultivation planner with material deficit reporting, and an admin CMS. Ships as both a web SPA (Vercel) and a Tauri 2 desktop app with auto-update + native OCR for inventory import. Dynamic data lives in Supabase (Auth, Postgres via PostgREST, Storage).

## Tech Stack

- **React 19** with TypeScript 5.7 (strict mode, target ES2020)
- **Vite 6.2** (build tool, dev server)
- **React Router 7.6** (SPA routing)
- **Tailwind CSS 4.1** via `@tailwindcss/vite` plugin (no separate tailwind.config)
- **Zustand 5.0** (state management — currently only `authStore`)
- **Supabase** (Auth, PostgreSQL DB via PostgREST, Storage)
- **SchaleDB** (remote JSON for students/equipment/items, cached in localStorage with TTL + stale-while-error)
- **Tiptap 3** (rich text editor for guide authoring)
- **dnd-kit** (drag-and-drop for category ordering)
- **Tauri 2** (desktop wrapper) with plugins: `updater`, `store`, `dialog`, `process`. OCR via spawned Python (PaddleOCR).
- **Package manager**: npm

## Commands

```bash
npm run dev          # Vite dev server on http://localhost:5173
npm run build        # tsc + vite build → dist/
npm run preview      # Preview production build
npm run type-check   # tsc --noEmit
npm run tauri:dev    # Tauri desktop in dev (spawns Vite via beforeDevCommand)
npm run tauri:build  # Tauri desktop production build + updater artifacts
```

## Architecture

All source code lives under `my-site/src/`.

**Path alias**: `@/` → `src/` (configured in both tsconfig.json and vite.config.ts)

### Key directories

- `router/index.tsx` — Route definitions (all wrapped in `MainLayout`)
- `service/{feature}/pages/` — Page components per feature domain (home, student, guide, calculator, planner, reroll, secretNote, auth, admin)
- `service/{feature}/components/` — Feature-specific components
- `service/calculator/events/` — Event calculator plugin system: `archetypes/{id}/` (Form + pure calc) registered in `archetypes/index.ts`
- `service/secretNote/plugins/` — Note-type plugin system: `{type}/` (Editor + Viewer + serialize) registered in `plugins/registry.ts`
- `service/planner/utils/` — Pure calculation utilities (`cultivationCalculator.ts` ~500 lines), static cost tables under `utils/tables/`, dual-backend factory (`plannerRepoFactory.ts`), backup/restore, OCR matching helpers
- `components/` — Shared: `Header/`, `layouts/MainLayout`, `navigation/Sidebar`, `guards/AdminRoute` (3 guards in one file)
- `repositories/` — Data access layer (Supabase / SchaleDB remote / static JSON / localStorage — see Repositories table)
- `types/` — Domain types (per-module imports, no barrel)
- `utils/` — Utility functions (`AppError`, `format.ts`)
- `data/` — Static JSON: `crafting/` (3-stage recipes), `planner/` (exp/skill/potential/weapon cost tables), `events/` (per-event configs, glob-loaded by `eventRepository`), `reroll.{kr,jp}.json`, `weapon_star.json`, `studentAliases.json`
- `stores/` — Zustand stores (`authStore` is the only one)
- `lib/` — Infrastructure: `supabase.ts` (client), `schaledb.ts`+`schaledbCache.ts`+`schaledbImage.ts` (remote fetch + TTL cache + stale-while-error), `kvstore.ts` (`WebKVStore` ↔ `TauriKVStore`), `runtime.ts` (`isTauri()`), `sync.ts` (planner local↔cloud), `updater.ts` (Tauri auto-update), `ocrMatching.ts` (Korean-aware fuzzy matching)
- `styles/` — `global.css` (Tailwind imports), `editor.css` (Tiptap styles)

### Routes

| Path | Page | Guard |
|------|------|-------|
| `/` | HomePage | — |
| `/students` | StudentListPage | — |
| `/students/:id` | StudentDetailPage | — |
| `/guide` | GuideListPage | — |
| `/guide/new` | GuideFormPage (lazy) | EditorRoute |
| `/guide/:id` | GuideDetailPage | — (in-component check redirects internal notices for non-editors) |
| `/guide/:id/edit` | GuideFormPage (lazy) | EditorRoute |
| `/reroll` | RerollPage | — |
| `/calculator/eligma` | EligmaCalcPage | — |
| `/calculator/crafting` | CraftingCalcPage | — |
| `/calculator/event` | EventCalcHubPage | — |
| `/calculator/event/:eventId` | EventCalcDetailPage | — |
| `/planner/cultivation` | CultivationPlannerPage | — (works for anon via localStorage) |
| `/planner/cultivation/:plannerStudentId` | PlannerStudentDetailPage | — |
| `/planner/inventory` | InventoryPage | — (works for anon via localStorage) |
| `/login` | LoginPage | — (honors `?redirect=<path>` after login) |
| `/signup` | SignUpPage | — |
| `/mypage` | MyPage | — |
| `/admin/users` | UserManagePage | AdminRoute |
| `/admin/categories` | CategoryManagePage | AdminRoute |
| `/admin/guide-logs/:id` | GuideLogPage | AdminRoute |
| `/admin/deleted-guides` | DeletedGuidesPage | AdminRoute |
| `/admin/notices` | InternalNoticePage | EditorRoute |
| `/admin/internal-categories` | InternalCategoryManagePage | AdminRoute |
| `/n/:slug` | SecretNoteViewPage | — |
| `/admin/notes` | SecretNoteManagePage | AdminRoute |
| `/admin/notes/new` | SecretNoteFormPage | AdminRoute |
| `/admin/notes/:id/edit` | SecretNoteFormPage | AdminRoute |
| `/admin/deleted-notes` | DeletedNotesPage | AdminRoute |

### Role-based access

4 roles: `admin`, `editor`, `user`, `pending`
- **AdminRoute** — admin only
- **EditorRoute** — admin + editor
- **AuthRoute** — any logged-in user (excludes `pending`)

### Data flow

- **Dynamic user data** (guides, profiles, categories, secret notes, planner): Pages → Repositories → **Supabase** (PostgREST + JS SDK; planner uses RLS `user_id = auth.uid()`)
- **Game data** (students, equipment, items, skills): Pages → `SchaleDBStudentRepository` / direct `fetchSchaleDB` → **SchaleDB JSON** (cached in localStorage with TTL + stale-while-error; LRU evict on `QuotaExceededError`). `studentRepository` is now a thin facade over the SchaleDB version — `src/data/character.json` and `weapon.json` are legacy.
- **Event configs**: `import.meta.glob('@/data/events/*.json', { eager: true })` — drop a JSON in, it's auto-listed.
- **Cultivation planner — dual backend**: `plannerRepoFactory.getPlannerRepo(userId)` returns Supabase impl when logged in, `LocalPlannerRepository` (kvstore → localStorage in web / `@tauri-apps/plugin-store` JSON file in desktop) when anon. Same interface either way. Switching identities does NOT auto-merge; `lib/sync.ts` exposes explicit `pullFromCloud` / `pushToCloud` (last-write-wins) via `SyncDialog`.
- Guide content is **Base64 encoded** before storage, decoded on read (same pattern for `secret_notes`)
- Images stored in **Supabase Storage** (`guide-images` bucket; shared by guides and secret notes)
- Deletes are **soft delete** (`deleted_at` column)
- Guide edits tracked via `guide_logs` table
- `secret_notes` uses a 12-char random slug (DB trigger) and is only reachable via `/n/:slug`; anon access goes through a `SECURITY DEFINER` RPC so the table itself stays admin-only
- `secret_notes` supports pluggable content types via `note_type` column (`'free' | 'rules'`). `free` stores Base64 HTML in `content`; `rules` stores a structured JSON in `structured_data`. Each type is encapsulated as a plugin under `service/secretNote/plugins/{type}/` (Editor + Viewer + serialize/deserialize). Adding a new type = create plugin file + one line in `plugins/registry.ts`
- The same **plugin/registry pattern** is reused by event calculators under `service/calculator/events/archetypes/` — register `{label, Form}` in `archetypes/index.ts` keyed by `EventArchetypeId` (`'point-accumulation' | 'material-exchange' | 'card-matching'`).

### Repositories

| Repository | Backend | Purpose |
|------------|---------|---------|
| `authRepository` | Supabase | Auth, user profiles, role management |
| `guideRepository` | Supabase (SDK + REST) | Guide CRUD, image upload, audit logs |
| `categoryRepository` | Supabase | Guide categories |
| `internalCategoryRepository` | Supabase | Internal notice categories |
| `secretNoteRepository` | Supabase (SDK + RPC) | Admin-only notes with public slug-based URL (`/n/:slug`). Anon 열람은 `get_secret_note_by_slug` RPC 만 노출 |
| `plannerRepository` | Supabase | Cloud cultivation planner: `planner_students` (1:N) + `planner_inventory` (1:1 jsonb). RLS `user_id = auth.uid()` |
| `localPlannerRepository` | kvstore (localStorage / Tauri store) | Anonymous fallback for the cultivation planner. Same interface as `plannerRepository`, paired via `plannerRepoFactory` |
| `schaledbStudentRepository` | SchaleDB (remote JSON, cached) | All student/skill data. Translates SchaleDB shape → project types and resolves `<?n>` / `<b:Stat>` skill description tags into Korean |
| `studentRepository` | (facade) | 14-line wrapper that delegates to `SchaleDBStudentRepository` |
| `eventRepository` | Static JSON via `import.meta.glob` | Loads all `src/data/events/*.json` eagerly; filters by start/end date |
| `craftingRepository` | Static JSON | Crafting data from `crafting/*.json` |

### Styling

100% Tailwind CSS utility classes. Dark mode supported (`dark:` variants). Mobile-first responsive design. Tiptap editor has dedicated styles in `styles/editor.css`.

### Type system

- `types/auth.ts` — UserRole, AuthUser, UserProfile
- `types/student.ts` — Student, StudentDetail, StudentStats, StudentSkill, etc.
- `types/schaledb.ts` — Raw SchaleDB shapes (`SchaleDBStudent`, `SchaleDBEquipment`, `SchaleDBItem`, `SchaleDBSkill`, …) — only used inside repositories
- `types/guide.ts` — Category, Guide, GuideLog, GuideFormData
- `types/secretNote.ts` — SecretNote, SecretNoteFormData, NoteType, RulesData, RuleSection, RuleItem, RuleBanner, RuleColor, RuleIcon
- `types/event.ts` — EventArchetypeId, EventConfig (discriminated union: PointEventConfig / ExchangeEventConfig / CardMatchingConfig)
- `types/planner.ts` — PlannerStudent + PlannerTargets (level/gear/weapon/weaponStar/equipment/skills/potentials/bond), BondRange, InventoryMap, RequiredMaterials, DeficitReport
- `types/reroll.ts` — RerollCategory, RerollStudent
- `types/crafting.ts` — CraftingNode, CraftingItem
- Per-module imports (e.g. `from '@/types/planner'`) — no barrel
- Custom `AppError` class with error codes in `utils/AppError.ts`

### Environment variables

```
VITE_SUPABASE_URL=       # Supabase project URL
VITE_SUPABASE_ANON_KEY=  # Supabase anon/public key
```

## Desktop app (Tauri)

`my-site/src-tauri/` is a Tauri 2 wrapper around the same SPA.

- **Entry**: `src/lib.rs` registers `tauri_plugin_store`, `tauri_plugin_dialog`, `tauri_plugin_process`. On desktop it also registers `tauri_plugin_updater` (gated by `#[cfg(desktop)]` so mobile builds compile).
- **Auto-update**: `lib/updater.ts` calls `check()` from `@tauri-apps/plugin-updater`; if an update exists, the header shows `UpdateBadge` and the user confirms before `downloadAndInstall()` + `relaunch()`. Update endpoint and minisign pubkey are pinned in `tauri.conf.json` → `plugins.updater` (GitHub Releases `latest.json`).
- **Storage parity**: `kvstore.ts` exposes one interface for KV reads/writes; the web build uses `localStorage`, the Tauri build uses `@tauri-apps/plugin-store` (single `app.json` on disk). `LocalPlannerRepository` is environment-agnostic because it goes through `kvstore`.
- **OCR inventory import**: `OcrImportDialog` lets the user pick screenshots, then invokes the Rust `ocr_import` command (`src-tauri/src/ocr.rs`). That command spawns a Python process running `tools/ocr/extract_inventory.py` (PaddleOCR). It prefers a local venv at `tools/ocr/venv/{bin,Scripts}/python` and falls back to system `python3`. Bundled Python resources are listed under `tauri.conf.json` → `bundle.resources`. OCR text-to-item matching happens in `lib/ocrMatching.ts` (English→Korean school aliases, jamo N-gram similarity, Levenshtein fallback).
- **CSP** allows Supabase, SchaleDB, YouTube embeds — defined in `tauri.conf.json` → `app.security.csp`.

## Cultivation planner notes

- The deficit report (`utils/cultivationCalculator.ts`, ~700 lines of pure functions) is the single source of "what materials are needed". It uses synthetic keys `credit` / `student_exp` / `weapon_exp` for resources that have no SchaleDB item id; the UI distinguishes those from numeric item ids when rendering. Cost tables are under `utils/tables/`.
- `inventoryCatalog.ts` builds the grouped inventory page from SchaleDB items (student reports, weapon parts, equipment stones, skill books/CDs, equipment blueprints, gear favor materials, artifacts, WB stones, per-student elephs).
- Planner state has dual storage; tests/dev should be aware that an anon session's data lives in localStorage (web) or Tauri store file (desktop) and is **not** synced automatically when the user logs in — they must trigger `SyncDialog` (push or pull).
- Backup/restore via `plannerBackup.ts` + `BackupButtons` produces a JSON file download usable across web ↔ desktop. `BACKUP_VERSION = 1` — adding optional fields to `PlannerTargets` is backward-compatible (no version bump needed).
- **Bond rank**: `PlannerTargets.bond` (1~100) + `aggregateAllWithBond()` produces gear+bond combined `required` + `breakdown: { gear, bond }` per item + per-student `bondPlans` (recommended gift counts, shortfall EXP). Gift matching follows SchaleDB `common.js` formula `ExpValue × min(matchingCount + 1, 4)` where `matchingCount = |item.Tags ∩ (student.FavorItemTags ∪ FavorItemUniqueTags ∪ config.CommonFavorItemTags)|`. Bond EXP curve (1~100 cumulative) is hard-copied to `data/planner/bond_exp.json` because SchaleDB doesn't host it; source documented in `tables/bondExp.ts`. **Costume students (FavorAlts) each have independent bond ranks** — no shared computation.

## UI Language

All UI text is hardcoded in Korean (한국어). HTML lang is `ko`.
