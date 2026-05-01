# 학생 육성 플래너 구현 계획

> 여러 학생을 플래너에 담아 **현재 → 목표** 육성 수치를 설정하면, 필요 재화를 자동 합산하고, 사용자가 입력한 **현재 보유 재화**와 비교해 **부족분**을 표시한다.
>
> 플래너는 장기 상태 저장형 도구라 단발 계산기와 성격이 다름. 사이드바에 **신규 "플래너" 그룹**을 신설하고 그 하위의 첫 메뉴로 "육성 플래너" 를 배치 (향후 이벤트 플래너 등 확장 대비).

---

## 1. 요구사항 정리

- 로그인 사용자가 **자신의 플래너**를 생성·수정 (공유 X, 비회원 X — 둘 다 범위 밖)
- 플래너에 여러 학생 추가, 각 학생마다 **현재치/목표치** 설정
- **MVP 대상 4종**: 학생 레벨, **고유장비**(Gear T1~T3), **고유무기**(Weapon 레벨 1~50), **일반 장비**(학생별 슬롯 가변, 보통 3개, 각 T1~T10)
- 보유 재화 인벤토리 입력 → 부족분 표시 (required − owned)
- SchaleDB 데이터로 필요 재료 계산 (클라이언트 전용, 백엔드 계산 없음)
- 스킬/잠재력/호감도는 **향후 확장**, 이번 범위 밖

---

## 2. 기존 계산기와의 경계 (중복 방지)

| 기능 | 범위 | 플래너와의 관계 |
|---|---|---|
| `/calculator/eligma` ([EligmaCalcPage](my-site/src/service/calculator/pages/EligmaCalcPage.tsx)) | 성급→엘리그마 비용 단건 계산 (하드코딩 상수) | **독립** — 플래너는 성급을 다루지 않음 (MVP 범위) |
| `/calculator/crafting` | 제조 노드별 재료 합산 | **독립** — 플래너는 SchaleDB 기반, crafting 은 정적 JSON |
| `/calculator/event` | 이벤트 포인트/교환 계산 | **독립** — 이벤트 한정 자원 |
| `/planner/cultivation` (신설) | 여러 학생 × 육성 요소 × 부족 재화 | 기존 계산기와 **목적이 다름** (단발성 ↔ 장기 상태 저장) |

→ 코드 공유는 **추출 리팩터링 범위 밖** (YAGNI). 플래너 내부에 필요한 계산 함수 자체 구현.

---

## 3. 프로젝트 컨벤션 준수 체크리스트

| 영역 | 컨벤션 | 이 계획 적용 |
|---|---|---|
| 라우트 | 기능별 최상위 네임스페이스 (`/guide`, `/admin/notes`, `/calculator/*`) | **`/planner/cultivation`** — 신규 `/planner` 네임스페이스. 향후 `/planner/event` 등 확장 |
| 페이지 디렉토리 | 기능별 `service/{feature}/` | **`service/planner/`** 신규 도메인 디렉토리 |
| 리포지토리 | `class` + `static` 메서드, `.insert().select().single()` 사용 | 동일 |
| 도메인 유틸 | `service/*/utils/` (예: `service/guide/utils/uploadGuideImage.ts`) | **`service/planner/utils/cultivationCalculator.ts`** |
| 타입 | `interface`, camelCase, JSDoc, 배럴 export | 동일 |
| 가드 | `AdminRoute` / `EditorRoute` 존재. **일반 로그인 가드 부재** | **`AuthRoute` 신규 추가** ([guards/AdminRoute.tsx](my-site/src/components/guards/AdminRoute.tsx) 에 같이 export) |
| 색 테마 | 기능별 accent 색 (blue/indigo/yellow 등) | 플래너는 **`blue-*`** 기본 (공용 톤) |
| 사이드바 | `navItems` 최상위에 그룹/항목 배치 | **신규 "플래너" 그룹** 생성, 첫 자식으로 "육성 플래너" |

---

## 4. 핵심 설계 결정

