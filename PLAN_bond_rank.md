# 인연랭크(Bond) 플래너 통합 계획

> 육성 플래너에 학생별 **인연랭크 목표 + 필요 선물 계산** 을 추가한다.
> 작성일: 2026-05-17 (Phase 0 검증 반영)
> 관련 파일: [my-site/src/types/planner.ts](my-site/src/types/planner.ts), [my-site/src/service/planner/utils/cultivationCalculator.ts](my-site/src/service/planner/utils/cultivationCalculator.ts), [my-site/src/service/planner/utils/inventoryCatalog.ts](my-site/src/service/planner/utils/inventoryCatalog.ts), [my-site/src/types/schaledb.ts](my-site/src/types/schaledb.ts)

---

## Phase 0 검증 결과 (2026-05-17)

SchaleDB raw JSON + `js/common.js` + 커뮤니티 데이터 레포를 점검한 결과:

| 항목 | 결과 |
|---|---|
| `FavorItemTags` (학생 선호 태그) | ✅ 존재 (예: 아루 `['ak', 'aV']`) |
| `FavorItemUniqueTags` (학생 고유 태그) | ✅ 존재 — **본 계획에 못 박혀 있던 가정 외 추가 발견** (예: 아루 `['BD']`) |
| `CommonFavorItemTags` (모든 학생 공통 태그, region config) | ✅ 존재 — config.json 에 `['BC', 'Bc', 'ew']` |
| 아이템 `Tags` | ✅ 존재, 52/52 Favor 아이템 모두 보유 (대소문자 구분 단축 코드) |
| 아이템 `ExpValue` | ✅ 존재, 52/52. **SR=20, SSR=60 (예외 2종 SSR=20)** |
| 아이템 `Quality` / `Rarity` | ✅ 존재 |
| `BondMaxLevel` | ⚠️ SchaleDB config 는 3 region (Jp/Global/Cn) 모두 50 으로 표기. **그러나 사용자 제공 표 ([자료/인랭 계산기/인랭 경험치 테이블.webp](자료/인랭%20계산기/인랭%20경험치%20테이블.webp)) 는 1~100 까지** 명시. 한섭은 100. SchaleDB 가 한섭을 별도 region 으로 두지 않아 누락된 것으로 판단. **우리 구현은 100 으로 진행.** |
| `FindGiftMax` | ✅ 14 (Jp/Global), 13 (Cn) — 까페 일일 선물 한도. v2 시뮬레이션 시 사용. |
| **인연 EXP 곡선** | ✅ **[자료/인랭 계산기/인랭 경험치 테이블.webp](자료/인랭%20계산기/인랭%20경험치%20테이블.webp) 에서 1~100 누적 EXP 전체 확보**. 사진의 SR 80 (×4) / SSR 240 (×4) 가 SchaleDB ExpValue × 매칭배수 공식과 일치 → 데이터 신뢰 가능. **OQ-8 해소**. |
| **부가 정보 (사진에서 추가 발견)** | 스케줄 인연 EXP (지역 1~10 = 15, 11 = 20, 12 = 25, 보너스 시 2배 → 50). 까페 쓰다듬기 = 15 EXP. 이번 PR 비-목표지만 v2 시뮬레이션에 사용 가능. |
| **선호 배수 공식** | ✅ SchaleDB `common.js` 에서 발견: **`ExpValue × (matchingCount + 1)`**, max 4 단계. 즉 매칭 0=×1, 1=×2, 2=×3, 3+=×4 (UI 의 `Cafe_Interaction_Gift_01~04` 라벨과 일치). **OQ-1 해소** — 우리 가정 (×4/×2/×1) 보다 1 단계 세분화. |
| `MemoryLobby` shape | ⚠️ 실제 `[6, 6, 6]` 같은 3-원소 (region 별). 우리 타입 정정 필요. |
| `IsLimited` shape | ⚠️ 실제 `[4, 4, 0]` 3-원소 배열. 우리 타입은 `number` — 별개 이슈, 본 PR 범위 외. |

### Phase 0 가 추가로 답한 결정 사항

