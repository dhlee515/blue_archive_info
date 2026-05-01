# 육성 플래너 v2 — 범위 재정의 및 갭 분석

> 작성일: 2026-04-29
>
> 선행 문서: [PLAN_cultivation_planner.md](PLAN_cultivation_planner.md) (초기 설계), [STATUS_cultivation_planner.md](STATUS_cultivation_planner.md) (현재 진행 현황)
>
> **이 문서의 목적** : 사용자가 제시한 학생 육성 5개 영역(레벨/장비/스킬/고유무기/WB)에 **고유장비(Gear)** 를 더한 **6개 영역** 을 기준으로 현재 구현을 재검토하고, **무엇이 잘못 들어가 있는지 / 무엇이 구현되어 있는지 / 무엇을 수정해야 하는지 / 무엇이 미구현인지** 를 정리하여 후속 작업 계획을 수립한다.
>
> **2026-04-29 결정 사항** : 고유장비(Gear) 는 사용자 리스트엔 명시되지 않았지만 **유지** (옵션 A). 학생별 T1~T3 강화는 게임 내 명백한 육성 축이며, 재료(애착선물·오파츠)도 다른 자원과 분리되어 있어 플래너 가치가 큼.

---

## 0. 용어 정합성 (가정)

사용자가 제시한 영역 명칭과 SchaleDB / 게임 시스템 / 코드 식별자의 매핑.

| 사용자 명칭 | 본 문서에서 사용하는 용어 | SchaleDB 필드 / 데이터 | 비고 |
|---|---|---|---|
| 레벨 | 학생 레벨 | `students` 의 `MaxHP`/`AttackPower` 등 (레벨 비용 자체는 SchaleDB 미호스팅 → 하드코딩) | ✅ |
| 장비 | 일반 장비 | `equipment.min.json` (Recipe + Tier + Category) | ✅ |
| 스킬 (EX = BD) | EX 스킬 — 비용에 BD(`Material/CDItem`) 포함 | `students.SkillExMaterial[Amount]` | ✅ 사용자 확정 (2026-04-29) |
| 스킬 (일반 = 기술 노트) | Normal/Passive/Sub 스킬 — 비용에 기술 노트(`Material/BookItem`) 포함 | `students.SkillMaterial[Amount]` | ✅ 사용자 확정 (2026-04-29) |
| 고유무기 | 고유무기 (성급업 엘레프 + 레벨업 신명석 통합) | `students.Weapon` (재료 미호스팅), 레벨업/성급 모두 하드코딩 | ✅ |
| **WB** | **잠재력 강화 (Potential)** — 스탯별 강화석 = items id `2000`(체력) / `2001`(공격) / `2002`(치명), Category=Material | `students.PotentialMaterial` (= 학생별 보조 오파츠 단일 id) + WB 3종 + 단계별 비용 (SchaleDB 미호스팅 → 하드코딩 필요) | ✅ 사용자 확정 (2026-04-29). 데이터 shape 검증 (2026-04-29) — 추정과 다름 (§9 참조) |