1. **인벤토리 = jsonb 1:1** — `user_id` 당 한 행, `items jsonb` 로 `{itemId: quantity}` 저장. 집계 쿼리 필요 없음, 읽기/쓰기 간단
2. **플래너 학생 = 1:N** — 한 유저가 여러 학생 보유. 각 학생별 `targets jsonb` 에 레벨/무기/장비 현재·목표 값을 뭉쳐 저장
3. **모든 계산은 클라이언트** — SchaleDB JSON 을 브라우저가 페치 → 계산. 서버 연산 없음
4. **자동 저장 (debounced)** — 입력할 때마다 500ms 디바운스 후 Supabase 에 업데이트. "저장" 버튼 없이 UX 부드럽게
5. **"보유 재화 미입력" 허용** — 비어있으면 전부 부족으로 표시
6. **소프트 삭제 X** — 플래너 학생 제거는 하드 삭제 (장기 보존 가치 없음, user cascade 로 account 삭제 시 자동 정리)
7. **`AuthRoute` 정책** — `user != null && role !== 'pending'` (승인 대기 상태는 차단)

---

## 5. DB 스키마 (신규)

신규 파일: `supabase/migrations/20260420_cultivation_planner_up.sql`

```sql
-- 1) 플래너에 담은 학생 (1 user : N students)
create table planner_students (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  student_id  integer not null,                  -- SchaleDB Id
  targets     jsonb not null default '{}'::jsonb, -- PlannerTargets 직렬화
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, student_id)                    -- 같은 학생 중복 추가 방지
);
create index planner_students_user_idx on planner_students(user_id, sort_order);

-- 2) 보유 재화 인벤토리 (1 user : 1 inventory)
create table planner_inventory (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  items      jsonb not null default '{}'::jsonb,  -- { "<item_id>": number }
  updated_at timestamptz not null default now()
);

-- 3) RLS — 자기 데이터만
alter table planner_students enable row level security;
create policy "planner_students_own" on planner_students for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table planner_inventory enable row level security;
create policy "planner_inventory_own" on planner_inventory for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 4) updated_at 자동 갱신 트리거 (두 테이블 공통)
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger planner_students_bu before update on planner_students
  for each row execute function touch_updated_at();
create trigger planner_inventory_bu before update on planner_inventory
  for each row execute function touch_updated_at();
```

롤백: `20260420_cultivation_planner_down.sql` — policy/trigger/table drop (함수는 범용이라 유지 가능).

**기존 데이터 영향 없음**. `auth.users` FK 만 참조.

---

## 6. 타입 ([types/planner.ts](my-site/src/types/planner.ts))

```ts
/** 레벨 범위 */
export interface LevelRange {
  current: number;   // 1~90 (하드코딩 EXP 테이블 기반)
  target: number;
}

/** 고유장비 (Gear) 티어 범위 */
export interface GearRange {
  currentTier: number;   // 0(미해금)~3
  targetTier: number;
}

/** 고유무기 (Weapon) 레벨 범위 */
export interface WeaponRange {
  currentLevel: number;  // 0(미해금)~50
  targetLevel: number;
}

/**
 * 일반 장비 티어 배열 — 학생별 슬롯 수 가변.
 * SchaleDBStudent.Equipment 의 길이와 일치 (보통 3).
 */
export type EquipmentTiers = number[];  // 각 원소 1~10

/** 학생별 목표치 */
export interface PlannerTargets {
  level: LevelRange;
  gear?: GearRange;
  weapon?: WeaponRange;
  equipment?: { current: EquipmentTiers; target: EquipmentTiers };
  // 향후: skills, potential, bond 추가 예정
}

/** 플래너에 담긴 학생 1 */
export interface PlannerStudent {
  id: string;
  userId: string;
  studentId: number;     // SchaleDB Id
  targets: PlannerTargets;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** 인벤토리 맵 — { itemId(string): quantity } */
export type InventoryMap = Record<string, number>;

/** 집계된 필요 재료 */
export type RequiredMaterials = Record<string, number>;

/** 부족 리포트 */
export interface DeficitReport {
  required: RequiredMaterials;
  owned: InventoryMap;
  deficit: RequiredMaterials;  // max(0, required - owned)
}
```

