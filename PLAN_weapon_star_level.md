# 고유무기 성급 ↔ 레벨 종속 관계 설계

> 작성일: 2026-05-01
>
> 선행 문서: [PLAN_cultivation_planner_v2.md](PLAN_cultivation_planner_v2.md), [NEXT_STEPS_cultivation_planner.md](NEXT_STEPS_cultivation_planner.md)
>
> **목적** : 사용자 제공 게임 표 (고유무기 레벨업 경험치 테이블 + 레벨 제한) 를 근거로, 현재 분리되어 관리되는 **고유무기 성급 ↔ 레벨** 두 시스템의 종속 관계를 코드에 반영.

---

## 1. 게임 메커니즘 (사용자 표 기반)

### 1.1 성급별 도달 가능 레벨 범위

사용자 제공 표의 "레벨 제한" 컬럼:

| 전무 성급 | 도달 가능 무기 레벨 | 누적 EXP (해당 성급 max) | 누적 크레딧 |
|---|---|---|---|
| **전무 1성** (학생 5성) | 1 ~ 30 | 4,355 | 783,900 |
| **전무 2성** | ~ 40 | 11,755 | 2,115,900 |
| **전무 3성** | ~ 50 | 26,280 | 4,730,400 |
| **전무 4성** | ~ 60 | 49,605 | 8,928,900 |

### 1.2 성급업 조건 (양방향 종속)

```
[학생 1~4성]
   │  학생 본체 성급업 (엘레프 소모)
   ▼
[학생 5성 = 전무 1성 자동 해금, 무기 레벨 1]
   │  무기 레벨 1 → 30 (EXP 4,355 + 크레딧 783,900)
   ▼
[전무 1성 max 도달]
   │  성급업 (엘레프 소모) — 무기 레벨 max 30 도달이 조건
   ▼
[전무 2성, 무기 레벨 max 40 으로 상향]
   │  무기 레벨 30 → 40 (EXP 추가 7,400)
   ▼
[전무 2성 max 도달] → 전무 3성 → … → 전무 4성 (max 60)
```

→ **양방향 종속**:
- (a) 성급은 도달 가능한 무기 레벨 max 를 결정
- (b) 다음 성급으로 가려면 현재 성급의 무기 레벨 max 에 도달해야 함

---

## 2. 데이터 검증 — 일치 확인

[data/planner/weapon_level.json](my-site/src/data/planner/weapon_level.json) 의 값과 사용자 표 대조:

| 검증 항목 | weapon_level.json | 사용자 표 | 일치 |
|---|---|---|---|
| `expDelta[2]` (1→2) | 25 | 25 | ✅ |
| `expDelta[31]` (30→31) | 470 | 470 | ✅ |
| `CUMULATIVE_WEAPON_EXP[30]` | 4,355 | 4,355 | ✅ |
| `CUMULATIVE_WEAPON_EXP[60]` | 49,605 | 49,605 | ✅ |
| `starMaxLevels` | `[0, 30, 40, 50, 60]` | 1성=30, 2성=40, 3성=50, 4성=60 | ✅ |
| `creditDelta[2]` (1→2) | 4,500 | 4,500 | ✅ |
| 누적 크레딧 max (level 60) | 8,928,900 | 8,928,900 | ✅ |

→ **데이터 측은 이미 완전 정확**. 코드 로직만 종속 관계를 반영하면 됨.

---

## 3. 현재 코드의 갭

