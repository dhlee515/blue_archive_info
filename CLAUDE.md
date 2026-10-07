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
- `service/{feature}/pages/` — Page components per feature domain (home, student, guide, calculator, planner, reroll, secretNote, meetup, auth, admin)
- `service/{feature}/components/` — Feature-specific components
- `service/calculator/events/` — Event calculator plugin system: `archetypes/{id}/` (Form + pure calc) registered in `archetypes/index.ts`
- `service/calculator/utils/` — Pure helpers for calculator pages: `reportCalc.ts`, `bondCalc.ts` (bond rank calculator — reuses planner `bondGifts` / `tables/bondExp`)
- `service/secretNote/plugins/` — Note-type plugin system: `{type}/` (Editor + Viewer + serialize) registered in `plugins/registry.ts`
- `service/planner/utils/` — Pure calculation utilities (`cultivationCalculator/` — per-domain files behind an `index.ts` barrel), static cost tables under `utils/tables/`, dual-backend factory (`plannerRepoFactory.ts`), shared SchaleDB loader for planner pages (`plannerGameData.ts`), backup/restore, OCR matching helpers
- `components/` — Shared: `Header/`, `layouts/MainLayout`, `navigation/Sidebar`, `guards/AdminRoute` (3 guards in one file), `form/NumberInput` (all integer inputs — see Styling), `student/StudentPickerModal` (student search grid — planner add + bond calculator)
- `repositories/` — Data access layer (Supabase / SchaleDB remote / static JSON / localStorage — see Repositories table)
- `types/` — Domain types (per-module imports, no barrel)
- `utils/` — Utility functions (`AppError`, `format.ts`, `contentCodec.ts` (Base64 content), `roles.ts` (`isAdminRole` / `canEditRole`), `id.ts` (`newId()` — `crypto.randomUUID` with a fallback for non-secure contexts such as phone → LAN-IP dev server))
- `data/` — Static JSON: `crafting/` (3-stage recipes), `planner/` (exp/skill/potential/weapon cost tables), `events/` (per-event configs, glob-loaded by `eventRepository`), `reroll.{kr,jp}.json`, `weapon_star.json`, `studentAliases.json`
- `stores/` — Zustand stores (`authStore` is the only one; also exports `useIsAdmin()` / `useCanEdit()` boolean hooks)
- `lib/` — Infrastructure: `supabase.ts` (client), `supabaseRest.ts` (raw-fetch writes — see Data flow), `schaledb.ts`+`schaledbCache.ts`+`schaledbImage.ts` (remote fetch + TTL cache + stale-while-error; `SCHALEDB_REGION` = region array index `[Jp, Global, Cn]`, KR server = Global, `isReleasedInGlobal()`), `kvstore.ts` (`WebKVStore` ↔ `TauriKVStore`), `runtime.ts` (`isTauri()`), `sync.ts` (planner local↔cloud), `updater.ts` (Tauri auto-update), `ocrMatching.ts` (Korean-aware fuzzy matching)
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
| `/calculator/report` | ReportCalcPage | — |
| `/calculator/bond` | BondCalcPage | — (bond rank calculator, single student) |
| `/planner/cultivation` | CultivationPlannerPage | — (works for anon via localStorage) |
| `/planner/cultivation/:plannerStudentId` | PlannerStudentDetailPage | — |
| `/planner/inventory` | InventoryPage | — (works for anon via localStorage) |
| `/dev/label` | LabelPage | — (OCR 라벨링/진단 도구, 사이드바 미노출) |
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
| `/admin/meetups` | MeetupManagePage | AuthRoute (offline meetup ledgers — admin creates/edits all, editor reads all, a ledger's treasurer edits that ledger; RLS decides what each user sees) |
| `/admin/meetups/:id` | MeetupLedgerPage | AuthRoute (editable for admin + that ledger's treasurer, read-only otherwise) |
| `/m/:slug` | MeetupSettlementViewPage | — (public settlement snapshot, only when sharing is on) |

### Role-based access

4 roles: `admin`, `editor`, `user`, `pending`
- **AdminRoute** — admin only
- **EditorRoute** — admin + editor
- **AuthRoute** — any logged-in user (excludes `pending`)
- Role checks go through `utils/roles.ts` (guards, Sidebar) or `useIsAdmin()` / `useCanEdit()` (components) — avoid inline `role === '...'` comparisons

### Data flow

- **Dynamic user data** (guides, profiles, categories, secret notes, planner): Pages → Repositories → **Supabase** (PostgREST + JS SDK; planner uses RLS `user_id = auth.uid()`)
- **Game data** (students, equipment, items, skills): Pages → `SchaleDBStudentRepository` / direct `fetchSchaleDB` → **SchaleDB JSON** (cached in localStorage with TTL + stale-while-error; LRU evict on `QuotaExceededError`). `studentRepository` is now a thin facade over the SchaleDB version.
- **Event configs**: `import.meta.glob('@/data/events/*.json', { eager: true })` — drop a JSON in, it's auto-listed.
- **Cultivation planner — dual backend**: `plannerRepoFactory.getPlannerRepo(userId)` returns Supabase impl when logged in, `LocalPlannerRepository` (kvstore → localStorage in web / `@tauri-apps/plugin-store` JSON file in desktop) when anon. Same interface either way. Switching identities does NOT auto-merge; `lib/sync.ts` exposes explicit `pullFromCloud` / `pushToCloud` (last-write-wins) via `SyncDialog`.
- Guide content is **Base64 encoded** before storage, decoded on read (same pattern for `secret_notes`; shared codec in `utils/contentCodec.ts`)
- Images stored in **Supabase Storage** (`guide-images` bucket; shared by guides and secret notes) via `ImageRepository`
- **Raw REST writes (do not revert to SDK)**: guide insert/update and account updates (`updatePassword`) use `lib/supabaseRest.ts` (`restInsert` / `restUpdate` / `updateAuthUser`) instead of supabase-js. Calling the SDK inside an `onAuthStateChange` callback can deadlock supabase-js's internal auth lock and hang later SDK queries (af8ff4f).
- Deletes are **soft delete** (`deleted_at` column)
- Guide edits tracked via `guide_logs` table
- `secret_notes` uses a 12-char random slug (DB trigger) and is only reachable via `/n/:slug`; anon access goes through a `SECURITY DEFINER` RPC so the table itself stays admin-only
- `secret_notes` supports pluggable content types via `note_type` column (`'free' | 'rules'`). `free` stores Base64 HTML in `content`; `rules` stores a structured JSON in `structured_data`. Each type is encapsulated as a plugin under `service/secretNote/plugins/{type}/` (Editor + Viewer + serialize/deserialize). Adding a new type = create plugin file + one line in `plugins/registry.ts`
- `meetup_ledgers` (offline meetup accounting; RLS: admin all + editor SELECT + treasurer SELECT/UPDATE on rows where `auth.uid() = any(treasurer_user_ids)`; trigger `meetup_ledgers_guard_bu` blocks non-admins from changing treasurer_user_ids / deleted_at / created_by) stores the whole ledger as one jsonb `data` document (`MeetupLedgerData`, normalized on read); meetup period is two columns `meetup_date` (start) + `meetup_end_date` (null = one day, DB check end ≥ start). Model (data `version: 2`): each participant has `prepaid` (money handed to the treasurer beforehand, always credited back) and each expense is an "event" (e.g. 고기 1차) split evenly among attendees, stored as the list of **absent** participant ids (`expense.absent`) so a new event and a later-added participant default to attending. balance = prepaid + expenses paid personally − event shares; the treasury (prepaid − treasury-paid expenses) always settles to 0 — there are no fee tiers / fee-covered expenses / surplus-deficit modes any more. Attendance can be toggled from the expense card or the participant row (`toggleAbsent`); `expenseSharers` resolves who pays. The period is display-only. Older shapes (fee tiers + 선납, covers `fee` / `split` / `present` / `event`, attendance windows) are converted in `normalizeLedgerData(raw, period)` on read (paid fee → prepaid, fee-covered → everyone shares; the only place the period matters) and rewritten on the next save; public snapshots saved before that keep rendering via the optional legacy fields (`LegacyMeetupSummary`, `tierLabel` / `feePaid` / `attendLabel` / `date`). Participants are picked from site members (`MemberPickerModal` → `AuthRepository.getAllUsers()`, admin only): `userId` + nickname copied at add time (suffix ` (2)` on clashes); `userId` never goes into the public snapshot. Participants with `userId: null` are legacy free-text entries. Edit permission = `treasurer_user_ids` (several members, appointed by admin only — `updateLedger` sends it only when the admin passes `treasurerUserIds`); the settlement hub `data.treasurerId` (◉ 정산, receives transfers) must be one of them (`validateLedger(data, treasurerUserIds)`). Treasurers are always participants (appointing adds them; their rows can't be deleted until unassigned). Sidebar shows 모임 회계 to editors+ and to members who are treasurer of a live ledger (`MeetupRepository.hasTreasurerLedger`). Every save also writes `public_snapshot` (memo- and userId-free, built by `buildPublicSnapshot`; also carries per-person `shares` / `paidDirect`, per-expense `sharerCount` and hub-mode `completedTransfers` for the public page — all optional so older snapshots still render); anon reads only that via the `get_meetup_settlement_by_slug` RPC when `share_enabled`. Writes use an `updated_at` optimistic lock (0 rows → re-fetch → `CONFLICT` / `NOT_FOUND`). Settlement math is pure in `service/meetup/utils/meetupSettlement.ts` (integer won; invariant Σ balances + treasury = 0) — see `PLAN_meetup_ledger.md`. Slugs reuse `generate_short_slug()` from the secret_notes migration
- The same **plugin/registry pattern** is reused by event calculators under `service/calculator/events/archetypes/` — register `{label, Form}` in `archetypes/index.ts` keyed by `EventArchetypeId` (`'point-accumulation' | 'material-exchange' | 'card-matching'`).

### Repositories

| Repository | Backend | Purpose |
|------------|---------|---------|
| `authRepository` | Supabase | Auth, user profiles, role management |
| `guideRepository` | Supabase (SDK + REST) | Guide CRUD, audit logs. Writes go through `lib/supabaseRest.ts` |
| `imageRepository` | Supabase Storage | `guide-images` upload (JPG/PNG/GIF/WebP, ≤5MB → `VALIDATION` AppError) / delete. Used by guide thumbnails and all rich-text editors |
| `categoryRepository` | Supabase | Guide categories |
| `internalCategoryRepository` | Supabase | Internal notice categories |
| `secretNoteRepository` | Supabase (SDK + RPC) | Admin-only notes with public slug-based URL (`/n/:slug`). Anon 열람은 `get_secret_note_by_slug` RPC 만 노출 |
| `meetupRepository` | Supabase (SDK + RPC) | Meetup ledgers (admin write, editor read, per-ledger treasurer write) (`meetup_ledgers`) with optimistic locking, share toggle / slug regeneration (return new `updated_at`), soft delete. Public settlement via `get_meetup_settlement_by_slug` RPC (`/m/:slug`) |
| `plannerRepository` | Supabase | Cloud cultivation planner: `planner_students` (1:N) + `planner_inventory` (1:1 jsonb). RLS `user_id = auth.uid()` |
| `localPlannerRepository` | kvstore (localStorage / Tauri store) | Anonymous fallback for the cultivation planner. Same interface as `plannerRepository`, paired via `plannerRepoFactory` |
| `schaledbStudentRepository` | SchaleDB (remote JSON, cached) | All student/skill data. Translates SchaleDB shape → project types and resolves `<?n>` / `<b:Stat>` skill description tags into Korean |
| `studentRepository` | (facade) | 14-line wrapper that delegates to `SchaleDBStudentRepository` |
| `eventRepository` | Static JSON via `import.meta.glob` | Loads all `src/data/events/*.json` eagerly; filters by start/end date |
| `craftingRepository` | Static JSON | Crafting data from `crafting/*.json` |

### Styling

100% Tailwind CSS utility classes. Integer inputs use `components/form/NumberInput` (`type="text"` + `inputMode="numeric"`, select-all on focus, draft string while typing, range-clamped on blur) — don't add raw `type="number"` inputs. Dark mode supported (`dark:` variants). Mobile-first responsive design. Tiptap editor has dedicated styles in `styles/editor.css`.

### Type system

- `types/auth.ts` — UserRole, AuthUser, UserProfile
- `types/student.ts` — Student, StudentDetail, StudentStats, StudentSkill, etc.
- `types/schaledb.ts` — Raw SchaleDB shapes (`SchaleDBStudent`, `SchaleDBEquipment`, `SchaleDBItem`, `SchaleDBSkill`, …) — only used inside repositories
- `types/guide.ts` — Category, Guide, GuideLog, GuideFormData
- `types/secretNote.ts` — SecretNote, SecretNoteFormData, NoteType, RulesData, RuleSection, RuleItem, RuleBanner, RuleColor, RuleIcon
- `types/meetup.ts` — MeetupLedger, MeetupLedgerData (participants with `prepaid` / expenses with `absent` / transferMode), MeetupPublicSnapshot, `TREASURY` sentinel
- `types/event.ts` — EventArchetypeId, EventConfig (discriminated union: PointEventConfig / ExchangeEventConfig / CardMatchingConfig)
- `types/planner.ts` — PlannerStudent + PlannerTargets (level/gear/weapon/weaponStar/equipment/skills/potentials/bond), BondRange, InventoryMap, RequiredMaterials, DeficitReport
- `types/reroll.ts` — RerollCategory, RerollStudent
- `types/crafting.ts` — CraftingNode, CraftingItem
- Per-module imports (e.g. `from '@/types/planner'`) — no barrel
- Custom `AppError` class with error codes in `utils/AppError.ts` (`API_ERROR` / `NOT_FOUND` / `VALIDATION` / `UNAUTHORIZED` / `CONFLICT` / `UNKNOWN`). **Repositories throw only `AppError`** with a Korean message; the original Supabase / REST error is kept in `cause` for logging

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
- **OCR inventory import** (on hold since 2026-06-15, see `PROGRESS_ocr_visual_matching.md`): `OcrImportDialog` runs a **browser-side** pipeline (`lib/ocr/pipeline.ts`, lazy-loaded): grid/cell detection → icon extraction → multi-stage visual matching (color hist / pHash / HOG / DINOv2 embedding via `@huggingface/transformers`) → count OCR via `tesseract.js`. The matching index is fetched from `public/ocr/*.bin` (gitignored, built with `npm run build:ocr-index` — **not present in deployed builds**). `LabelPage` (`/dev/label`) is the labeling/diagnostic tool for this pipeline. Text-to-item name matching lives in `lib/ocrMatching.ts` (English→Korean school aliases, jamo N-gram similarity, Levenshtein fallback).
- **Legacy Python OCR**: the Rust `ocr_import` command (`src-tauri/src/ocr.rs`, spawns `tools/ocr/extract_inventory.py` with PaddleOCR; venv at `tools/ocr/venv/{bin,Scripts}/python`, falls back to `python3`) is still registered in `lib.rs` and bundled via `tauri.conf.json` → `bundle.resources`, but the frontend no longer invokes it.
- **CSP** allows Supabase, SchaleDB, YouTube embeds — defined in `tauri.conf.json` → `app.security.csp`.

## Cultivation planner notes

- The deficit report (`utils/cultivationCalculator/`, pure functions split by domain: `_shared` → `levelCost` / `gearWeapon` / `skills` / `potentials` / `bondGifts` → `aggregate`, re-exported via `index.ts`) is the single source of "what materials are needed". It uses synthetic keys `credit` / `student_exp` / `weapon_exp` for resources that have no SchaleDB item id; the UI distinguishes those from numeric item ids when rendering. Cost tables are under `utils/tables/`.
- `inventoryCatalog.ts` builds the grouped inventory page from SchaleDB items (student reports, weapon parts, equipment stones, skill books/CDs, equipment blueprints, gear favor materials, artifacts, WB stones, per-student elephs).
- Planner state has dual storage; tests/dev should be aware that an anon session's data lives in localStorage (web) or Tauri store file (desktop) and is **not** synced automatically when the user logs in — they must trigger `SyncDialog` (push or pull).
- Backup/restore via `plannerBackup.ts` + `BackupButtons` produces a JSON file download usable across web ↔ desktop. `BACKUP_VERSION = 1` — adding optional fields to `PlannerTargets` is backward-compatible (no version bump needed).
- **Bond rank**: `PlannerTargets.bond` (1~100) + `aggregateAllWithBond()` produces gear+bond combined `required` + `breakdown: { gear, bond }` per item + per-student `bondPlans` (recommended gift counts, shortfall EXP). Gift matching follows SchaleDB `common.js` formula `ExpValue × min(matchingCount + 1, 4)` where `matchingCount = |item.Tags ∩ (student.FavorItemTags ∪ FavorItemUniqueTags ∪ config.CommonFavorItemTags)|`. Bond EXP curve (1~100 cumulative) is hard-copied to `data/planner/bond_exp.json` because SchaleDB doesn't host it; source documented in `tables/bondExp.ts`. **Costume students (FavorAlts) each have independent bond ranks** — no shared computation.
- **Gift data (planner vs bond calculator)**: 52 `Favor` gifts; event-limited ones (5996~5999, bouquets / photo card) have `Craftable` / `Shop` / `StageDrop` all false. The gift selection box (100008, `ConsumeType: 'Choice'`, contents = SR 5000~5034) is detected by `getFavorChoiceBoxes()` and listed in the inventory catalog, but **only the bond calculator counts it** (box = student's best SR). The planner's bond recommendation still ignores the box, doesn't take in-rank progress EXP, and can pick limited bouquets — see `PLAN_bond_calculator.md` §7.

## UI Language

All UI text is hardcoded in Korean (한국어). HTML lang is `ko`.