> **사용자 리스트에 명시되지 않은 영역 — 추가 포함 확정**
> - **고유장비(Gear)** : 학생별 T1~T3 강화. 사용자 리스트엔 없으나 **유지 결정 (옵션 A, 2026-04-29)**. PLAN v1 + 구현 모두 포함되어 있어 추가 작업 없음. 일반 장비 (사용자 #2 — `equipment.min.json` 의 카테고리 슬롯) 와는 별개 시스템이며 재료도 분리됨 (애착선물 + 오파츠 vs 설계도면).

---

## 1. 사용자 정의 영역 ↔ 현재 구현 매트릭스

### 1.1 영역별 재화 매핑

| # | 영역 | 사용자 정의 재화 | 현재 계산기 출력 키 | 현재 인벤토리 그룹 | 구현 상태 |
|---|---|---|---|---|---|
| 1 | **레벨** | 크레딧 + 활동 보고서 | `credit`, `student_exp` | `synthetic` | ✅ 구현 완료 |
| 2 | **장비** (일반) | 크레딧 + 티어 설계도 | `credit`, piece eq id | `synthetic`, `pieces-{Cat}` | ✅ 구현 완료 |
| 3 | **스킬** | 크레딧 + 오파츠 + EX(BD) + 일반(기술 노트) | — | — | ❌ **미구현** |
| 4 | **고유무기** (성급+레벨) | 크레딧 + 고유무기 재료 (엘레프 + 신명석) | `credit`, `weapon_exp` | `synthetic` | ⚠️ **부분** — 레벨업만, 성급업 미구현 |
| 5 | **WB** (잠재력 추정) | 크레딧 + 오파츠 + 스탯별 WB | — | — | ❌ **미구현** |
| 6 | **고유장비(Gear)** | 애착선물 + 오파츠 + 크레딧 | gear material id, `credit` | `gear-favor`, `artifacts`, `gear-other` | ✅ 구현 완료 (옵션 A 유지 확정) |

### 1.2 영역별 구현 레이어 체크

각 영역이 데이터 ↔ 타입 ↔ 계산기 ↔ UI ↔ 인벤토리 카탈로그 까지 일관되게 연결되어 있는지.

| 영역 | 데이터 (SchaleDB / 하드코딩) | `PlannerTargets` 필드 | 계산기 함수 | 입력 UI | 카탈로그 그룹 |
|---|---|---|---|---|---|
| 1. 레벨 | ✅ [student_level.json](my-site/src/data/planner/student_level.json) | ✅ `level` | ✅ `calculateLevelCost` | ✅ [LevelTargetInput](my-site/src/service/planner/components/LevelTargetInput.tsx) | ✅ synthetic |
| 2. 장비 | ✅ SchaleDB equipment | ✅ `equipment` | ✅ `calculateEquipmentCost` | ✅ [EquipmentTargetInput](my-site/src/service/planner/components/EquipmentTargetInput.tsx) | ✅ pieces-{Cat} |
| 3. 스킬 | ✅ shape 확정 (§9) — `SkillMaterial: number[][]` 일반 8행, `SkillExMaterial: number[][]` EX 4행. [types/schaledb.ts](my-site/src/types/schaledb.ts) 에 **타입 누락 — 보강 필요** | ❌ 없음 | ❌ 없음 | ❌ 없음 | ❌ 없음 |
| 4-a. 고유무기 레벨업 | ✅ [weapon_level.json](my-site/src/data/planner/weapon_level.json) | ✅ `weapon` | ✅ `calculateWeaponCost` | ✅ [WeaponTargetInput](my-site/src/service/planner/components/WeaponTargetInput.tsx) | ✅ synthetic (`weapon_exp`) |
| 4-b. 고유무기 성급업 | ✅ [weapon_star.json](my-site/src/data/weapon_star.json) + [weaponStar.ts](my-site/src/service/planner/utils/tables/weaponStar.ts). **엘레프 매핑 = `student.Id == item.Id`** (§9 검증 완료) | ❌ `star` 없음 | ❌ 없음 | ❌ 없음 | ❌ 학생별 엘레프 그룹 없음 |
| 5. WB (잠재력) | ⚠️ SchaleDB `PotentialMaterial` = **단일 number** (학생별 보조 오파츠 id). **단계별 비용 테이블은 SchaleDB 미호스팅 — 신규 하드코딩 필요** (§9, §5.2) | ❌ 없음 | ❌ 없음 | ❌ 없음 | ❌ 없음 |
| 6. 고유장비(Gear) | ✅ SchaleDB `students.Gear.TierUpMaterial` | ✅ `gear` | ✅ `calculateGearCost` | ✅ [GearTargetInput](my-site/src/service/planner/components/GearTargetInput.tsx) | ✅ gear-favor / artifacts |

---

## 2. 잘못된 부분 (현재 구현이 사용자 의도와 어긋나는 곳)

### 2.1 ⚠️ 고유무기를 "레벨업" 만 다루고 있음

사용자는 "고유무기 → 크래딧 + 고유무기 재료" 로 통합 표현했지만, 게임 메커니즘상 **고유무기 재료** 는 두 가지로 분리된다:
- **신명석류** (무기 EXP): 고유무기 레벨 1→60 까지 누적 EXP
- **학생 고유 엘레프**: 고유무기 성급업 (학생 5성=전무 1성 → 전무 4성)

현재 [WeaponTargetInput](my-site/src/service/planner/components/WeaponTargetInput.tsx) 은 **레벨만** 입력받음. 성급업(전무 1~4성) 에 필요한 엘레프는 데이터([weapon_star.json](my-site/src/data/weapon_star.json))만 추가되고 어디에도 연결 안 됨.

→ "고유무기 = 레벨업 + 성급업" 통합 입력 UI 가 필요.

### 2.2 ⚠️ 학생 레벨 외에 학생 성급업(1→5성) 자체가 누락

사용자 리스트의 **4. 고유무기** 가 "성급업" 까지 포함한다고 보면, 학생 1성 → 5성 (학생 본체 성급) 도 같은 엘레프를 사용하므로 함께 계산해야 한다. [weaponStar.ts](my-site/src/service/planner/utils/tables/weaponStar.ts) 의 `WEAPON_STARS` 는 1~8 단계로 학생 성급(1~4) + 5성 달성 + 전무(2~4) 를 통합하고 있음 → 데이터 구조는 통합되어 있으나 UI/계산기 미연결.

### 2.3 ✅ 고유장비(Gear) 범위 결정 — 유지 확정

사용자 5영역 리스트에 명시되지 않았으나 **옵션 A (유지) 로 결정** (2026-04-29). 추가 작업 없음.

→ 잘못된 부분이 아닌 **정상 구현** 으로 분류. §3 으로 이동.

### 2.4 ⚠️ Synthetic 키 단일화로 등급별 환산 정보 손실

현재 `student_exp` / `weapon_exp` 한 키로 모든 등급(입문/초급/중급/상급 보고서, 광휘/예지/지각의 신명석)을 통합. 사용자 입력 시 환산해서 합쳐 입력해야 함. 잘못 환산 시 결과 오차.

→ **잘못된 것은 아님**. PLAN v1 §8.4 의 의도된 단순화. 다만 사용자 친화도를 높이려면 등급별 입력 → 자동 합산이 더 나음.

---

## 3. 구현되어 있는 것 (확정)

✅ **레벨** (#1) : 데이터 → 타입 → 계산 → UI → 인벤토리 매핑까지 일관 완성
✅ **일반 장비** (#2) : 동일하게 일관 완성. Recipe 재귀 풀어 piece 까지 평탄화
✅ **고유무기 레벨업** (#4 의 절반): 신명석 EXP + 크레딧 일관 완성
✅ **고유장비(Gear)** (#6, 옵션 A 유지): 사용자 리스트 외 항목이지만 유지 결정. 학생별 T1~T3 강화, 애착선물 + 오파츠 일관 완성

---

## 4. 수정해야 할 것 (기존 코드 보완)

### 4.1 고유무기 성급업(엘레프) 통합

§9 검증 결과 학생별 엘레프 매핑이 매우 단순 (`student.Id == eleph item.Id`) 으로 확인되어 별도 헬퍼 거의 불필요.

| 작업 | 파일 |
|---|---|
| `PlannerTargets` 에 `weaponStar?: { current: number; target: number }` 추가 (1~8 단계) | [types/planner.ts](my-site/src/types/planner.ts) |
| `calculateWeaponStarCost(student, range): RequiredMaterials` — `CUMULATIVE_ELEPH[target] - CUMULATIVE_ELEPH[current]` 를 `String(student.Id)` 키 (= 엘레프 item id) 로 출력 | [cultivationCalculator.ts](my-site/src/service/planner/utils/cultivationCalculator.ts) |
| `aggregatePerStudent` 호출 추가 | 동상 |
| 입력 UI — `WeaponTargetInput` 에 성급 셀렉터 추가 또는 별도 `WeaponStarInput` 컴포넌트 분리. 8단계 라벨은 [weaponStar.ts](my-site/src/service/planner/utils/tables/weaponStar.ts) `WEAPON_STARS` 의 `label` 사용 | [components/](my-site/src/service/planner/components/) |
| 인벤토리 카탈로그에 `eleph` 그룹 (플래너 학생들의 엘레프 id 합집합 = 그 학생들의 student id 들) — Category="SecretStone" 으로 필터하거나 직접 학생 id 리스트 활용 | [inventoryCatalog.ts](my-site/src/service/planner/utils/inventoryCatalog.ts) |
| 학생 성급 1~4성 도 같은 엘레프 사용 → `WEAPON_STARS` 1~8 통합 활용 (이미 데이터에 통합됨) | — |

### 4.2 (선택) Synthetic 키의 등급별 입력 분리

- 현재: `student_exp` 단일 키
- 개선안: 인벤토리에서 보고서 등급별로 입력 (입문/초급/중급/상급) → 자동 합산하여 `student_exp` 비교
- 신명석도 동일 (광휘/예지/지각)
- 등급별 EXP 환산 상수 추가 필요

---

## 5. 미구현 항목 (신규 추가)

### 5.1 ❌ 스킬 (사용자 영역 #3)

**재화** (§9 검증 완료):
- 일반 스킬 (Normal/Passive/Sub): 기술 노트 (`Material/BookItem`, items id 4000~4103) + 오파츠 + 크레딧
- EX 스킬: BD (`Material/CDItem`, items id 3000~3103) + 오파츠 + 크레딧

**SchaleDB shape (§9 검증 완료)**:
- `SkillMaterial: number[][]` — **8행** (일반 스킬 단계). 각 행이 단계별 재료 id 배열, 행간 길이 가변(예: `[4030]` ~ `[4032, 152, 151, 150]`)
- `SkillMaterialAmount: number[][]` — 1:1 대응 수량
- `SkillExMaterial: number[][]` — **4행** (EX 스킬 단계, 1~5 → 4구간)
- `SkillExMaterialAmount: number[][]` — 동상

**필요 작업**:

| 작업 | 산출물 |
|---|---|
| `SchaleDBStudent` 타입 보강 — 위 4개 필드 정확한 shape 으로 추가 | [types/schaledb.ts](my-site/src/types/schaledb.ts) |
| `PlannerTargets` 에 `skills?: { ex: { current: number; target: number }; normal: ...; passive: ...; sub: ... }` 추가 | [types/planner.ts](my-site/src/types/planner.ts) |
| `calculateSkillCost(student, type, range): RequiredMaterials` — `SkillMaterial[k]` × `SkillMaterialAmount[k]` 를 `current` ~ `target-1` 인덱스 구간 합산 | [cultivationCalculator.ts](my-site/src/service/planner/utils/cultivationCalculator.ts) |
| ⚠️ **추가 검증** : 일반 스킬 8행 ↔ 게임 내 단계 매핑 — 일반 스킬은 통상 1~10 + Mastery, 8행이 1→9 까지인지 다른 매핑인지 SchaleDB UI 와 대조 필요. PR 첫 단계에서 아루 학생 페이지 (https://schaledb.com/student/aru) 의 표시값과 비교 | — |
| 입력 UI — `SkillTargetInput` (4개 트랙: EX/Normal/Passive/Sub) | 신규 컴포넌트 |
| 인벤토리 카탈로그 그룹 — `skill-books` (Material/BookItem, id 4000~4103) / `skill-cd` (Material/CDItem, id 3000~3103). 오파츠는 기존 `artifacts` 그룹과 통합 — 고유장비 + 스킬 공용 표기 | [inventoryCatalog.ts](my-site/src/service/planner/utils/inventoryCatalog.ts) |

### 5.2 ❌ WB / 잠재력 강화 (사용자 영역 #5) — **모델 재설계 (§9 발견)**

**§9 의 핵심 발견 — 기존 추정 폐기**:

당초 `PotentialMaterial: number[][][]` (스탯 × 단계 × 재료) 를 가정했으나 **틀렸음**. 실제 SchaleDB:
- `students.PotentialMaterial: number` — 단일 number (예: 아루 = 150 = "로혼치 사본 페이지" 오파츠). **학생별 보조 오파츠 1종을 가리킴**
- 잠재력 강화석 (WB) 3종은 **학생 JSON 이 아닌 items.min.json 에 별도 존재** :
  - id `2000` = "교양 체육 WB" (체력)
  - id `2001` = "교양 사격 WB" (공격)
  - id `2002` = "교양 위생 WB" (치명)
- **스탯 3종은 학생별이 아닌 사용자 선택** — 한 학생을 어느 스탯으로 잠재력 올릴지 사용자가 결정
- **단계별 누적 비용 테이블 (WB / 오파츠 / 크레딧 수량) 은 SchaleDB 미호스팅** → **신규 하드코딩 데이터 필요**

**재화 모델 (재정립)**:
- 잠재력 1단계 강화 비용 = `WB_n 개 (스탯에 해당하는 1개)` + `학생별 오파츠 (PotentialMaterial 가리키는 id) m 개` + `credit k`
- 1~25 단계 누적 (config.Regions[*].PotentialMax = 25)
- 한 학생당 스탯 3종 각각 1~25 → 3트랙 누적

**§9 추가 검증 결과 (2026-04-29)** — 오파츠 시리즈 구조 + 학생별 매핑 확정:
- 각 오파츠 시리즈 = 4개 id 연속 (Rarity N→R→SR→SSR). 예: 150="로혼치 사본 페이지"(N) / 151=파손된(R) / 152=마모된(SR) / 153=온전한(SSR)
- **하급 오파츠 id** = `student.PotentialMaterial` (Rarity N)
- **일반 오파츠 id** = `student.PotentialMaterial + 1` (Rarity R)
- 잠재력 강화에는 N + R 두 등급만 사용 (SR/SSR 미사용)
- 단계별 비용은 모든 학생/스탯 공통

**필요 작업**:

| 작업 | 산출물 |
|---|---|
| ✅ 신규 데이터 — 잠재력 단계별 비용 테이블 | [data/planner/potential_level.json](my-site/src/data/planner/potential_level.json) **작성 완료** (2026-04-29, 합계 검증 통과) |
| 모듈 — `potential_level.json` import + `cumSum` 누적 | 신규 `service/planner/utils/tables/potentialLevel.ts` |
| `SchaleDBStudent` 타입 보강 — `PotentialMaterial?: number` | [types/schaledb.ts](my-site/src/types/schaledb.ts) |
| `PlannerTargets` 에 `potential?: { attack: { current: number; target: number }; maxhp: ...; healing: ... }` (스탯 3트랙) | [types/planner.ts](my-site/src/types/planner.ts) |
| `calculatePotentialCost(student, stat, range)` — 스탯에 따라 WB id (2000/2001/2002) 선택 + 학생별 오파츠 (`pm` / `pm+1`) 수량 + 크레딧 | [cultivationCalculator.ts](my-site/src/service/planner/utils/cultivationCalculator.ts) |
| 입력 UI — `PotentialTargetInput` (3 스탯 트랙) | 신규 컴포넌트 |
| 인벤토리 카탈로그 그룹 — `potential-wb` (id 2000/2001/2002). 오파츠는 기존 `artifacts` 그룹 재사용 | [inventoryCatalog.ts](my-site/src/service/planner/utils/inventoryCatalog.ts) |

### 5.3 (선행) `SchaleDBStudent` 타입 보강 일괄

§5.1 / §5.2 가 의존하는 공통 작업. §9 검증 결과로 **shape 이 확정** 됨:

```ts
// types/schaledb.ts
export interface SchaleDBStudent {
  // ... 기존
  SkillMaterial?: number[][];           // 일반 스킬 — 8행, 각 행은 단계별 재료 id 배열 (가변 길이)
  SkillMaterialAmount?: number[][];     // 1:1 대응 수량
  SkillExMaterial?: number[][];         // EX 스킬 — 4행
  SkillExMaterialAmount?: number[][];   // 동상
  PotentialMaterial?: number;           // 학생별 보조 오파츠 단일 id (예: 아루=150)
}
```

추가 타입 변경:
- 잠재력 비용 테이블은 SchaleDB 미호스팅 → 신규 인터페이스 (`PotentialLevelTable`) 추가 in [types/planner.ts](my-site/src/types/planner.ts) 또는 [tables/potentialLevel.ts](my-site/src/service/planner/utils/tables/potentialLevel.ts) 모듈 내부

✅ WebFetch 검증 완료 (2026-04-29). 추가 SchaleDB 페치 불필요.

---

## 6. 후속 작업 계획 (PR 단위)

기존 PLAN v1 의 PR#1~#8 은 working tree 에 모두 반영됨([STATUS_cultivation_planner.md](STATUS_cultivation_planner.md) §1). v2 는 그 다음 단계.

### Phase A — MVP 정리 및 누락 보완 (먼저 정리)

- **PR-V2#1** : `PlannerTargets.weaponStar` 추가 + 학생별 고유 엘레프 매핑 헬퍼 + `calculateWeaponStarCost` + UI + 인벤토리 카탈로그 `eleph` 그룹 → 영역 #4 완성 (§4.1)
- (고유장비 제거 PR 은 옵션 A 채택으로 **삭제됨**)

### Phase B — 스킬 영역 추가 (사용자 영역 #3)

- **PR-V2#2** : `SchaleDBStudent` 타입 보강 (§5.3) + SchaleDB 실데이터 shape 검증
- **PR-V2#3** : 일반 스킬 (Normal/Passive/Sub) 계산 + UI + 카탈로그 `skill-books`
- **PR-V2#4** : EX 스킬 계산 + UI + 카탈로그 `skill-cd`

### Phase C — 잠재력 영역 추가 (사용자 영역 #5)

- ✅ **PR-V2#5 (데이터 부분)** : [data/planner/potential_level.json](my-site/src/data/planner/potential_level.json) 작성 완료 (2026-04-29)
- **PR-V2#5 (모듈 부분)** : `tables/potentialLevel.ts` import + `cumSum` 누적
- **PR-V2#6** : 잠재력 계산 (스탯 3종) + UI `PotentialTargetInput` + 카탈로그 `potential-wb` 그룹
- **PR-V2#7** : 통합 검증 + 인벤토리 카탈로그 그룹 정리 + 안내 텍스트(중간 티어 보유 무시 등)

### Phase D — 마감 작업

- **PR-V2#8** : 보안 체크리스트 (RLS / cascade / unique 위반) 실측 — [STATUS_cultivation_planner.md](STATUS_cultivation_planner.md) §3.1
- **PR-V2#9** : DnD 정렬 + 초기화 버튼 (PLAN v1 §11.1 잔여)
- **PR-V2#10** : `config.min.json` 동적 페치하여 Region(Global=index 1) 의 상한값을 input UI 에 반영 (현재는 하드코딩)
- **PR-V2#11** : 등급별 EXP 환산 (선택 — §4.2)

---

## 7. 사용자 확인이 필요한 사항

작업 시작 전에 확정되어야 하는 결정.

- [x] **"WB" = 잠재력 강화 (PotentialMaterial, 공/체/치 3종)** — 사용자 확정 (2026-04-29)
- [x] **EX 스킬 "BD" = `Material/CDItem`** — 사용자 확정 (2026-04-29)
- [x] **일반 스킬 "기술 노트" = `Material/BookItem`** — 사용자 확정 (2026-04-29)
- [x] **고유장비(Gear) 포함 여부 = 옵션 A 유지** — 사용자 확정 (2026-04-29). 학생별 T1~T3 강화는 게임 내 명백한 육성 축, 재료(애착선물·오파츠)도 다른 영역과 분리됨
- [ ] **등급별 EXP 환산 분리** 를 v2 범위에 넣을지 (영향 범위 작지만 UX 개선 효과 큼)

→ **모든 핵심 결정 확정됨**. Phase A 부터 즉시 착수 가능.

---

## 8. 종합 요약

### 무엇이 잘못되어 있나
- 고유무기에서 **레벨업만** 다루고 성급업 엘레프 미반영 (§2.1)
- 등급별 EXP 환산이 단일 키로 통합되어 사용자가 환산해야 함 (§2.4 — 의도된 단순화이지만 UX 개선 여지)

### 무엇이 구현되어 있나 (✅)
- **레벨** (#1)
- **일반 장비** (#2)
- **고유무기 레벨업** (#4 의 절반)
- **고유장비(Gear)** (#6 — 옵션 A 유지 확정)

### 무엇을 수정해야 하나 (⚠️)
- 고유무기 성급업(엘레프) 통합 (§4.1) — 데이터는 이미 있음
- (선택) 등급별 EXP 환산 분리 (§4.2)

### 무엇이 미구현인가 (❌)
- **스킬** (#3) — Phase B
- **WB / 잠재력** (#5) — Phase C
- 학생 카드 DnD 정렬 / 초기화 버튼 (PLAN v1 잔여)
- RLS / 마이그레이션 실측 검증 ([STATUS_cultivation_planner.md](STATUS_cultivation_planner.md) §3.1)

---

## 9. 데이터 검증 결과 (2026-04-29 WebFetch)

PR 시작 전 SchaleDB 3개 엔드포인트를 페치하여 가정을 검증함.

### 9.1 검증 대상 엔드포인트

| URL | 목적 |
|---|---|
| `https://schaledb.com/data/kr/students.min.json` | 학생 JSON shape — Skill/Potential/엘레프 필드 |
| `https://schaledb.com/data/kr/items.min.json` | items 카테고리 매핑 — 엘레프/BookItem/CDItem/Artifact/WB |
| `https://schaledb.com/data/config.min.json` | 지역(Region) 상한값 |

### 9.2 핵심 발견

**(1) ✅ 일반/EX 스킬 shape 확정**
- `SkillMaterial: number[][]` — **8행**, 각 행이 단계별 재료 id 배열, 가변 길이 (예: `[4030]` ~ `[4032, 152, 151, 150]`)
- `SkillMaterialAmount: number[][]` — 1:1 대응
- `SkillExMaterial: number[][]` — **4행** (EX 1~5 → 4구간)
- `SkillExMaterialAmount: number[][]`
- ⚠️ 일반 스킬 8행이 게임 내 단계와 정확히 어떻게 매칭되는지는 PR 첫 단계에서 SchaleDB UI 와 대조하여 확정

**(2) ⚠️ `PotentialMaterial` = 단일 number — 모델 재설계**
- 당초 가정 `number[][][]` 폐기
- 실제 = 학생별 단일 보조 오파츠 id (예: 아루=150="로혼치 사본 페이지")
- 잠재력 강화석 (WB) 3종은 items.min.json 에 별도:
  - id `2000` = 교양 체육 WB (체력)
  - id `2001` = 교양 사격 WB (공격)
  - id `2002` = 교양 위생 WB (치명)
- **단계별 누적 비용 테이블은 SchaleDB 미호스팅** → 신규 하드코딩 데이터 필요 (§5.2 / Phase C PR-V2#5)
- 스탯 3종 선택은 사용자 입력 (학생별 고정 X)

**(3) ✅ 학생-엘레프 매핑 = id 동일**
- items.min.json 에 "{학생명}의 엘레프" 가 id 10000+ 범위로 존재
- 학생 id 와 엘레프 item id 가 동일 (예: 아루 student.Id=10000 → 엘레프 item.Id=10000)
- Category="SecretStone"
- 별도 매핑 헬퍼 거의 불필요 — `String(student.Id)` 키로 직접 사용 (§4.1)

**(4) ⚠️ config.Regions 에 KR 없음 — 의도된 구조**
- Region 인덱스: 0=Jp / 1=Global / 2=Cn (Name 필드로 식별)
- KR 이 누락된 게 아니라 **KR 사양 ≡ Global 사양** 이라 별도 항목 불필요. CN 만 사양 차이(WeaponMaxLevel=50, EquipmentMaxLevel=[9,9,9])로 분리됨
- 검증 (2026-04-29): `kr/students.min.json` 과 `en/students.min.json` 의 학생 진도가 다른 것 확인 — 즉 SchaleDB 는 사양(config) 과 출시(IsReleased) 를 분리해서 추적
- 본 프로젝트의 매핑:
  - **사양 (레벨/장비 상한)** → `config.Regions[1]` (Global) 사용. StudentMaxLevel=90, WeaponMaxLevel=60, EquipmentMaxLevel=[10,10,10], BondMaxLevel=50, PotentialMax=25 — 현재 하드코딩 값과 일치
  - **학생 출시 필터** → `IsReleased[2]` (KR 슬롯). 이미 [AddStudentModal.tsx:22](my-site/src/service/planner/components/AddStudentModal.tsx#L22) 에서 `s.IsReleased?.[2] !== false` 로 처리됨 ✓
  - **번역 텍스트** → `DATA_LANG='kr'` 유지 ([schaledb.ts:4](my-site/src/lib/schaledb.ts#L4))
- ⚠️ SkillMaxLevel / SkillExMaxLevel 필드 없음 → 스킬 상한은 SkillMaterial 행 수로 결정 ((1) 항목 추가 검증과 연동)

**(5) ✅ 인벤토리 카탈로그 분류 완전 매핑 가능**

| 게임 재화 | items 카테고리 | id 범위 |
|---|---|---|
| 학생별 엘레프 | Category="SecretStone" | 10000~ |
| 기술 노트 (일반 스킬) | Category="Material" / SubCategory="BookItem" | 4000~4103 |
| BD (EX 스킬) | Category="Material" / SubCategory="CDItem" | 3000~3103 |
| 오파츠 (스킬/고유장비/잠재력 공용) | Category="Material" / SubCategory="Artifact" | 100~293 |
| WB (잠재력) | Category="Material" / (SubCategory 명시 안 됨) | 2000~2002 |

→ 카탈로그 그룹 빌더([inventoryCatalog.ts](my-site/src/service/planner/utils/inventoryCatalog.ts)) 가 위 카테고리·id 범위로 정확히 분류 가능.

### 9.3 결론

✅ **데이터 차단 요소 모두 해소됨 (2026-04-29)**.

### 9.4 추가 검증 (2026-04-29) — 오파츠 시리즈 구조 + 학생 매핑

사용자 제공 자료(잠재력 단계별 비용 표) 정합성 검증 중 추가로 확인한 사항.

**오파츠 시리즈 구조** (items.min.json 검사):
- 모든 오파츠 시리즈 = id 차이 3, **4단계 등급** (Rarity: N → R → SR → SSR)
- Name 접두사: "조각" → "파손된" → "마모된/수리된" → "온전한"
- 시리즈 시작 id 는 10 단위로 끊어짐 (100=네브라, 110=파에스토스, 120=볼프세크, 130=님루드, 140=만드라고라, 150=로혼치, …)

**학생 → 오파츠 매핑**:
- `students.PotentialMaterial` = 시리즈 시작 id = **하급 오파츠 (Rarity N)**
- 잠재력 강화에 사용되는 두 등급:
  - 하급 = `student.PotentialMaterial`
  - 일반 = `student.PotentialMaterial + 1`
- 상급(+2) / 최상급(+3) 은 잠재력 강화에 미사용 (다른 용도)
- 학생간 매핑 확인: 아루(10000) / 하루나(10002) → PotentialMaterial=150 (로혼치 시리즈 공유). 에이미(10001) → 130 (님루드 시리즈) — 학생별로 시리즈 다름

**잠재력 비용 테이블** ([potential_level.json](my-site/src/data/planner/potential_level.json)):
- 25 단계, 5단계 단위 5구간 계단 구조
- 1~15 구간: 하급 오파츠 사용 (10/15/20 개씩 단계당)
- 16~25 구간: 일반 오파츠 사용 (6/8 개씩)
- WB: 1~15 구간 2개, 16~25 구간 4개 (단계당)
- 크레딧: 1~15 구간 100k, 16~25 구간 200k (단계당)
- **모든 학생/스탯 공통** (사용자 제공 자료 기준 가정 — 게임 메커니즘상 일반적)
- 합계 검증 통과: 하급 225 / 일반 70 / WB 70 / 크레딧 3,500,000 ✅

---

## 부록 A. 영역별 SchaleDB 데이터 가용성

| 영역 | SchaleDB 호스팅 | 하드코딩 필요 |
|---|---|---|
| 레벨 EXP/크레딧 | ❌ | ✅ ([student_level.json](my-site/src/data/planner/student_level.json)) |
| 일반 장비 Recipe | ✅ (`equipment.min.json`) | ❌ |
| 일반 장비 카테고리/티어 상한 | ✅ (`config.min.json` `EquipmentMaxLevel`) | ❌ |
| 고유장비 TierUpMaterial | ✅ (`students.Gear`) | ❌ |
| 고유무기 레벨업 EXP/크레딧 | ❌ | ✅ ([weapon_level.json](my-site/src/data/planner/weapon_level.json)) |
| 고유무기 성급 엘레프 누적 | ❌ | ✅ ([weapon_star.json](my-site/src/data/weapon_star.json)) |
| 학생별 고유 엘레프 item id | ✅ **`student.Id == eleph item.Id`** (둘 다 10000부터 시작, 1:1 매핑) — §9 검증 완료 | ❌ |
| 일반 스킬 재료 | ✅ `students.SkillMaterial[Amount]` (`number[][]` 8행) — §9 검증 완료 | ❌ |
| EX 스킬 재료 | ✅ `students.SkillExMaterial[Amount]` (`number[][]` 4행) — §9 검증 완료 | ❌ |
| 잠재력 — 학생별 보조 오파츠 id | ✅ `students.PotentialMaterial` (단일 number) — §9 검증 완료 | ❌ |
| 잠재력 — WB 강화석 3종 | ✅ items id 2000(체)/2001(공)/2002(치) — §9 검증 완료 | ❌ |
| **잠재력 단계별 비용 테이블** (WB/하급오파츠/일반오파츠/크레딧) | ❌ SchaleDB 미호스팅 | ✅ [data/planner/potential_level.json](my-site/src/data/planner/potential_level.json) **확보 완료** (2026-04-29) |
| 활동 보고서 등급별 EXP 환산 (입문/초급/중급/상급) | ❌ | (선택 — §4.2 채택 시 필요) |
| 신명석 등급별 EXP 환산 (광휘/예지/지각) | ❌ | (선택 — §4.2 채택 시 필요) |
| 호감도(Bond) 재료 | ⚠️ tag 기반 (`FavorItemTags`) — 환산 별도 | (범위 외) |

→ **현재 작업 가능 상태** : 잠재력 단계별 비용 1건만 신규 하드코딩 필요. 나머지는 모두 SchaleDB 직접 활용 또는 기존 데이터로 진행 가능.