| 항목 | 현재 | 게임 메커니즘 |
|---|---|---|
| `WeaponTargetInput.tsx` | `max={WEAPON_MAX_LEVEL=60}` 하드코딩 | 성급에 따라 30/40/50/60 |
| `WeaponStarInput.tsx` | 1~8 단계 자유 선택 | 무기 레벨 max 도달이 다음 성급 조건 |
| `WEAPON_STAR_MAX_LEVELS` ([weaponLevel.ts:24](my-site/src/service/planner/utils/tables/weaponLevel.ts#L24)) | export 만 됨 | 어디서도 import 안 함 (dead code) |
| 성급/레벨 일관성 검증 | 없음 | 잘못된 조합 (성급 1 + 레벨 60 등) 입력 가능 |
| 성급 변경 시 레벨 자동 보정 | 없음 | 성급 ↓ 시 레벨도 새 max 이하로 clamp 필요 |

---

## 4. 적용 계획

### 4.1 종속 관계 함수 (신규)

`tables/weaponLevel.ts` 또는 `expConversion.ts` 에 헬퍼 추가:

```ts
/**
 * 전무 성급 단계(1~8 통합 모델) → 도달 가능한 무기 레벨 max.
 * 전무 1성 = WEAPON_STARS[5] (학생 5성 달성 시점) 기준.
 *   1~4 (학생 본체 성급) : 무기 미해금 → max = 0
 *   5 (5성/전무 1성)     : max = 30
 *   6 (전무 2성)         : max = 40
 *   7 (전무 3성)         : max = 50
 *   8 (전무 4성)         : max = 60
 */
export function getWeaponMaxLevelForStar(weaponStar: number): number {
  if (weaponStar < 5) return 0;
  return WEAPON_STAR_MAX_LEVELS[weaponStar - 4] ?? 0;
}

/** 다음 전무 성급으로 가려면 현재 성급의 max 레벨에 도달해야 함. */
export function canAdvanceWeaponStar(weaponStar: number, currentLevel: number): boolean {
  if (weaponStar < 5) return weaponStar < 8; // 학생 본체 성급은 레벨 무관
  return currentLevel >= getWeaponMaxLevelForStar(weaponStar);
}
```

### 4.2 UI 측 종속 처리

#### A. `WeaponTargetInput` — 성급에 따른 max 동적

```tsx
interface Props {
  value: WeaponRange;
  weaponStar: WeaponStarRange;  // 신규 prop
  onChange: (value: WeaponRange) => void;
}
```

- `currentLevel` max = `getWeaponMaxLevelForStar(weaponStar.current)`
- `targetLevel` max = `getWeaponMaxLevelForStar(weaponStar.target)`
- 성급 < 5 (무기 미해금) 시 input 비활성화 + "미해금" 안내
- 성급 변경 시 currentLevel/targetLevel 을 새 max 이하로 clamp (StudentCard 의 `handleWeaponStarChange` 에서 처리)

#### B. `WeaponStarInput` — 레벨 도달 조건 안내

성급업 조건이 "현재 성급의 max 레벨 도달" 인 점을 hint 로 표시:

- 셀렉터 옆 작은 hint: "전무 1성 → 2성: 무기 레벨 30 필요"
- 자동 차단은 X (사용자 자율 — 실제 게임 메커니즘 표시만)

#### C. `StudentCard` — 두 컴포넌트 연결

```tsx
const handleWeaponStarChange = (weaponStar: WeaponStarRange) => {
  setTargets((t) => {
    // 새 성급의 max 레벨 이하로 무기 레벨 clamp
    const maxCurrent = getWeaponMaxLevelForStar(weaponStar.current);
    const maxTarget = getWeaponMaxLevelForStar(weaponStar.target);
    const clampedWeapon: WeaponRange = {
      currentLevel: Math.min(t.weapon?.currentLevel ?? 0, maxCurrent),
      targetLevel: Math.min(t.weapon?.targetLevel ?? 0, maxTarget),
    };
    return { ...t, weaponStar, weapon: clampedWeapon };
  });
};
```

→ 성급을 8 → 5 로 내릴 때 무기 레벨도 자동으로 30 이하로 보정.

### 4.3 계산기 측 영향 — 없음

`calculateWeaponCost` 는 이미 `currentLevel ~ targetLevel` 누적 EXP 산출. 성급에 따른 max clamp 는 **UI 입력 단계에서 처리** 되므로 계산기 변경 불필요.

---

## 5. 작업 단계 (PR-V2#1.7 — 후속 보강)

| 단계 | 작업 | 파일 |
|---|---|---|
| 1 | `getWeaponMaxLevelForStar` / `canAdvanceWeaponStar` 헬퍼 추가 | [tables/weaponLevel.ts](my-site/src/service/planner/utils/tables/weaponLevel.ts) |
| 2 | `WeaponTargetInput` 에 `weaponStar` prop 추가 + 성급 < 5 비활성화 + max 동적 | [WeaponTargetInput.tsx](my-site/src/service/planner/components/WeaponTargetInput.tsx) |
| 3 | `WeaponStarInput` 에 다음 성급 조건 hint | [WeaponStarInput.tsx](my-site/src/service/planner/components/WeaponStarInput.tsx) |
| 4 | `StudentCard` `handleWeaponStarChange` 에 clamp 로직 + `WeaponTargetInput` 에 weaponStar 전달 | [StudentCard.tsx](my-site/src/service/planner/components/StudentCard.tsx) |
| 5 | type-check + build | — |

**예상 분량** : 작음 (~50줄 변경, 신규 파일 0건)

---

## 6. 결정된 사항

| 항목 | 결정 |
|---|---|
| 성급 → 레벨 max 매핑 | `1~4=0, 5=30, 6=40, 7=50, 8=60` (사용자 표 기준) |
| 성급 < 5 무기 입력 처리 | 비활성화 + "미해금" 안내 |
| 성급 변경 시 레벨 보정 | **자동 clamp** (사용자가 별도 조작 불필요) |
| 성급업 레벨 도달 조건 | hint 표시만 (강제 차단 X — 사용자 자율로 잘못된 시나리오도 입력 가능, 비용은 계산기가 정상 산출) |
| 계산기 변경 | 없음 (UI 단계에서 일관성 보장) |
| 데이터 추가 | 없음 (`weapon_level.json` 의 `starMaxLevels` 활용) |

---

## 7. 검증 시나리오 (구현 후)

| # | 시나리오 | 기대 결과 |
|---|---|---|
| 1 | 성급 1~4 (학생 본체 성급) 선택 | 무기 레벨 입력칸 비활성화, "미해금" 표시 |
| 2 | 성급 5 (전무 1성) 선택 | 무기 레벨 max 30 |
| 3 | 성급 6 → 5 로 내림, 기존 레벨 35 | 레벨 자동 30 으로 clamp |
| 4 | 성급 5, 무기 레벨 30 + 성급 hint 확인 | "전무 2성 진입 조건 충족" 안내 |
| 5 | 부족 패널 검증 | 성급/레벨 모두 일관된 시나리오에서 정확한 EXP/엘레프 합산 |
