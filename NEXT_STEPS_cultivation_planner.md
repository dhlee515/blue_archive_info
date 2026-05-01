# 육성 플래너 — 다음 작업 계획

> 작성일: 2026-05-01
>
> 선행 문서: [PLAN_cultivation_planner.md](PLAN_cultivation_planner.md) (v1 초기 설계) · [PLAN_cultivation_planner_v2.md](PLAN_cultivation_planner_v2.md) (v2 범위 재정의) · [STATUS_cultivation_planner.md](STATUS_cultivation_planner.md) (이전 시점 진행 현황)
>
> **이 문서의 목적** : 현재 working tree 의 v1 + 옵션 C 작업이 끝난 시점에서 **즉시 해야 할 일** 과 **그 다음 단계** 를 한눈에 보여주는 액션 가이드.

---

## 1. 현재 상태 (2026-05-01)

### ✅ 완료
- **v1 (MVP 4영역)** — 학생 레벨 / 일반 장비 / 고유무기 레벨업 / 고유장비
- **v1 검증** — `npm run type-check`, `npm run build`, Supabase 마이그레이션 적용 + RLS·트리거·정책 6개 객체 점검 통과
- **옵션 C (EXP 환산 시스템)** — v2 §4.2 "선택 작업" 항목을 v1 단계에서 처리:
  - 데이터: [data/planner/exp_conversion.json](my-site/src/data/planner/exp_conversion.json) (보고서/부품/강화석 + 보너스 매핑)
  - 헬퍼: [service/planner/utils/expConversion.ts](my-site/src/service/planner/utils/expConversion.ts) (`aggregate*`, `enrichInventoryWithSyntheticTotals`, `breakdown*`, `getBonusSeriesIdsFor`)
  - 인벤토리 카탈로그 재구성 — 보고서 / 무기 부품 (단일 그룹, 16종) / 장비 강화석 분리, piece 에 티어 prefix
  - 부족 패널에 EXP 환산 섹션 + 등급별 chip
  - 학생 카드에 1.5× 보너스 라벨 (무기 타입 → 부품 시리즈 자동 매핑)
- **잠재력 비용 데이터** — [data/planner/potential_level.json](my-site/src/data/planner/potential_level.json) 작성 완료 (Phase C 차단 요소 사전 해소)
- **인벤토리 ↔ 플래너 연결** — 키 매칭, 환산 흐름, deficit 계산 모두 검증 통과

