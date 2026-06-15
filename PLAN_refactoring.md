# 구조적 리팩토링 — 계획

> 작성일: 2026-06-15
>
> 프로젝트 전체 구조 분석 (Explore agent 2개 + 직접 검증) 결과에서 식별된
> 개선 거리. 우선순위 4단계로 정리.

## 1. 분석 범위

- 파일 사이즈 통계 (상위 25개) + service/* 비대칭
- Cross-cutting: dead code, 중복 패턴, barrel 일관성, 플러그인 패턴, types 사용 빈도
- 큰 파일 (300+ line) 분리 가능성
- lib/ocr 사용 범위 (잠정 중단 영역) 검증

## 2. 발견 사항 요약

### Dead code / stub
- `src/utils/api.ts` — `fetchData`/`postData` 모두 `throw NOT_IMPLEMENTED`. 외부 0 import.
- `src/utils/index.ts` — `@/utils` barrel 사용처 0개 (모두 직접 import).
- `src/data/character.json` (243 B) — 0 import. SchaleDB 로 대체.
- `src/data/weapon.json` (0 B, 빈 파일) — 0 import.
- `src/lib/ocr/templateMatch.ts` + `src/lib/ocr/cv.ts` — 서로(2개)만 import. OpenCV.js 의존 dead pair.

### 중복 패턴
- `src/service/admin/pages/CategoryManagePage.tsx` (288 line) ↔ `InternalCategoryManagePage.tsx` (288 line) — 거의 동일. repository, 제목, DB table 만 차이.
- `src/repositories/categoryRepository.ts` ↔ `internalCategoryRepository.ts` — 같은 패턴.

### 큰 파일
- `src/service/planner/utils/cultivationCalculator.ts` (697 line) — 6개 도메인 자연스러운 분리 가능.
- 나머지 (OcrImportDialog 611, CraftingCalcPage 501, LabelPage 504 등) — 이미 sub-component / 순수함수 분리되어 있고 응집도 높음. **분리 불필요**.

### Stub 표기 오류 (CLAUDE.md)
- CLAUDE.md "api.ts, format.ts are stubs" — `format.ts` 는 student/calculator 활발히 사용 중. `api.ts` 만 stub.

### 손대지 마
- `lib/ocr/*` 12개 file — pipeline.ts 진입점 사용 중 (OcrImportDialog, LabelPage). OCR 잠정 중단이라도 production 호출 경로.
- 600+ line 큰 컴포넌트들 — 응집도 높고 sub-component 이미 분리.
- Plugin registry 추상화 (calculator events vs secretNote plugins) — 두 곳만 사용, 추상화 비용 > 효과.

## 3. 우선순위

### 🟢 Tier 1 — 즉시 삭제 (위험 0, ~5분)

엄격한 검증 (2026-06-15) 완료: 모든 항목 외부 참조 0, side-effect 없음.

| 항목 | LOC | 검증 결과 |
|---|---|---|
| `src/utils/api.ts` | 26 | `fetchData`/`postData` stub, 외부 import 0 (`utils/index.ts` 만 re-export) |
| `src/utils/index.ts` | 5 | `@/utils` barrel 사용 0 (모두 `@/utils/format` 등 직접) |
| `src/types/index.ts` | ~11 | `@/types` barrel 사용 0 (모두 `@/types/{planner,guide,…}` 직접) |
| `src/types/common.ts` | 14 | `ApiResponse` (api.ts만 사용 → api 삭제 시 dead), `RoutePath`/`AsyncState` 사용 0 |
| `src/data/character.json` | 243 bytes | 0 import. 1 sample object, SchaleDB 로 대체된 legacy |
| `src/data/weapon.json` | 0 bytes (빈 파일) | 0 import |
| `src/lib/ocr/templateMatch.ts` | 75 | 외부 0, `cv.ts` 만 import (NCC 1:1 matching — 현 pipeline 미사용) |
| `src/lib/ocr/cv.ts` | 30 | 외부 0, `templateMatch.ts` 만 import (OpenCV.js loader) |
| **합계** | **~165 LOC + dead JSON 2** | |

**검증 명령 (재현 가능)**:
```bash
cd my-site
# api.ts
grep -rn "from.*'@/utils/api\|fetchData\b\|postData\b" src/ --include="*.ts" --include="*.tsx" \
  | grep -v "utils/api.ts\|utils/index.ts\|GuideListPage.tsx"  # 빈 결과 (GuideListPage 는 동명 로컬 함수)
# barrels
grep -rn "from '@/utils'\b\|from '@/types'\b" src/ --include="*.ts" --include="*.tsx"  # 빈 결과
# character/weapon.json — glob 검증
grep -rn "data/character.json\|data/weapon.json" src/ --include="*.ts" --include="*.tsx"  # 빈 결과
grep -rn "import.meta.glob.*data" src/                                                     # events/*.json 만
# templateMatch + cv
grep -rn "templateMatch\|getCv\b" src/ --include="*.ts" --include="*.tsx" | grep -v lib/ocr  # 빈 결과
# Tauri bundle 리소스
grep -E "character\.json|weapon\.json" src-tauri/tauri.conf.json  # 빈 결과
```

**부작용 점검**:
- Tauri bundle.resources (`src-tauri/tauri.conf.json`): `extract_inventory.py`, `remap.json`, `icon_hashes.json` 만 명시. character/weapon.json 없음.
- `public/` 폴더: `ocr/` subdir 만 (인덱스 binary), character/weapon.json 복사본 없음.
- `pipeline.ts:17` 의 `matchTemplate NCC` 는 주석 only (실제 import 아님). 삭제 안전.
- `types/index.ts` 의 모든 re-export (auth/event/guide/planner/…) — barrel 사용 0이므로 직접 import 패턴 정착 → 삭제 후 type-check 통과 예상.
- **`AppError.ts` 는 절대 삭제 X** — `plannerRepository`/`secretNoteRepository`/`localPlannerRepository`/`guideRepository` 에서 활발 사용 (10+ 호출). 단 `utils/index.ts` 의 `AppError` re-export 는 barrel 사용 0이라 같이 삭제 OK (외부는 모두 `from '@/utils/AppError'` 직접 import 패턴 정착).

**Dynamic import 영향 검증**:
- `OcrImportDialog.tsx:131` — `await import('@/lib/ocr/pipeline')` 동적 로드
- `LabelPage.tsx:81-82` — `await import('@/lib/ocr/pipeline')` + `await import('@/lib/ocr/indexLoader')`
- `pipeline.ts` 가 transitive 의존: `cellDetection`, `iconExtraction`, `indexLoader`, `multiStageMatch`, `countOcr` — **모두 production 사용**
- `templateMatch.ts` + `cv.ts` 는 어디서도 dynamic/static import 없음 → 삭제 안전

**작업 (1 commit)**: 8개 파일 삭제 + `npm run type-check`.

### 🟢 Tier 2 — CLAUDE.md 수정 (위험 0, ~3분)

```markdown
- `utils/` — Utility functions (`AppError` is active; `api.ts`, `format.ts` are stubs)
```
→
```markdown
- `utils/` — Utility functions (`AppError`, `format.ts` is active. `api.ts` 는 stub 으로 미사용)
```

또는 Tier 1 의 api.ts 삭제 후:
```markdown
- `utils/` — Utility functions (`AppError`, `format.ts`)
```

### 🟡 Tier 3 — cultivationCalculator 분리 (효과 큼, 위험 낮음, ~1-2시간)

**현 상태**: `src/service/planner/utils/cultivationCalculator.ts` 697 line. 20개 export
함수/타입 (export 목록 확인됨).

**외부 import 검증 (확인됨)**:
- `DeficitPanel.tsx` — `type { BondPlan, MaterialBreakdown }` (type only)
- `CultivationPlannerPage.tsx` — `{ aggregateAllWithBond, computeDeficit }`
- `PlannerStudentDetailPage.tsx` — `{ aggregateAllWithBond, computeDeficit }`
- **외부 사용 = 4개 export 만**. 나머지 16개는 내부 helper.

**분리안** (내부 helper 영역 분석 후 보강 — 7 files):
```
src/service/planner/utils/cultivationCalculator/
├── index.ts          # barrel — 외부 4개 항목 re-export
├── _shared.ts        # addTo, mergeInto, addMaterialRow (cross-domain helpers)
│                     # + EquipmentMap type (RequiredMaterials 는 types/planner.ts 에 이미 정의)
├── levelCost.ts      # calculateLevelCost
├── gearWeapon.ts     # calculateGearCost / calculateWeaponCost / calculateWeaponStarCost / calculateEquipmentCost
│                     # + private findEquipment / resolveRecipeRecursive (equipment 만 사용)
├── skills.ts         # calculateExSkillCost / calculateNormalSkillCost / calculateSkillsCost
├── potentials.ts     # calculatePotentialsCost + private calculatePotentialStatCost
├── bondGifts.ts      # calculateBondExp / favorMultiplier / BondMode / calculateBondGifts / getFavorItems
└── aggregate.ts      # aggregatePerStudent / aggregateAll / aggregateAllWithBond / computeDeficit
                      # + MaterialBreakdown / BondPlan / BondAwareAggregate types
```

**내부 의존 그래프 (검증 완료)**:
- `_shared.ts` 의 `addTo`/`mergeInto` — **모든 domain 이 사용** (level/gear/weapon/skill/equipment/potential/bond/aggregate)
- `addMaterialRow` — `skills.ts`, `gearWeapon.ts` (equipment) 사용
- `calculatePotentialStatCost` — `potentials.ts` 내부 (private)
- `findEquipment` / `resolveRecipeRecursive` — `gearWeapon.ts` 내부 (`calculateEquipmentCost` 재귀)
- `aggregate.ts` 는 모든 도메인 함수 import — **단방향**, 순환 없음
- domain 간 직접 호출 0건 (모두 aggregate 통해서만 합쳐짐)

**의존 방향 (단방향, 순환 없음)**:
```
types/planner (RequiredMaterials)  types/schaledb
   ↓                                  ↓
_shared.ts (addTo / mergeInto / addMaterialRow / EquipmentMap)
   ↓
levelCost / gearWeapon / skills / potentials / bondGifts  (각자 독립)
   ↓
aggregate (모든 domain import + 합산)
   ↑ index.ts (외부 4개 항목 re-export)
   ↑ 외부 3 files
```

**위험 — 낮음**:
- Import 경로: `@/service/planner/utils/cultivationCalculator` directory + `index.ts` 자동 해석 → 외부 import 3곳 그대로.
- 함수/타입 시그니처 무변경.
- `_shared.ts` 의 helper 들은 export 형태로 변환 (현재 private → public export 필요), 명명 규칙 `_shared.ts` 로 internal 표시.

**검증 절차**:
1. `npm run type-check` 통과 (gate)
2. `npm run build` 통과 (Vite tree-shake 확인)
3. Planner 페이지 수동 테스트:
   - `CultivationPlannerPage` 진입 → 학생 추가 → 목표 설정 → DeficitPanel 표시 동일
   - `PlannerStudentDetailPage` 진입 → bond/장비/스킬 목표 변경 → deficit 갱신 동일
4. 기존 backup JSON import → 결과 데이터 무변화 (선택)

### 🟡 Tier 4 — CategoryManagePage DRY (위험 낮음, ~1-2시간)

**현 상태 검증 결과 (diff 확인됨)**:
- `CategoryManagePage.tsx` ↔ `InternalCategoryManagePage.tsx` — **단 7 line 차이**
  - import 1줄 (Repository)
  - default function 이름 1줄
  - Repository 메소드 호출 5줄 (getCategories, reorder, createCategory, deleteCategory, updateName)
  - 제목 텍스트 1줄
- `categoryRepository.ts` ↔ `internalCategoryRepository.ts` — **시그니처 100% 동일**
  - 차이: class 이름, `.from('categories')` vs `.from('internal_categories')`, 일부 docstring 누락
  - 모든 public 메소드 시그니처 동일

**분리안**:
```
src/service/admin/components/CategoryManager.tsx   # 공통 컴포넌트 (~270 line)
src/service/admin/pages/CategoryManagePage.tsx     # ~10 line wrapper
src/service/admin/pages/InternalCategoryManagePage.tsx  # ~10 line wrapper
```

**Wrapper 예**:
```tsx
import { CategoryRepository } from '@/repositories/categoryRepository';
export default function CategoryManagePage() {
  return <CategoryManager repository={CategoryRepository} title="카테고리 관리" />;
}
```

**Repository 인터페이스** (공통):
```ts
interface CategoryRepoLike {
  getCategories(): Promise<Category[]>;
  createCategory(name: string): Promise<Category>;
  updateName(id: string, name: string): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  reorder(ids: string[]): Promise<void>;
}
```

**위험 — 낮음**:
- 두 페이지 diff 가 명확하게 7 line — UX 차이 없음 확인.
- Repository 시그니처 100% 일치 확인.
- 기존 라우트 경로 (`/admin/categories`, `/admin/internal-categories`) 유지 — wrapper 가 default export 그대로.

**검증 절차**:
1. `npm run type-check` 통과
2. 두 페이지 manual test:
   - `/admin/categories` — 생성/수정/삭제/순서 변경 → DB 영향 정확 (table `categories`)
   - `/admin/internal-categories` — 동일 흐름 → table `internal_categories`
3. AdminRoute 가드 동작 동일성 확인

**LOC 절감**: ~250 (288 + 288 → ~270 공통 + 10 + 10 wrapper).

**선택**: Repository 도 generic factory 로 통합 가능하지만 명시적으로 두 개 두는 게 가독성 ↑ — **repository 통합은 skip 권장**.

## 4. 진행 순서 제안

1. Tier 1 (5분) — 6 파일 + 빈 JSON 삭제 → type check + lint 확인
2. Tier 2 (3분) — CLAUDE.md 수정
3. Tier 3 (1-2시간) — cultivationCalculator 분리 → planner UI 검증
4. Tier 4 (1-2시간) — CategoryManager DRY → admin UI 검증

각 단계 별로 별도 commit. 문제 시 rollback 쉽게.

## 5. 적용 안 함 (의도적 skip)

- **Plugin registry 추상화** (calculator events vs secretNote plugins) — 두 곳만 사용, 패턴이 이미 명료해서 추상화 비용 > 효과.
- **3 route guards 한 파일** (`src/components/guards/AdminRoute.tsx`) — 각 12 LOC 짧고 명확. 추상화 불필요.
- **utils/index.ts barrel 의 format 함수 누락** — Tier 1 에서 `utils/index.ts` 자체를 삭제하므로 해소됨.
- **lib/ocr 잠정 중단 영역** — `templateMatch.ts`, `cv.ts` 외엔 production 사용 중. 손대지 마. (재개 시점에서 다시 평가)
- **600+ line 큰 컴포넌트들** (OcrImportDialog 611, CraftingCalcPage 501, LabelPage 504, RerollPage 364, RulesEditor 351, InventoryPage 349, RichTextEditor 337, CultivationPlannerPage 328) — sub-component 이미 분리, 응집도 높음. 분리 강요하면 props drilling 만 늘어남.

## 6. 분석 자산 (참고)

- 큰 파일 상위 25개 (wc -l 결과) — `find src -name '*.ts*' | xargs wc -l | sort -rn | head -25`
- service/* 비대칭 — planner 가 utils 7 + components 16. 다른 service 는 utils 0~1.
- types 사용 빈도 — planner 20, secretNote/event/guide 13-14, auth 4, common 1 (api.ts 만), reroll/crafting 3. orphan 0.

## 7. 안전성 검증 부록 (2026-06-15)

각 Tier 별로 "기존 동작에 영향 0" 임을 확인한 grep 결과 + 부작용 점검.

### Tier 1 — dead code 확정 증거

| 파일 | grep 명령 | 결과 |
|---|---|---|
| `utils/api.ts` | `grep -rn "from.*'@/utils/api\|fetchData\b\|postData\b" src/` | `utils/api.ts` 와 `utils/index.ts` 외 0건. GuideListPage 의 `fetchData` 는 동명 로컬 함수 |
| `utils/index.ts` | `grep -rn "from '@/utils'\b" src/` | 0건 |
| `types/index.ts` | `grep -rn "from '@/types'\b" src/` | 0건 (모두 `@/types/{planner,…}` 직접) |
| `types/common.ts` | `grep -rn "ApiResponse\|RoutePath\|AsyncState" src/` | `api.ts` (삭제 예정) + `types/index.ts` (삭제 예정) 외 0건 |
| `data/character.json` | `grep -rn "data/character.json\|character\.json" src/` | 0건 |
| `data/weapon.json` | `grep -rn "data/weapon.json" src/` | 0건 (단 `weapon_star.json` 은 사용 중 — 혼동 주의) |
| `lib/ocr/templateMatch.ts` + `cv.ts` | `grep -rn "templateMatch\|getCv\b" src/ \| grep -v lib/ocr` | 0건 (`pipeline.ts:17` 의 "matchTemplate NCC" 는 주석) |
| Tauri bundle | `grep -E "character\.json\|weapon\.json" src-tauri/tauri.conf.json` | 0건 — bundle resources 명시 없음 |
| Vite glob | `grep -rn "import.meta.glob" src/` | `events/*.json` 만. `data/*.json` 자동 glob 없음 |

**삭제 절차 안전성**: 8 파일 동시 삭제 → `npm run type-check` 통과 → `npm run build` 통과.
실패 시 rollback (git restore).

### Tier 3 — cultivationCalculator 분리 검증

**외부 import 매핑** (모든 사용처):

| 파일 | import |
|---|---|
| `DeficitPanel.tsx:3` | `type { BondPlan, MaterialBreakdown }` |
| `CultivationPlannerPage.tsx:25` | `{ aggregateAllWithBond, computeDeficit }` |
| `PlannerStudentDetailPage.tsx:8` | `{ aggregateAllWithBond, computeDeficit }` |

**외부 사용 = 4개 항목**. 분리 후 `index.ts` barrel 에서 4개만 re-export 해도 호환.
경로 `@/service/planner/utils/cultivationCalculator` → directory + `index.ts` 자동 해석 (tsconfig `paths: @/*: src/*` 검증됨).

**내부 의존 그래프 (sed 로 line range 추출 확인)**:

| Helper | 영역 | 사용처 |
|---|---|---|
| `addTo` (line 67) | private | 모든 domain (cross-cutting) |
| `mergeInto` (line 73) | private | 모든 domain |
| `addMaterialRow` (line 190) | private | `skills`, `gearWeapon` (equipment) |
| `calculatePotentialStatCost` (line 282) | private | `potentials` 만 (line 318-320) |
| `findEquipment` (line 331) | private | `gearWeapon` 만 (line 392) |
| `resolveRecipeRecursive` (line 349) | private | `gearWeapon` 만 (line 360 재귀, 395) |

**Domain 간 직접 호출 0건** 확인 (예: `skills.ts` 가 `levelCost.ts` 함수 호출 안 함).
유일한 cross-cutting 은 `_shared.ts` 의 mutation helper 들.

**`aggregate.ts` 의 import**:
- `aggregatePerStudent` (line 519) → `calculateLevelCost, calculateGearCost, calculateWeaponCost,
  calculateWeaponStarCost, calculateEquipmentCost, calculateSkillsCost, calculatePotentialsCost`
- `aggregateAllWithBond` (line 633) → `calculateBondExp, calculateBondGifts, getFavorItems, favorMultiplier`
- **모든 domain 을 import** — 단방향, 순환 없음.

**의존 그래프**:
```
types/planner (RequiredMaterials)  types/schaledb (SchaleDBStudent etc)
                   ↓                              ↓
              _shared.ts (mutation helpers + EquipmentMap)
                   ↓
levelCost / gearWeapon / skills / potentials / bondGifts  (5 domain, 서로 호출 0)
                   ↓
              aggregate.ts (5 domain 합산)
                   ↑
              index.ts (외부 4개 항목 re-export)
                   ↑
        외부 3 files (DeficitPanel / CultivationPlannerPage / PlannerStudentDetailPage)
```

**작업 단계** (분리 시):
1. `_shared.ts` 만들고 `addTo`, `mergeInto`, `addMaterialRow`, `EquipmentMap` 옮김 (private → exported)
2. 도메인 5개 분리 — `_shared` 에서 helper import
3. `aggregate.ts` 분리 — 5 도메인 + `_shared` 모두 import
4. `index.ts` barrel — 외부 4개 항목 (`aggregateAllWithBond`, `computeDeficit`, `BondPlan`, `MaterialBreakdown`) re-export
5. 기존 `cultivationCalculator.ts` 삭제
6. `npm run type-check` + planner UI 수동 테스트

### Tier 4 — CategoryManager DRY 검증

**`diff CategoryManagePage.tsx InternalCategoryManagePage.tsx` 결과 — 7 line**:
- import line (`CategoryRepository` ↔ `InternalCategoryRepository`)
- export function 이름
- Repository 메소드 호출 5건: `getCategories`, `reorder`, `createCategory`, `deleteCategory`, `updateName`
- `<h1>` 제목 텍스트

→ **UX 차이 0** 확인. 모든 차이를 `repository` + `title` 2개 prop 으로 흡수 가능.

**Repository diff**:
- public 메소드 시그니처 100% 동일
- 차이: class 이름, `.from('categories')` vs `.from('internal_categories')`
- → Repository 통합은 skip (명시적 두 class 유지 권장)

**라우트 영향 0**: `/admin/categories`, `/admin/internal-categories` 그대로 — wrapper 의 default export 가 page 역할 유지.

**Router 등록 확인** (`src/router/index.tsx`):
- line 17: `import CategoryManagePage from '@/service/admin/pages/CategoryManagePage'`
- line 21: `import InternalCategoryManagePage from '@/service/admin/pages/InternalCategoryManagePage'`
- line 126-127: `path: 'admin/categories'`, `element: <AdminRoute><CategoryManagePage /></AdminRoute>`
- line 142-143: `path: 'admin/internal-categories'`, `element: <AdminRoute><InternalCategoryManagePage /></AdminRoute>`
→ Default export 형식만 유지하면 router 무변경.

### 부수 검증 — AppError 보존 결정 근거

**`AppError.ts` 사용처 (`grep -rn "AppError" src/ | grep -v src/utils/`)**:
- `plannerRepository.ts` 5+ 호출 (line 3, 46, 71, 110, …)
- `secretNoteRepository.ts` 2 호출 (line 3, 63, 179)
- `localPlannerRepository.ts` 2 호출 (line 9, 59)
- `guideRepository.ts` 2 호출 (line 3, 111)
→ **총 4 repository, 10+ 호출 — 절대 dead 아님**

`utils/index.ts` 의 `AppError` re-export 는 barrel 이라서 같이 삭제 OK. 외부는
모두 `from '@/utils/AppError'` 직접 import 정착 (`@/utils` barrel 사용 0).

### 종합 평가 (2회차 엄격 검증 후)

모든 Tier 에서 **기존 기능/동작에 영향 없음** 확인됨:

| Tier | 핵심 검증 | 결과 |
|---|---|---|
| 1 | 8 파일 외부 import grep, Tauri bundle, Vite glob, public/ 복사본, dynamic import | 모두 0 — 안전 |
| 1 (AppError) | 4 repository 10+ 호출 확인 | `AppError.ts` 보존 (barrel 만 삭제) |
| 3 | 외부 import 4개 매핑, 내부 의존 그래프 (`addTo`/`mergeInto` cross-cutting), domain 간 직접 호출 0 | barrel + `_shared.ts` 패턴으로 안전 |
| 4 | diff 7 line, repository 시그니처 100% 일치, router default export 호환 | wrapper 패턴 안전 |

실패 위험은 모두 **type-check + build** 단계에서 잡힘 (런타임 오류 가능성 매우 낮음). 각 Tier 별 commit 분리로 rollback 단순화.

### 추가로 검증한 영역 (모두 영향 없음)

- **Dynamic import**: `OcrImportDialog`, `LabelPage` 가 `lib/ocr/pipeline`, `lib/ocr/indexLoader` 를 `await import()` — templateMatch/cv 와는 무관
- **React.lazy**: router 에서 `GuideFormPage` 만 lazy — 영향 없음
- **Python OCR + Rust Tauri**: legacy `character.json`/`weapon.json` 참조 0건
- **tsconfig paths**: `@/*: src/*` 단일 alias — directory + index.ts 자동 해석 동작
- **Header / Sidebar**: admin route 직접 link 없음 — router 가 단일 진입점
- **public/ 폴더**: `public/ocr/` 만 (인덱스 binary), legacy JSON 복사본 없음
- **Tauri bundle resources**: `extract_inventory.py`, `remap.json`, `icon_hashes.json` 만 명시