`types/index.ts` 배럴에 export 추가.

---

## 7. 리포지토리 ([repositories/plannerRepository.ts](my-site/src/repositories/plannerRepository.ts))

`SecretNoteRepository` 와 동일한 SDK 직접 사용 패턴. `class PlannerRepository` + `static`.

| 메서드 | 반환 | 구현 요점 |
|---|---|---|
| `getStudents(userId)` | `PlannerStudent[]` | `.from('planner_students').select('*').eq('user_id', userId).order('sort_order')` |
| `addStudent(userId, studentId, targets)` | `PlannerStudent` | insert — `unique (user_id, student_id)` 위반 시 `AppError` |
| `updateStudent(id, patch)` | `PlannerStudent` | `.update({ targets, sort_order }).select().single()` |
| `removeStudent(id)` | `void` | 하드 delete |
| `reorderStudents(ordered: string[])` | `void` | 반복 update (카테고리 reorder 패턴과 동일) |
| `getInventory(userId)` | `InventoryMap` | upsert 스타일 — row 없으면 `{}` 반환 |
| `updateInventory(userId, items)` | `void` | `.upsert({ user_id, items })` — 1:1 이므로 간단 |

---

## 8. 계산 로직 ([service/planner/utils/cultivationCalculator.ts](my-site/src/service/planner/utils/cultivationCalculator.ts))

### 8.1 필요한 SchaleDB 데이터 (스키마 확정)

| 데이터 | URL | 용도 | 상태 |
|---|---|---|---|
| `students.min.json` | `/data/kr/students.min.json` | 학생 상세. 주요 필드: `Equipment: string[]`, `Gear.{TierUpMaterial, TierUpMaterialAmount}` | ✅ |
| `equipment.min.json` | `/data/kr/equipment.min.json` | 일반 장비. 필드: `{Id, Category, Tier, Recipe: [[materialId, qty], ...], RecipeCost, Icon}` | ✅ |
| `items.min.json` | `/data/kr/items.min.json` | 아이템 이름/아이콘 lookup. 이미지 헬퍼 [itemIconUrl](my-site/src/lib/schaledbImage.ts) 재사용 | ✅ |
| **`config.min.json`** | `/data/config.min.json` (언어 중립) | **지역별 상한값** : `StudentMaxLevel: 90`, `WeaponMaxLevel: 60/50`, `EquipmentMaxLevel: [10,10,10]`, `BondMaxLevel: 50`, `PotentialMax: 25`. 플래너의 input 슬라이더/select 상한을 동적으로 설정 | ✅ |