### ❌ 미완료 — **커밋 안 됨**
- [git status](#) : 11 modified + 13 untracked. 모든 변경분이 working tree 에만 존재 (마지막 커밋 9cfd154 는 플래너와 무관)

---

## 2. 즉시 할 일 — Step 4 + 커밋

### Step 4 — 페이지 E2E 동작 검증 (사용자 직접)

`npm run dev` 후 http://localhost:5173 로그인 → 다음 시나리오 한 번씩 통과:

| 영역 | 검증 항목 |
|---|---|
| `/planner/inventory` 그룹 | 기본 재화(크레딧, 금화 아이콘) / 활동 보고서 4종 / 무기 부품 단일 그룹 16종 / 장비 강화석 4종 / 설계도면 (T2~T10 prefix) / 고유장비 재료 / 오파츠 |
| `/planner/inventory` 입력 | 클릭 → 즉시 새 숫자 입력 / 디바운스 저장 / 새로고침 후 보존 |
| `/planner/cultivation` 보너스 | 학생 카드의 "고유무기 레벨" 위에 "1.5× 보너스: ..." 라벨 (무기 타입별로 다름) |
| `/planner/cultivation` 부족 패널 | 학생 EXP / 무기 EXP 환산 섹션 (등급별 chip) / 일반 grid (오파츠/설계도면/크레딧) |
| 회귀 | `/`, `/students`, `/guide`, `/calculator/eligma` 정상 / 비로그인 시 `/planner/cultivation` → `/login` 리다이렉트 |

→ 통과되면 Step 5 (커밋) 로.

### Step 5 — 커밋 정리

**결정 필요** : 커밋 분할 방식
- (A) **단일 통합 커밋** — "add/육성 플래너 + 재화 인벤토리" 하나로. 가장 빠름. 분기 가독성은 ↓
- (B) **PR 단위 분할** — v1 PR#1~#8 + 옵션 C 추가 PR 1~3개로. PLAN 문서와 매핑됨. 시간 더 걸림

권장은 **(A)** — 이미 working tree 에 모든 변경이 누적되어 PR 분리가 어렵고, 사용자가 1인 개발자라 분기 추적 가치가 낮음.

---

## 3. 다음 단계 — PR-V2#1 부터

[PLAN_cultivation_planner_v2.md §6](PLAN_cultivation_planner_v2.md) 의 PR 흐름 그대로. **모든 데이터 차단 요소 해소됨**.

### Phase A — 고유무기 성급업 (엘레프) 통합 — **PR-V2#1**

작업 목록:
- [types/planner.ts](my-site/src/types/planner.ts) `PlannerTargets.weaponStar?: { current: number; target: number }` (1~8 단계)
- [cultivationCalculator.ts](my-site/src/service/planner/utils/cultivationCalculator.ts) `calculateWeaponStarCost(student, range)` — `CUMULATIVE_ELEPH[t] - CUMULATIVE_ELEPH[c]` 를 `String(student.Id)` 키로 출력 (학생 id == 엘레프 item id)
- `aggregatePerStudent` 에 호출 추가
- 입력 UI — `WeaponTargetInput` 에 성급 셀렉터 추가 또는 별도 컴포넌트
- 인벤토리 카탈로그 — `eleph` 그룹 (플래너 학생들의 엘레프 item id 합집합)

차단 요소 : 없음 (데이터 + 매핑 완전 확보)

### Phase B — 스킬 (일반 + EX) — **PR-V2#2~#4**

작업 흐름:
1. **PR-V2#2** : `SchaleDBStudent` 타입에 `SkillMaterial?: number[][]`, `SkillMaterialAmount?: number[][]`, `SkillExMaterial?: number[][]`, `SkillExMaterialAmount?: number[][]` 추가
2. **PR-V2#3** : 일반 스킬 (Normal/Passive/Sub) 계산기 + UI + 카탈로그 그룹 (`Material/BookItem`)
3. **PR-V2#4** : EX 스킬 계산기 + UI + 카탈로그 그룹 (`Material/CDItem`)

차단 요소 : 없음 (SchaleDB 직접 활용. 일반 스킬 8행 ↔ 게임 단계 매핑은 PR-V2#3 첫 단계에서 검증)

### Phase C — 잠재력 (WB) — **PR-V2#5~#7**

작업 흐름:
1. **PR-V2#5** : [potential_level.json](my-site/src/data/planner/potential_level.json) → `tables/potentialLevel.ts` 모듈 + `PotentialMaterial?: number` 타입
2. **PR-V2#6** : 잠재력 계산 (스탯 3종) + `PotentialTargetInput` UI + 인벤토리 카탈로그 `potential-wb` 그룹 (WB id 2000/2001/2002)
3. **PR-V2#7** : 통합 검증 + 안내 텍스트

차단 요소 : 없음 (데이터 + 학생 매핑 모두 확보 — `student.PotentialMaterial` = 하급 오파츠 id, +1 = 일반 오파츠)

### Phase D — 마감 — **PR-V2#8~#10**

| PR | 작업 |
|---|---|
| PR-V2#8 | DnD 정렬 (`reorderStudents` 호출) + 학생 카드 "초기화" 버튼 |
| PR-V2#9 | `config.min.json` 동적 페치 → Region(Global=index 1) 의 상한값을 input UI 에 반영 |
| PR-V2#10 | (선택) 두 페이지 동시 열림 시 인벤토리 동기화 — focus 시 refetch 또는 Supabase Realtime |

---

## 4. 의도된 미반영 (현재 갭, v2 후속에서 처리)

| 항목 | 현재 | 처리 시점 |
|---|---|---|
| 장비 강화석 (estone) deficit 미계산 | 인벤토리 입력만, hint 안내됨 | 일반 장비 레벨업 추가 시 |
| 만능 설계도 (T0 piece) | 인벤토리 입력만, 계산기 미반영 | 향후 piece 대체 로직 추가 시 |
| 두 페이지 동시 열림 자동 동기화 | 없음, 새로고침 필요 | Phase D PR-V2#10 |
| 일반 스킬 8행 ↔ 게임 단계 매핑 | shape 만 확정, 정확 매칭 미검증 | Phase B PR-V2#3 첫 단계 |

---

## 5. 우선순위 정리

```
지금 ──→ Step 4 (E2E 검증)
       └─ 통과 ──→ Step 5 (커밋, 단일 통합 권장)
                  └─ 완료 ──→ PR-V2#1 (고유무기 성급업, Phase A)
                            └─ 완료 ──→ PR-V2#2~#4 (Phase B 스킬)
                                       └─ 완료 ──→ PR-V2#5~#7 (Phase C 잠재력)
                                                  └─ 완료 ──→ PR-V2#8~#10 (Phase D 마감)
```

각 PR 종료 시점마다 `npm run type-check` + `npm run build` 통과 확인. PR 분리는 사용자 결정 사항.

---

## 6. 위험·체크 항목

- [ ] **첫 커밋 전 시크릿 점검** — `.env`, Supabase 키 등 민감 파일이 staging 에 안 들어가는지
- [ ] **DB 가 dev 환경 전용인지** — 운영 DB 라면 마이그레이션 영향 범위 재확인 (현재 상태 idempotent 아님 — 두 번째 적용 시 실패. 운영 환경에선 한 번만 적용)
- [ ] **마이그레이션 idempotent 보강** — 선택 사항. `create table if not exists` + `drop policy/trigger if exists` 패턴 도입 시 재적용 가능 ([기존 진단 SQL](#) 활용)
- [ ] **DB 데이터 cleanup** — 이전 dev 단계에서 `wstone:*` 키로 입력한 게 있다면 graveyard 데이터로 남음. 새 사용자에겐 무관