- **OQ-1 (선호 배수)**: ✅ `ExpValue × (matching_count + 1)`, cap 4. 매칭 수가 ×4까지 동적.
- **OQ-7 (필드 실재 여부)**: ✅ `FavorItemTags` / `Tags` / `ExpValue` 모두 존재 — plan B 불필요.
- **OQ-8 (인연 EXP 곡선 출처)**: ✅ 사용자 제공 사진 `자료/인랭 계산기/인랭 경험치 테이블.webp` 에서 1~100 전체 확보. **BondMaxLevel 은 50 → 100 으로 정정** (SchaleDB config 의 50 은 한섭 누락 추정).
- **신규 OQ-10**: 사진 표가 한섭 최신 인지 게임 패치 이후로도 유효한지 — 외부 검증 필요. 차단 아님, 패치 시 갱신.

---

## 1. 개요

현재 플래너는 레벨 / 애장품 / 무기 / 무기성급 / 일반장비 / 스킬 / 잠재력 7축의 목표를 지원한다. **인연랭크** 만 빠져 있다 ([types/planner.ts:92](my-site/src/types/planner.ts#L92) — `// 향후 확장: bond`).

이 PR 의 목표:

1. `PlannerTargets.bond?: BondRange` 필드 추가
2. 학생 카드에 인연 현재 / 목표 입력 UI
3. 인연랭크 부족분 → **필요 선물 아이템 + 권장 사용 조합** 계산
4. 기존 인벤토리 페이지의 `gear-favor` 그룹과 **재료 공유** (애장품 강화 ↔ 인연 모두 선물 사용)
5. 인연랭크 → 스탯 보너스 표시 (학생 카드 부가 정보)

비-목표:

- 까페 호감도 일일 한도 시뮬레이션 (학생 머리쓰담쓰담 횟수)
- 메모리얼 로비 해금 진행도 트래킹 (단순 표시는 OK, 별도 입력 X)
- 일정 (스케줄) 보상 계산
- 글로벌 / 일섭 / 한섭 단위로 다른 캡 처리는 한섭 기준만 1차 지원

---

## 2. 현재 상태

### 가용 데이터 (이미 있음)

- **인벤토리 페이지의 `gear-favor` 그룹** — `Gear.TierUpMaterial` 에서 모은 애장품용 선물 아이템 키 ([inventoryCatalog.ts:163-205](my-site/src/service/planner/utils/inventoryCatalog.ts#L163-L205)). 이게 게임상 까페에서도 그대로 쓰이는 아이템들이라 **신규 인벤토리 항목 추가는 없음**.
- **`SchaleDBStudent.FavorStatType` + `FavorStatValue`** ([types/schaledb.ts:56-57](my-site/src/types/schaledb.ts#L56-L57)) — 인연랭크 보너스 스탯. **shape 검증됨**: `FavorStatType` 길이 2 (예: `["AttackPower", "MaxHP"]`), `FavorStatValue` 길이 7 (랭크 구간별 [stat0증가, stat1증가] 페어). 정확한 인덱스 → 랭크 매핑은 `common.js` 로직 (`student.FavorStatValue[Math.floor(i / 5)]` / `[2 + Math.floor(i / 10)]`) 참고 — Phase 3 UI 단계에서 해석.
- **`SchaleDBStudent.FavorItemTags`** — Phase 0 검증됨. 학생당 보통 2~3 개 (예: `['ak', 'aV']`). 대소문자 구분 단축 코드.
- **`SchaleDBStudent.FavorItemUniqueTags`** — Phase 0 신규 발견. 학생당 1~2 개 (예: `['BD']`). `FavorItemTags` 와 함께 매칭 합산 가능성 (정확한 의미는 OQ-9 — §4).
- **`SchaleDBStudent.FavorAlts`** ([types/schaledb.ts:58](my-site/src/types/schaledb.ts#L58)) — 같은 캐릭터의 다른 의상 학생 ID 목록. **인연랭크는 의상별로 독립 (공유 안 됨)** 이므로 계산에 사용하지 않음. 정보 표시용 (예: "이 학생의 다른 의상" 링크) 으로만 잠재 활용.
- **`SchaleDBStudent.MemoryLobby`** — 실제 shape `[6, 6, 6]` 같은 3-원소 (region 별 메모리얼 로비 카운트?). 정확한 의미 OQ-10.
- **`SchaleDBConfig.CommonFavorItemTags`** — Phase 0 신규 발견. config 전역. `['BC', 'Bc', 'ew']` — 모든 학생이 좋아하는 공통 태그. 매칭 시 학생 태그와 합쳐서 카운트 (§6.2).
- **`SchaleDBRegion.BondMaxLevel`** ([types/schaledb.ts:155](my-site/src/types/schaledb.ts#L155)) — SchaleDB config 는 Jp/Global/Cn 모두 50. **한섭은 100** (사용자 제공 표). SchaleDB 에 한섭 region 이 누락된 상태로 보임 → 우리 구현은 사용자 제공 표 기준 100 으로 진행.
- **`SchaleDBRegion.FindGiftMax`** — 까페 일일 선물 한도 (Jp/Global 14, Cn 13). v2 시뮬레이션에서 사용.
- **`SchaleDBItem.Category === 'Favor'`** — 52종. `ExpValue` (SR=20, SSR=60 / 일부 SSR=20), `Tags` (단축 코드 배열), `Quality` (3=SR, 4=SSR), `Rarity` (`'SR'` | `'SSR'`).
- **선호 배수 공식 (Phase 0 SchaleDB common.js 에서 추출)**: `ExpValue × (matchingCount + 1)`, max 4. 매칭 0=×1, 1=×2, 2=×3, 3+=×4. UI 라벨 `Cafe_Interaction_Gift_01..04`.

### 누락 데이터 (확보 필요)

| 항목 | 상태 |
|---|---|
| **인연 EXP 곡선** (랭크 N → N+1 누적 EXP) | ❌ SchaleDB / 일반 커뮤니티 raw repo 둘 다 미노출. **외부 출처 결정 필요 (OQ-8)** |

---

## 3. 게임 사양 요약 (개발자 관점)

- **인연랭크 범위**: 1 ~ 100 (사용자 제공 한섭 표 기준). SchaleDB config 의 50 은 무시.
- **랭크업 방식**: 누적 인연 EXP 가 임계 도달 시 +1. 한 번에 여러 랭크 점프 가능.
- **EXP 획득 경로** (계산 대상에 포함하는 것만 ✔):
  - ✔ **선물 (까페)** — 아이템 EXP × 선호 배수
  - ✖ 까페 머리쓰담쓰담 — 일일 한도 (`FindGiftMax`) + 무작위. 시뮬레이션 비-목표
  - ✖ 일정 보상, 시나리오 클리어, 스케줄 — 사용자가 직접 인연랭크 입력으로 반영
- **선호 배수 (Phase 0 SchaleDB common.js 검증)**:
  - 매칭 태그 수 = (학생 `FavorItemTags` ∪ `FavorItemUniqueTags` ∪ region 의 `CommonFavorItemTags`) ∩ (아이템 `Tags`) 의 크기
  - 배수 = `min(matchingCount + 1, 4)` — 매칭 0 = ×1, 1 = ×2, 2 = ×3, 3+ = ×4
  - UI 라벨: `Cafe_Interaction_Gift_01..04` (단계 1~4)
  - 정확한 합산 규칙 (Unique 가 가중인지, Common 이 별도 단계인지) 은 OQ-9 (§4) 에서 추가 검증
- **의상 학생**: 같은 캐릭터의 다른 의상은 **각각 독립된 인연랭크** 를 가짐. 플래너에서도 의상별로 별개 학생 카드로 처리, 각자 `bond` 입력. `FavorAlts` 필드는 계산에 사용하지 않음 (정보 표시 외).
- **인연 스탯 보너스**: 특정 랭크 구간에서 `FavorStatType` 의 스탯이 `FavorStatValue` 만큼 영구 증가. 정보 표시만, 계산에는 영향 없음.

---

## 4. 결정 사항 및 미해결 질문

### 결정된 사항

| # | 결정 |
|---|---|
| **OQ-1** | (Phase 0 해소) 배수 = `min(matchingCount + 1, 4)`. 1/2/3/4 4 단계. |
| **OQ-2** | 의상 학생은 **독립 처리**. 각 카드별로 `bond` 입력 받음. `FavorAlts` 는 계산에 안 씀. |
| **OQ-3** | 1차는 **×4 → ×3 → ×2 → ×1** 순 greedy (효율 우선). v2 에 사용자 토글 추가. |
| **OQ-4** | 애장품 ↔ 인연 재료는 **합쳐서 한 줄로 표시**, hover/툴팁으로 "애장품 N + 인연 M" 분해. |
| **OQ-5** | 1차는 **`BondMaxLevel = 100` 한섭 단일 기준**. 글섭/일섭 region 토글은 v2. |
| **OQ-6** | 인연 EXP 곡선은 **`data/planner/bond_exp.json` 하드카피**. |
| **OQ-7** | (Phase 0 해소) `FavorItemTags` / `Tags` / `ExpValue` 모두 SchaleDB 에 존재. plan B 불필요. |
| **OQ-8** | (Phase 0 해소) 인연 EXP 곡선 = 사용자 제공 사진 추출. §부록 A 참고. |
| **OQ-9** | (Phase 0 해소) `allTags = FavorItemTags ∪ FavorItemUniqueTags ∪ CommonFavorItemTags` 단순 union. 셋 다 동일하게 1점. SchaleDB `common.js:5333-5347, 9906-9942` 정독으로 확정. 추가 발견: 학생 페이지 "좋아하는 선물" UI 는 `favorGrade - genericTagCount > 0` 으로 필터 (Common 만 매칭은 표시 안 함, 단 EXP 계산에는 들어감). |

### 남은 미해결 질문

| # | 질문 | 결정 방법 | 차단 여부 |
|---|---|---|---|
| OQ-10 | `MemoryLobby: [6, 6, 6]` 의미. 각 region 별 메모리얼 로비 카운트인가, 해금 랭크 인덱스인가? | SchaleDB students 페이지 비교 → 표시 단계에서만 결정 | Phase 3 (UI 표시) |
| OQ-11 | 사진 표가 한섭 최신 인지 검증 필요 (게임 패치 이후로도 유효?) | 인게임 1회 비교 또는 위키 cross-check | 비차단, 패치 시 갱신 |

---

## 5. 도메인 모델

### 5.1 타입 추가 ([types/planner.ts](my-site/src/types/planner.ts))

```ts
/** 인연랭크 범위. 1 ~ 100 (한섭 기준, bond_exp.json 의 maxLevel). */
export interface BondRange {
  /** 현재 인연랭크 (1 ~ max) */
  current: number;
  /** 목표 인연랭크 (current ~ max) */
  target: number;
}

export interface PlannerTargets {
  // ... 기존 필드
  bond?: BondRange;
}
```

### 5.2 SchaleDB 타입 보강 ([types/schaledb.ts](my-site/src/types/schaledb.ts))

Phase 0 검증 결과를 반영:

```ts
export interface SchaleDBStudent {
  // ... 기존
  /** 학생 선호 선물 태그 — 예: ['ak', 'aV'] */
  FavorItemTags?: string[];
  /** 학생 고유 선호 태그 — 예: ['BD']. FavorItemTags 와 별도로 매칭 카운트에 추가 (OQ-9) */
  FavorItemUniqueTags?: string[];
  // FavorAlts 는 이미 선언되어 있음 (계산에는 미사용 — 의상 학생은 독립 처리)
}

export interface SchaleDBItem {
  // ... 기존
  /** Favor 아이템의 기본 인연 EXP — SR 20, SSR 60 (일부 SSR 20) */
  ExpValue?: number;
  /** 아이템 태그 — 대소문자 구분 단축 코드 */
  Tags?: string[];
  /** Favor 아이템 등급 — Q3 (SR) / Q4 (SSR) */
  Quality?: number;
}

export interface SchaleDBConfig {
  // ... 기존
  /** 모든 학생 공통 선호 태그 — 예: ['BC', 'Bc', 'ew'] */
  CommonFavorItemTags?: string[];
}

export interface SchaleDBRegion {
  // ... 기존
  /** 까페 일일 선물 한도 (Jp/Global 14, Cn 13) — v2 시뮬레이션용 */
  FindGiftMax?: number;
}
```

> 참고: `MemoryLobby` 는 우리 타입에 `number[]` 로 선언돼 있는데 실제 shape 가 `[6, 6, 6]` 같은 3-원소라 region 별 의미 검증 필요 (OQ-10). 본 PR 에서는 길이 0 또는 3 둘 다 받아들일 수 있도록 안전 접근만 함.

### 5.3 정적 데이터

새 파일 `my-site/src/data/planner/bond_exp.json` (기존 `student_level.json` 과 동일 구조):

```json
{
  "maxLevel": 100,
  "expDelta": [0, 0, 15, 30, 30, 35, 35, 35, 40, 40, 40, 60, 90, ...]
}
```

- `expDelta[i]` = 인연랭크 `(i-1) → i` 비용. `[0]`, `[1]` 은 placeholder (`studentExp.ts` 패턴과 동일).
- `utils/tables/bondExp.ts` 에서 `cumSum(expDelta)` → `CUMULATIVE_BOND_EXP[level] = 랭크 1 ~ level 총 EXP`.
- 출처: [자료/인랭 계산기/인랭 경험치 테이블.webp](자료/인랭%20계산기/인랭%20경험치%20테이블.webp). 전체 99개 delta 값은 §부록 A.

---

## 6. 계산 로직 설계

### 6.1 필요 EXP — 순수 함수

`cultivationCalculator.ts` 에 추가:

```ts
export function calculateBondExp(current: number, target: number): number {
  const max = CUMULATIVE_BOND_EXP.length;
  const from = clamp(current, 1, max);
  const to = clamp(target, from, max);
  return CUMULATIVE_BOND_EXP[to - 1] - CUMULATIVE_BOND_EXP[from - 1];
}
```

기존 `calculateLevelCost` 와 동일 패턴 ([cultivationCalculator.ts:84-96](my-site/src/service/planner/utils/cultivationCalculator.ts#L84-L96)).

### 6.2 학생별 선호도 분류 (Phase 0 검증 공식 반영)

OQ-9 해소 후 확정 — SchaleDB `common.js:5333-5347` 와 동일 로직:

```ts
function favorMultiplier(
  student: SchaleDBStudent,
  item: SchaleDBItem,
  commonTags: readonly string[],  // config.CommonFavorItemTags
): 1 | 2 | 3 | 4 {
  const allTags = new Set([
    ...(student.FavorItemTags ?? []),
    ...(student.FavorItemUniqueTags ?? []),
    ...commonTags,
  ]);
  const matchCount = (item.Tags ?? []).filter((t) => allTags.has(t)).length;
  return (Math.min(matchCount, 3) + 1) as 1 | 2 | 3 | 4;
}

function giftExp(item: SchaleDBItem, multiplier: number): number {
  return (item.ExpValue ?? 0) * multiplier;
}
```

세 태그 풀 (학생/Unique/Common) 모두 동일하게 1점씩 합산. cap 매칭 3 → 최대 배수 ×4.

**UI 표시 분기 (선택)**: 학생 카드의 "좋아하는 선물 보기" 라벨링은 SchaleDB 와 동일하게 `favorGrade - genericTagCount > 0` 조건으로 거르면 Common 만 매칭되는 일반 선물이 "좋아함" 라벨에 안 뜬다 (게임 UI 와 일치). EXP 계산에는 무관, 라벨링만 영향.

### 6.3 부족 → 권장 사용량 (greedy, OQ-3 = A)

`calculateBondGifts(student, current, target, inventory, commonTags) → { recommended, shortfallExp }`:

1. `neededExp = calculateBondExp(current, target)`.
2. 인벤토리의 모든 Favor 아이템을 `favorMultiplier` 로 분류 (1/2/3/4).
3. **greedy 순서**: ×4 → ×3 → ×2 → ×1. 같은 그룹 내에서는 효율 (`ExpValue × multiplier`) 큰 것부터, 효율 동률은 보유량 적은 것 우선 (소수 자원 먼저 소진).
4. 각 단계에서 보유량 한도 내에서 필요 EXP 까지 소비. 모자라면 다음 그룹으로 진행.
5. `recommended[itemId] = count` 로 권장량 누적. `shortfallExp` 는 인벤토리 다 써도 모자란 EXP (대부분 0 — ×1 선물이 흔하므로).

확장 포인트 (v2):
- `mode: 'efficient' | 'conserve-rare' | 'manual'` 파라미터로 우선순위 변경 가능하게 시그니처 미리 설계.

> 보유 인벤토리는 **애장품 강화와 공용**. 부족 패널에서 한 아이템의 총 필요량은 `애장품 필요 + 인연 권장` 으로 합산 (OQ-4 = A: 합치고 hover 분해).

### 6.4 통합 — `aggregateDeficit` 확장

기존 `aggregateDeficit` (필요 재료 집계 함수) 의 출력에 인연 권장량을 합쳐 넣는다.

- 각 학생의 `calculateBondGifts` 결과의 `recommended[itemId]` 를 **기존 애장품 필요량과 동일 itemId 슬롯에 합산**.
- 합산 시 출처 분해를 유지하기 위해 별도 메타 (`breakdown: { gear: number, bond: number }`) 를 함께 출력. UI 는 합계만 기본 노출하고 hover 시 breakdown 표시.
- 비-아이템 정보 (예: 학생별 필요 EXP / 권장 선물 개수) 는 `bond` 전용 출력 섹션에 별도 보관 — 부족 패널의 "인연 (권장 선물)" 그룹에서 사용.

---

## 7. UI / UX

### 7.1 학생 카드 ([components/StudentCard.tsx](my-site/src/service/planner/components/StudentCard.tsx))

기존 `GearTargetInput` / `WeaponStarInput` 들과 같은 자리에 `BondTargetInput` 한 줄 추가:

```
인연랭크  [  1 ▼ ] → [ 50 ▼ ]   (보너스: HP +1240, 공격 +320)
                                   다음 메모리얼 로비: 50랭크 (현재 18)
```

- 입력은 1 ~ `BondMaxLevel`. `current > target` 시 즉시 정합 (target = max(target, current)).
- 보너스 표시는 `FavorStatValue` 의 누적값 (목표 - 현재).
- 메모리얼 로비 다음 잠금 해제는 `MemoryLobby` 배열에서 next index 조회.
- 의상 학생도 독립이므로 별도 분기 없음. 모든 카드가 동일하게 인연 입력을 갖는다.

### 7.2 부족 패널 ([components/DeficitPanel.tsx](my-site/src/service/planner/components/DeficitPanel.tsx))

- 신규 섹션: **"인연 (권장 선물)"**. 학생별로 펼침 가능.
- 각 학생 행: `현재 → 목표  /  필요 EXP  /  권장 선물 N개 (love M / like K / neutral …)`
- 아이템 단위 필요량은 **기존 애장품 합산 라인에 통합** (출처 breakdown 은 hover/툴팁).
- 한 아이템 줄 hover 예시:
  ```
  분홍색 큰 곰돌이 인형 × 12개 부족
    └ 애장품: 8개
    └ 인연 (권장): 4개
  ```

### 7.3 인벤토리 페이지 영향 — 없음

`gear-favor` 그룹이 이미 동일 아이템을 다루므로 신규 입력 항목 없음. hint 텍스트만 "애장품 강화 + 인연랭크에 공용" 으로 갱신.

---

## 8. DB 스키마 영향

**없음**. `planner_students.targets` 는 `jsonb` 이므로 `bond` 키 추가는 무마이그레이션. 기존 row 는 `targets.bond === undefined` 로 자연스럽게 호환.

`localPlannerRepository` 도 동일 — 직렬화 그대로.

백업 / 동기화 파이프라인 ([lib/sync.ts](my-site/src/lib/sync.ts), [utils/plannerBackup.ts](my-site/src/service/planner/utils/plannerBackup.ts)) 도 jsonb 통째로 옮기는 구조라 별도 변경 불필요.

---

## 9. 단계별 작업

### Phase 0 — 데이터 검증 ✅ 완료 (2026-05-17)

- [x] SchaleDB raw JSON 4종 다운로드 + 점검
- [x] `FavorItemTags` / `FavorItemUniqueTags` / `FavorStatType` / `MemoryLobby` / `FavorAlts` 학생 객체 실재 확인
- [x] `ExpValue` / `Tags` / `Quality` / `Rarity` 아이템 객체 실재 확인 (52/52 Favor)
- [x] `CommonFavorItemTags` config 전역 발견
- [x] 선호 배수 공식 `ExpValue × min(matchingCount+1, 4)` SchaleDB common.js 에서 추출 → OQ-1 해소
- [x] 인연 EXP 곡선 위치 점검 → SchaleDB 미노출 확인 후 사용자 제공 사진에서 1~100 전체 확보 (OQ-8 해소). **BondMaxLevel = 100 (한섭 기준)**
- [x] 사진 표 vs SchaleDB 매칭 공식 cross-check (SR 80=×4, SSR 240=×4) → 일치
- [x] **OQ-9 해소**: SchaleDB `common.js:5333-5347, 9906-9942` 정독 → 셋 다 단순 union, 동일 가중. UI 라벨링 분기 추가 발견.

### Phase 1 — 타입 + 정적 데이터

- [ ] `SchaleDBStudent.FavorItemTags` 타입 보강 (`FavorAlts` 는 이미 있음, 인연 계산에 미사용)
- [ ] `SchaleDBItem.ExpValue`, `Tags` 타입 보강
- [ ] `BondRange`, `PlannerTargets.bond` 추가
- [ ] `data/planner/bond_exp.json` + `utils/tables/bondExp.ts`
- [ ] `types/index.ts` 배럴 갱신

### Phase 2 — 순수 계산기

- [ ] `cultivationCalculator.ts` 에 `calculateBondExp`, `classifyGift`, `calculateBondGifts` 추가
- [ ] `calculateBondGifts` 시그니처에 `mode?: 'efficient'` 파라미터 미리 둠 (v2 토글 대비)
- [ ] 단위 테스트 — 현재는 테스트 인프라가 없으므로 검증은 `PlannerStudentDetailPage` 디버그 UI 로 수동

### Phase 3 — UI 입력

- [ ] `BondTargetInput.tsx` 작성 — `LevelTargetInput` 패턴 답습
- [ ] `StudentCard` 에 슬롯 추가 (다른 입력들과 동일 자리). 의상 분기 없음, 모든 카드 동일.
- [ ] `PlannerStudentDetailPage` 에도 동일 입력 + `FavorStatValue` / `MemoryLobby` 부가 정보 표시

### Phase 4 — 권장 선물 계산 + 부족 패널

- [ ] `aggregateDeficit` 에 인연 결과 합치기. 출력에 `breakdown: { gear, bond }` 메타 포함.
- [ ] `DeficitPanel` 의 아이템 줄에 hover/툴팁으로 breakdown 분해 표시
- [ ] `DeficitPanel` 신규 섹션 "인연 (권장 선물)" — 학생별 펼침
- [ ] 인벤토리 페이지 `gear-favor` hint 를 "애장품 + 인연 공용" 으로 갱신

### Phase 5 — 마무리 ✅ 완료 (2026-05-17)

- [x] 백업 JSON 마이그레이션 안전성 확인 — `parseBackup` 이 `targets.level` 만 검증, `bond` 부재 시 단순 `undefined` 로 import. `aggregateAllWithBond` 의 `if (ps.targets.bond)` 가드로 안전. BACKUP_VERSION 유지 (옵셔널 필드 추가는 호환).
- [x] CLAUDE.md 갱신 — `types/planner.ts` 줄에 `bond` + `BondRange` 추가, "Cultivation planner notes" 섹션에 인연 통합 항목 추가 (매칭 공식, EXP 곡선 출처, 의상 학생 독립 처리 명시).
- [x] `STATUS_cultivation_planner.md` 갱신 — §1 표에 "PR#9 — 인연랭크(Bond) 통합 ✅" 추가, §4.2 의 호감도 줄을 완료 상태로 갱신.

---

## 10. 위험 / 함정

1. **재료 공유 일관성** — 같은 선물 아이템을 애장품 강화와 인연 양쪽에서 소비. 사용자가 "이 아이템 N개 필요" 라고 봤을 때 양쪽 합산임이 보여야 함. UI 가 출처 breakdown 을 hover 로 분해 표시.
2. **선호도 룰 검증 부족 시 잘못된 권장** — Phase 0 의 OQ-1 검증을 건너뛰면 권장 수량이 실제와 어긋남. 검증 전엔 "권장" 만 보여주고 "부족" 단정은 보류.
3. **SchaleDB 필드 부재 가능성 (OQ-7)** — `FavorItemTags` / `ExpValue` / `Tags` 가 SchaleDB JSON 에 실제로 없거나 이름이 다를 수 있음. Phase 0 에서 plan B = 모든 선물을 `neutral` 로 취급 (선호도 미반영), `ExpValue` 가 없으면 등급별 하드코딩 (R 20 / SR 60 / SSR 120 / UR 240) 대체.
4. **`BondMaxLevel` 가 region 별로 다름** — config.min.json 의 Regions[0] 한섭 기준만 1차 지원. 글섭/일섭 사용자가 보면 입력 캡이 안 맞을 수 있음. v2 region 토글로 해결.
5. **v2 토글 호환** — `calculateBondGifts` 시그니처에 `mode` 파라미터를 처음부터 두지 않으면 사용자 선택 모드를 나중에 끼워 넣을 때 호출처 전부 수정해야 함 → Phase 2 에서 옵셔널 파라미터로 미리 받기.

---

## 11. 작업량 추산

| Phase | 추산 |
|---|---|
| 0 (검증) | 1 ~ 2시간 — SchaleDB raw JSON 점검 + 게임 인게임 1회 |
| 1 (타입 / 정적) | 30분 |
| 2 (계산기) | 2 ~ 3시간 |
| 3 (UI 입력) | 2시간 |
| 4 (부족 통합) | 3 ~ 4시간 — OQ-4 결정 후 |
| 5 (정리) | 30분 |

**합계: ~10시간**. 단일 PR 로 가능하나, Phase 0 결과에 따라 OQ-1/3/4 가 갈리므로 Phase 0 만 먼저 처리 → 본 문서 갱신 → 본격 구현 권장.

---

## 12. 후속 (이번 PR 밖)

- **권장 선물 모드 토글** (OQ-3 v2) — "효율 우선" / "UR 절약" / 학생별 수동 지정. `calculateBondGifts` 의 `mode` 파라미터 활성화
- 까페 머리쓰담쓰담 일일 한도 시뮬레이션 — 까페 가구 / 동시 입장 슬롯 수까지 계산해야 해서 별도 PLAN 필요
- 메모리얼 로비 자체 (이미지/영상 링크) 표시 — 데이터 소스 별개
- 글섭/일섭 region 토글 (OQ-5)
- 일정(스케줄) 인연 보상 — 일정 시간 + 좋아하는 학생 매칭 시뮬레이션
- 인연 EXP "예산" 모드 — "이만큼의 선물을 갖고 있는데 어디까지 올릴 수 있나" 역계산
- 의상 학생 간 "다른 의상 보기" 링크 — `FavorAlts` 를 비계산 용도로 활용

---

## 부록 A — 인연 EXP delta 표 (한섭, 1 → 100)

출처: [자료/인랭 계산기/인랭 경험치 테이블.webp](자료/인랭%20계산기/인랭%20경험치%20테이블.webp)

`expDelta[i]` = 인연랭크 `(i-1) → i` 에 필요한 EXP. `[0]` / `[1]` 은 placeholder.

```json
{
  "maxLevel": 100,
  "expDelta": [
    0, 0,
    15, 30, 30, 35, 35, 35, 40, 40, 40,
    60, 90, 105, 120, 140, 160, 180, 205, 230, 255,
    285, 315, 345, 375, 410, 445, 480, 520, 560, 600,
    645, 690, 735, 780, 830, 880, 930, 985, 1040, 1095,
    1155, 1215, 1275, 1335, 1400, 1465, 1530, 1600, 1670, 1740,
    1815, 1890, 1965, 2040, 2120, 2200, 2280, 2365, 2450, 2535,
    2625, 2715, 2805, 2895, 2990, 3085, 3180, 3280, 3380, 3480,
    3585, 3690, 3795, 3900, 4010, 4120, 4230, 4345, 4460, 4575,
    4695, 4815, 4935, 5055, 5180, 5305, 5430, 5560, 5690, 5820,
    5955, 6090, 6225, 6360, 6500, 6640, 6780, 6925, 7070, 7215
  ]
}
```

### 누적 검증 (랜덤 샘플링)

| 랭크 | `cumSum(expDelta)[level]` | 사진 누적 | ✓ |
|---:|---:|---:|:-:|
| 2 | 15 | 15 | ✓ |
| 10 | 300 | 300 | ✓ |
| 25 | 3,575 | 3,575 | ✓ |
| 50 | 29,175 | 29,175 | ✓ |
| 75 | 100,250 | 100,250 | ✓ |
| 100 | 240,225 | 240,225 | ✓ |

랭크 100 → 101 delta (사진 마지막 행 두번째 컬럼 7,365) 는 max 도달 후라 사용 안 함 → expDelta 길이는 101 (0~100).

### 사진의 부가 정보 (이번 PR 비-목표 — v2 후속용 메모)

- **고급 선물 EXP**: 240 / 180 / 120 / 60 (×4 / ×3 / ×2 / ×1) → SchaleDB SSR `ExpValue = 60` × 매칭배수 일치
- **일반 선물 EXP**: 80 / 60 / 40 / 20 → SchaleDB SR `ExpValue = 20` × 매칭배수 일치
- 단, "꽃다발, 기념카드, 포토카드 등 이벤트 지급 고급선물은 일반선물과 수치가 같다" — 일부 SSR 의 ExpValue=20 예외 2종 (Phase 0 §1 검증) 와 부합
- **스케줄 인연 EXP**: 지역 레벨 1~10 = 15, 11 = 20, 12 = 25, 12렙 보너스 시 50 (×2)
- **까페 쓰다듬기**: 15 EXP / 회