> `config.min.json` 은 `/data/kr/` 이 아닌 **`/data/` 직속** (언어 중립 공통 데이터). 기존 [schaledb.ts:7](my-site/src/lib/schaledb.ts#L7) `SCHALEDB_ENDPOINTS` 에 추가 필요.

### 8.2 SchaleDB 에 **없는** 데이터 (하드코딩 필요)

SchaleDB 는 학생 레벨업 EXP 테이블·고유무기 레벨업 재료를 호스팅하지 않음 (UI 에서 표시 안 하는 데이터). 게임 에셋 추출 기반 커뮤니티 자료를 프로젝트 내 상수로 고정:

| 데이터 | 위치 | 출처 |
|---|---|---|
| 학생 레벨업 누적 EXP 테이블 (1~90) | `service/planner/utils/tables/studentExp.ts` | [Futottakakka/bluearchive-expcalc](https://github.com/Futottakakka/bluearchive-expcalc) `calc.js` 배열. 원천은 [aizawey479/ba-data](https://github.com/aizawey479/ba-data) (게임 에셋 직접 추출) |
| 학생 레벨업 누적 크레딧 | 동상 | 동상 |
| 고유무기 레벨업 재료 테이블 (구간별 학생 엘레프 + 신명석 + 크레딧) | `service/planner/utils/tables/weaponLevel.ts` | 커뮤니티 공개 자료 (나무위키, Blue Archive Wiki, hina.loves.midokuni.com 등 참고) |

> 출처 URL 은 참고용 주석으로 유지. 실제 값 복붙 시 저작권·출처 표기 주석 달 것.

### 8.3 고유장비(Gear) 티어업 재료 (SchaleDB 에서 직접)

`SchaleDBStudent.Gear.TierUpMaterial` 은 2D 배열 — 각 행이 티어업 1단계:

```
예: 아루의 Gear
  TierUpMaterial:       [[5017, 150, 151]]   // 티어 1→2 의 재료 id 3종
  TierUpMaterialAmount: [[4, 80, 25]]         // 해당 수량
```

플래너는 `currentTier` → `targetTier` 구간의 행들을 합산.

### 8.4 함수 시그니처

```ts
// 학생 레벨업 — 하드코딩 EXP 테이블 기반
export function calculateLevelCost(current: number, target: number): {
  exp: number;
  credits: number;
};

// 고유장비 (Gear) 티어업 — SchaleDBStudent.Gear 에서 추출
export function calculateGearCost(
  student: SchaleDBStudent,
  current: GearRange,
  target: GearRange,
): RequiredMaterials;

// 고유무기 (Weapon) 레벨업 — 하드코딩 테이블 + 학생 고유 엘레프 id
export function calculateWeaponCost(
  student: SchaleDBStudent,
  current: WeaponRange,
  target: WeaponRange,
): RequiredMaterials;

// 일반 장비 슬롯별 티어업 — equipment.min.json Recipe 재귀 풀기
export function calculateEquipmentCost(
  current: EquipmentTiers,
  target: EquipmentTiers,
  slotCategories: string[],      // student.Equipment — ["Hat", "Hairpin", ...]
  equipmentData: EquipmentMap,
): RequiredMaterials;

// 학생 1명의 전체 요구치
export function aggregatePerStudent(
  student: SchaleDBStudent,
  targets: PlannerTargets,
  equipmentData: EquipmentMap,
): RequiredMaterials;

// 전체 학생 합산
export function aggregateAll(
  plannerStudents: PlannerStudent[],
  studentsData: Record<string, SchaleDBStudent>,
  equipmentData: EquipmentMap,
): RequiredMaterials;

// 부족 계산
export function computeDeficit(
  required: RequiredMaterials,
  owned: InventoryMap,
): DeficitReport;
```

모두 순수 함수 (테스트 용이, side effect 없음).

### 8.5 장비 Recipe 재귀 처리

`equipment.min.json` 의 `Recipe` 는 "이 티어 장비 1개 제작 비용" 이며, 상위 티어는 하위 티어 장비를 재료로 사용한다. 플래너는 **기본 재료 (items.min.json) 까지 재귀적으로 풀어서** 총량 표시 — 중간 단계 장비를 직접 보여주지 않고 최종 드롭 재료만 집계 (사용자 친화적).

### 8.6 향후 확장 시 SchaleDB 에서 직접 활용 가능한 필드

MVP 에는 포함하지 않지만 학생 JSON 에 **이미 있는 필드** (즉 하드코딩 불필요):

| 필드 | 확장 기능 |
|---|---|
| `SkillMaterial`, `SkillMaterialAmount` | 일반 스킬 레벨업 (Normal/Passive/Sub) 재료 |
| `SkillExMaterial`, `SkillExMaterialAmount` | EX 스킬 레벨업 재료 |
| `PotentialMaterial` | 잠재력 (공격/체력/치명) 강화 재료 |
| `FavorItemTags`, `FavorItemUniqueTags` | 호감도 선호 아이템 tag |

현재 [types/schaledb.ts](my-site/src/types/schaledb.ts) `SchaleDBStudent` 에는 위 필드들이 **누락**되어 있음. MVP 단계에서는 추가 불필요하지만, 확장 시 타입 보강 필요.

---

## 9. `AuthRoute` 가드 신설

[components/guards/AdminRoute.tsx](my-site/src/components/guards/AdminRoute.tsx) 에 세 번째 export 로 추가:

```tsx
/** 로그인 가드 (pending 제외) */
export function AuthRoute({ children }: Props) {
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) return <div className="text-center py-12 text-gray-400 dark:text-slate-400">확인 중...</div>;
  if (!user || user.role === 'pending') return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

---

## 10. 라우팅 ([router/index.tsx](my-site/src/router/index.tsx))

```tsx
{ path: 'planner/cultivation', element: <AuthRoute><CultivationPlannerPage /></AuthRoute> }
```

향후 `planner/event`, `planner/raid` 등 같은 네임스페이스 하위로 추가 가능.

---

## 11. 페이지/컴포넌트 구조

```
service/planner/
  pages/
    CultivationPlannerPage.tsx    // 메인 레이아웃 (/planner/cultivation)
  components/
    AddStudentModal.tsx           // 학생 검색 + 추가
    StudentCard.tsx               // 한 학생의 현재/목표 설정
    LevelTargetInput.tsx          // 학생 레벨 범위 입력
    GearTargetInput.tsx           // 고유장비 티어 입력
    WeaponTargetInput.tsx         // 고유무기 레벨 입력
    EquipmentTargetInput.tsx      // 일반 장비 슬롯별 티어 입력 (슬롯 수 가변)
    InventoryPanel.tsx            // 보유 재화 입력
    DeficitPanel.tsx              // 부족 재화 요약
    MaterialCell.tsx              // 아이콘 + 필요/보유/부족 표시 (공용)
  utils/
    cultivationCalculator.ts      // 순수 계산 함수
    debouncedSave.ts              // 자동 저장 헬퍼
    tables/
      studentExp.ts               // 학생 레벨업 EXP/크레딧 테이블 (하드코딩)
      weaponLevel.ts              // 고유무기 레벨업 재료 테이블 (하드코딩)
```

### 11.0 모바일/데스크톱 레이아웃
- **세로 스택** — 학생 카드 1열로 스크롤. 데스크톱/모바일 동일
- 향후 데스크톱에서 2열 그리드 옵션 고려 (범위 밖)

> 향후 이벤트 플래너 등이 추가되면 `pages/EventPlannerPage.tsx` 같은 형태로 동일 도메인에 병치. 공통 컴포넌트/훅이 생기면 그때 분리 리팩터.

### 11.1 `CultivationPlannerPage` 레이아웃 개요
```
┌────────────────────────────────────────────┐
│ 육성 플래너           [학생 추가]   [초기화] │
├────────────────────────────────────────────┤
│ [학생 카드] [학생 카드] [학생 카드] ...    │  ← 가로 스크롤 or 그리드
├────────────────────────────────────────────┤
│ 보유 재화 (InventoryPanel)                 │
├────────────────────────────────────────────┤
│ 부족 재화 (DeficitPanel, required 기준 정렬) │
└────────────────────────────────────────────┘
```

### 11.2 자동 저장
- `useEffect` + `setTimeout` 디바운스 500ms
- 저장 중/저장 완료 상태 표시 (우측 상단 "저장됨 ✓" 뱃지)

---

## 12. 사이드바 통합 ([components/navigation/Sidebar.tsx](my-site/src/components/navigation/Sidebar.tsx))

`navItems` 최상위에 **신규 "플래너" 그룹** 추가:

```ts
const navItems: NavItem[] = [
  { name: '대시보드', path: '/' },
  { name: '정보',    children: [ /* 정보글, 학생 목록, 리세계 추천 */ ] },
  { name: '계산기',  children: [ /* 엘리그마, 제조, 이벤트 */ ] },
  {
    name: '플래너',
    children: [
      { name: '육성 플래너', path: '/planner/cultivation' },
    ],
  },
];

const DEFAULT_OPEN: string[] = ['정보', '계산기', '플래너'];  // 첫 방문 펼침
```

- **비로그인 사용자도 링크 자체는 보임** (사이드바 필터링 없음). 클릭 시 `AuthRoute` 가 `/login` 으로 리다이렉트
- 대안: `user != null` 일 때만 표시 — UX 명확성은 ↑ 이지만 기능 발견성 ↓. 현 정책은 **노출 유지**
- 기존 사용자의 `localStorage` 에 `'플래너'` 가 없어도, `/planner/*` 접속 시 auto-expand 로직이 자동 펼침

---

## 13. 보안 체크리스트

- [ ] `planner_students` / `planner_inventory` 모두 RLS 활성, `user_id = auth.uid()` 정책만 존재
- [ ] anon 으로 `GET /rest/v1/planner_students` 호출 시 `[]` 반환
- [ ] `auth.users` FK 의 `on delete cascade` 동작 확인 (테스트 계정으로 검증)
- [ ] `unique (user_id, student_id)` 위반 시 의미 있는 에러 메시지
- [ ] jsonb 내부는 서버 검증 없음 → **클라이언트 validation 필수** (음수 수량 방지, 타겟 < 현재 방지 등)

---

## 14. 작업 순서 (PR 단위)

1. **PR#1 — DB** : `20260420_*_up.sql` / `_down.sql` 작성 + Supabase Studio 수동 실행 + 롤백 검증
2. **PR#2 — AuthRoute 가드 + 타입** : `AuthRoute` 추가, `types/planner.ts` + 배럴 export
3. **PR#3 — 리포지토리** : `PlannerRepository` 7개 메서드
4. **PR#4 — SchaleDB 확장 + 계산 로직** :
   - [lib/schaledb.ts](my-site/src/lib/schaledb.ts) `SCHALEDB_ENDPOINTS` 에 `config: /data/config.min.json` 추가 (언어 중립)
   - `EquipmentMap`, `SchaleDBConfig` 타입 정의
   - `cultivationCalculator.ts` (순수 함수 7개)
   - `tables/studentExp.ts`, `tables/weaponLevel.ts` 하드코딩 테이블 (출처 주석 포함)
   - 상한값(`StudentMaxLevel` 등)은 config 에서 동적 조회하여 input UI 에 반영
5. **PR#5 — 플래너 페이지 기본 레이아웃** : 학생 추가/제거, 목록 렌더, 자동 저장 훅
6. **PR#6 — 목표치 입력 UI** : `StudentCard` + Level/Weapon/Equipment 서브컴포넌트
7. **PR#7 — 인벤토리 패널 + 부족 리포트** : 보유 재화 입력, 부족분 계산 표시
8. **PR#8 — 사이드바 "플래너" 그룹 추가 + 정리** : `navItems` 에 그룹 신설, `DEFAULT_OPEN` 에 `'플래너'` 추가, CLAUDE.md 라우트 표 갱신

**각 PR 마다 `npm run type-check` 필수.** PR#4 는 SchaleDB JSON 실제 스키마 검증이 필요해 **시간 소요 가장 큼**.

---

## 15. 결정된 사항

| 항목 | 결정 |
|---|---|
| 라우트 | `/planner/cultivation` (신규 `/planner` 네임스페이스) |
| 디렉토리 | `service/planner/` (신규 도메인) |
| 사이드바 | 신규 **"플래너" 그룹** 최상위에 추가 (`DEFAULT_OPEN` 에도 포함) |
| 가드 | 신규 `AuthRoute` (user 존재 + role !== 'pending') |
| MVP 범위 | 학생 레벨 / 고유장비(Gear) / 고유무기(Weapon) / 일반 장비(학생별 슬롯 가변) — 스킬/잠재력/호감도는 향후 |
| 학생 레벨 EXP 테이블 | **하드코딩** — SchaleDB 에 없음 (UI 에 표시 안 하는 데이터). `utils/tables/studentExp.ts`, 출처: Futottakakka/bluearchive-expcalc + aizawey479/ba-data |
| 고유무기 레벨업 재료 | **하드코딩** — SchaleDBWeapon 에 재료 없음. `utils/tables/weaponLevel.ts`, 출처: 커뮤니티 자료 |
| 지역 상한값 (`StudentMaxLevel` 등) | **SchaleDB `config.min.json`** 동적 조회 (`/data/config.min.json`) |
| 고유장비 티어업 재료 | SchaleDB `SchaleDBStudent.Gear.TierUpMaterial` 직접 사용 |
| 일반 장비 티어업 재료 | SchaleDB `equipment.min.json` 의 `Recipe` 재귀 풀기 (기본 재료까지 평탄화) |
| 장비 슬롯 수 | **학생별 가변** — `SchaleDBStudent.Equipment` 길이 따름 (보통 3) |
| 모바일 레이아웃 | 세로 스택 1열 (데스크톱도 동일) |
| 인벤토리 저장 | 1:1 jsonb (`planner_inventory.items`) |
| 플래너 학생 저장 | 1:N + `(user_id, student_id)` unique |
| 자동 저장 | 500ms 디바운스 |
| 공유 기능 | 보류 (범위 밖) |
| 비회원 로컬 사용 | 보류 (범위 밖) |
| 소프트 삭제 | X — 하드 삭제 (cascade) |
| SchaleDB 계산 | 클라이언트 전용 (서버 연산 없음) |
| 기존 계산기와의 코드 공유 | 안 함 (YAGNI) |
| 사이드바 노출 | 비회원에게도 링크는 보임, 클릭 시 로그인 유도 |

---

## 16. 스키마 검증 결과 (2026-04-22 확인)

SchaleDB 실제 JSON 을 WebFetch 로 검증 완료.

| 항목 | 결과 |
|---|---|
| `equipment.min.json` 구조 | ✅ `Recipe: [[materialId, qty], ...]`, `RecipeCost`, `Category`, `Tier`, `MaxLevel` — 확정 |
| `config.min.json` | ✅ **`/data/config.min.json`** (언어 중립) 에 존재. `Regions` 배열에 `StudentMaxLevel/WeaponMaxLevel/EquipmentMaxLevel` 등 상한값 제공 |
| 학생 레벨업 EXP 테이블 | ❌ SchaleDB 의 어느 JSON 에도 없음 → **하드코딩 불가피** |
| 고유무기 레벨업 재료 | ❌ SchaleDB `Weapon` 필드에 `StatLevelUpType` 만 있고 재료 정보 없음 → **하드코딩 불가피** |
| 고유장비(`Gear`) 티어업 재료 | ✅ `TierUpMaterial`/`TierUpMaterialAmount` 2D 배열 직접 활용 |
| 아이템 아이콘 URL | ✅ 기존 `itemIconUrl(icon)` 재사용 |
| 장비 슬롯 수 | ⚠️ 가변 (`SchaleDBStudent.Equipment` 길이, 보통 3) — 배열 타입으로 처리 |
| 학생 JSON 의 스킬/잠재력 재료 필드 | ✅ `SkillMaterial`/`SkillExMaterial`/`PotentialMaterial` 존재 — 향후 확장 시 하드코딩 없이 재사용 가능 |
| 모바일 레이아웃 | 세로 스택 1열 (데스크톱 동일) |

## 17. PR#4 착수 전 추가 조사 (선택)

PR#4 구현 시 세부 검증이 필요한 사항:
- [ ] 고유장비(Gear) `TierUpMaterial` 의 재료 id 가 `items.min.json` 에 매핑되는지 확인
- [ ] 일반 장비 `Recipe` 의 재료 id 가 다른 equipment(하위 티어) 인지 items 인지 구분 (id 범위로 판별)
- [ ] 하드코딩 테이블의 실제 값 확보 — `Futottakakka/bluearchive-expcalc` 의 `calc.js` 배열을 프로젝트에 반영
- [ ] `config.min.json` 의 `Regions` 에 KR 항목이 없으므로 Global 상한을 사용할지, 별도 하드코딩할지 결정

→ 계획서 작성 완료. **PR#1 (DB 마이그레이션)** 부터 착수 가능.
