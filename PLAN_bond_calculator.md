# 인연랭크 계산기 계획 (`/calculator/bond`)

> 계산기 탭에 학생 인연랭크 계산기를 신규 추가한다 (플래너와 별개 페이지).
> 작성일: 2026-10-02
> 관련 문서: [PLAN_bond_rank.md](PLAN_bond_rank.md) (플래너 인연 통합 — 공식/EXP 곡선 원 출처), [PLAN_refactoring.md](PLAN_refactoring.md) §9
> 관련 파일: [bondGifts.ts](my-site/src/service/planner/utils/cultivationCalculator/bondGifts.ts), [bondExp.ts](my-site/src/service/planner/utils/tables/bondExp.ts), [bond_exp.json](my-site/src/data/planner/bond_exp.json), [ReportCalcPage.tsx](my-site/src/service/calculator/pages/ReportCalcPage.tsx) (구조 참고)

---

## 0. 사전 검증 결과 (2026-10-02, SchaleDB 실데이터 기준)

`kr/students.min.json` · `kr/items.min.json` · `config.min.json` 을 직접 받아 확인.

| 항목 | 결과 |
|---|---|
| 선물 (`Category: Favor`) | **52종** — SR 35 (ExpValue 20) / SSR 15 (ExpValue 60) / SSR 예외 2 (ExpValue 20: 하츠네 미쿠의 포토 카드, 반짝이는 꽃다발). 전부 `Tags` · `ExpValue` 보유 |
| 학생 선호 태그 | 277명 전원 `FavorItemUniqueTags` 보유. 콜라보 4명 (하츠네 미쿠, 미사카 미코토, 쇼쿠호 미사키, 사텐 루이코) 은 `FavorItemTags` 없음 → Unique + Common 으로만 매칭 |
| 공통 선호 태그 | `CommonFavorItemTags = ['BC', 'Bc', 'ew']` |
| 선호도 데이터 형태 | "학생 → 선호 선물" 사전 계산 테이블은 SchaleDB 에도 없음. **태그 교집합으로 매번 계산** (SchaleDB 사이트도 동일). 정보 자체는 완전 |
| 배수 공식 | `ExpValue × (min(매칭 태그 수, 3) + 1)` — ×1 ~ ×4 |
| 공통 태그 영향 | 일반 SSR 13종 모두 `BC` 보유 → 전원 최소 ×2. 싱그러운 / 아름다운 꽃다발은 공통 태그 3개 → **전원 ×4**. 포토 카드 / 반짝이는 꽃다발은 2개 → 전원 ×3 |
| 학생별 ×4 SSR 수 | 꽃다발 2종 포함 2~4개. **73명은 꽃다발 외 ×4 SSR 없음** |
| 획득 경로 | `Craftable` / `Shop` / `StageDrop` (지역별 `[Jp, Global, Cn]` 배열). **일반 SR 35 + SSR 13 = 제조 가능**, 5996~5999 (꽃다발 · 포토 카드) 4종 = 전 경로 `false` → 이벤트 한정 |
| 선물 선택 상자 (100008) | `Consumable` / `ConsumeType: 'Choice'` / `Items` = **SR 선물 5000~5034 중 택1** (SSR 아님). 내용물이 Favor 인 택1 상자는 이것 하나 |
| 선물 상자 (100000) / 고급 선물 상자 (100009) | `Items` 없음 → 내용물 · 확률 데이터 없음 |
| 인연 EXP 곡선 | 정적 JSON 1~100, 누적 240,225 (합계 검증 완료). SchaleDB 미제공 |
| 인연 보너스 스탯 | `FavorStatType` (예: 시로코 `['AttackPower', 'MaxHP']`) + `FavorStatValue` (시로코 7구간 `[[3,0],[4,0],[6,55],…]`) — 구간 ↔ 랭크 대응 미확인 |

---

## 1. 범위

### 이번에 하는 것 (A안 — 필요 선물 계산기)

- 현재 랭크 (+ 현재 랭크 진행 EXP) → 목표 랭크 **필요 EXP**
- 선택 학생 기준 **선물 효율표** (52종, 배수별 그룹, 한정 표시)
- 보유 선물 + 선물 선택 상자 → **획득 EXP 합계 / 도달 가능 랭크 / 잔여 EXP**
- 부족 시 **추가로 필요한 선물 수** — 제조 가능한 선물만 대상

### 이번에 하지 않는 것

| 항목 | 이유 / 후속 |
|---|---|
| 쓰다듬기 · 스케줄 기반 "목표까지 며칠" (B안) | 일일 횟수 등 데이터 미확보. 아래 §7 후속 |
| 인연 보너스 스탯 표시 | `FavorStatValue` 구간 의미 확인 필요 (§6) |
| 플래너 인벤토리 연동 (보유 선물 불러오기) | 계산기 독립성 우선. 필요 시 후속 |
| 입력값 저장 | 보고서 계산기와 동일하게 새로고침 시 초기화 |

### 선물 선택 상자 처리

계산기는 인연 전용이므로 **상자 = 해당 학생에게 가장 효율 좋은 SR 선물 1개** 로 환산 (refactoring 논의의 (a) 방식). 애장품 재료와의 경합은 고려하지 않음.

---

## 2. 화면 구성

```
인연랭크 계산기
──────────────────────────────────────────────
[학생 선택]   (아이콘 + 이름, 클릭 시 검색 모달)

[입력]
  현재 랭크 [  ]   현재 랭크 진행 EXP [  ]   목표 랭크 [100]

[보유 선물]   — 선택 학생 기준 효율순
  ×4  [아이콘] 하루 세 번 덤벨 세트   240/개   [  ]
  ×4  [아이콘] 싱그러운 꽃다발 (한정)  240/개   [  ]
  ×3  …
  ──
  [아이콘] 선물 선택 상자 → ○○ (×4, 80/개)        [  ]

[결과]
  ① 필요 EXP      12,345  (현재 → 목표, 진행 막대)
  ② 보유분 EXP     8,000  → 도달 가능 랭크 47 (+120 EXP)
  ③ 부족 4,345 EXP
       제조 가능 SSR ×4 (하루 세 번 덤벨 세트 등) 19개
       또는 SR ×4 (○○) 55개
```

- 학생 미선택 시 결과 영역 대신 안내 문구.
- 효율표는 ×1 그룹 기본 접힘 (입력 대상이 많아 스크롤 부담).
- 숫자 입력은 전부 `components/form/NumberInput`.

---

## 3. 데이터와 계산

### 3.1 데이터

| 데이터 | 출처 | 로드 |
|---|---|---|
| 학생 (선호 태그, 이름, 아이콘) | SchaleDB `students` | `fetchSchaleDB` (localStorage 24h 캐시) |
| 선물 · 선물 선택 상자 | SchaleDB `items` | 〃 |
| 공통 선호 태그 | SchaleDB `config` | `loadCommonFavorTags()` 재사용 |
| 인연 EXP 곡선 | 정적 [bond_exp.json](my-site/src/data/planner/bond_exp.json) | `CUMULATIVE_BOND_EXP` 재사용 |

신규 데이터 파일 없음. `equipment` 는 불필요하므로 `loadPlannerGameData()` 대신 필요한 것만 fetch.

### 3.2 재사용 (planner → calculator import, 보고서 계산기와 같은 패턴)

- `calculateBondExp`, `favorMultiplier`, `getFavorItems`, `getFavorChoiceBoxes` — [bondGifts.ts](my-site/src/service/planner/utils/cultivationCalculator/bondGifts.ts)
- `CUMULATIVE_BOND_EXP`, `BOND_MAX_LEVEL` — [bondExp.ts](my-site/src/service/planner/utils/tables/bondExp.ts)

### 3.3 신규 순수 함수 — `service/calculator/utils/bondCalc.ts`

| 함수 | 내용 |
|---|---|
| `requiredBondExp(current, progress, target)` | `CUMULATIVE[target] − CUMULATIVE[current] − progress` (≥ 0). progress 는 해당 랭크 구간 EXP 미만으로 clamp |
| `maxBondFromExp(current, progress, exp)` | 보고서 계산기 `maxLevelFromExp` 와 같은 방식 → `{ rank, leftover }` |
| `buildGiftTable(student, items, commonTags)` | 선물별 `{ item, mult, expPerItem, limited }` — `(mult desc, expPerItem desc, id asc)` 정렬. `limited` = Global 기준 `Craftable · Shop · StageDrop` 모두 false |
| `choiceBoxValue(student, box, items, commonTags)` | 상자 `Items` 중 이 학생 최고 효율 선물 → `{ item, mult, expPerItem }` |
| `holdingsExp(table, counts, boxes)` | 보유 선물 + 상자 환산 EXP 합계 |
| `suggestShortfall(remainingExp, table)` | **제조 가능 (limited=false)** 중 최고 효율 SSR / SR 각각 `{ item, count }` |

### 3.4 지역 인덱스

SchaleDB 지역 배열은 `[Jp, Global, Cn]`. 한섭은 Global 에 포함되므로 **인덱스 1** 사용 (§6 확인 항목).

---

## 4. 파일 변경 계획

| 파일 | 작업 |
|---|---|
| `my-site/src/service/calculator/utils/bondCalc.ts` | 신규 — §3.3 순수 함수 |
| `my-site/src/service/calculator/pages/BondCalcPage.tsx` | 신규 — 페이지 |
| `my-site/src/components/StudentPickerModal.tsx` | 신규 — 플래너 [AddStudentModal](my-site/src/service/planner/components/AddStudentModal.tsx) 의 검색 + 그리드를 공통 컴포넌트로 추출 (`title`, `disabledIds` prop). `AddStudentModal` 은 이를 감싸는 wrapper 로 전환 — 플래너 동작 무변경 |
| `my-site/src/types/schaledb.ts` | `SchaleDBItem` 에 `Craftable?` / `Shop?` / `StageDrop?: boolean[]` 추가 |
| `my-site/src/router/index.tsx` | `calculator/bond` → `BondCalcPage` |
| `my-site/src/components/navigation/Sidebar.tsx` | 계산기 그룹에 "인연 계산기" 추가 |
| `CLAUDE.md` | 라우트 표 + 계산기 설명 |

---

## 5. 진행 순서 (커밋 단위)

| # | 커밋 | 검증 |
|---|---|---|
| 1 | `add/선물 선택 상자를 재화 인벤토리에 추가` — **작업 완료, 미커밋** (`schaledb.ts` · `bondGifts.ts` · `inventoryCatalog.ts`) | type-check, 실데이터로 카탈로그 53개 확인 완료 |
| 2 | `add/인연 계산기 순수 함수 — bondCalc` + `schaledb.ts` 획득 경로 필드 | type-check + 실데이터 스크립트 (시로코 등 예시 학생: 필요 EXP, 효율표, 상자 환산, 한정 제외 확인) |
| 3 | `md/StudentPickerModal 공통 컴포넌트 추출` | type-check, 플래너 "학생 추가" 동작 동일 확인 |
| 4 | `add/인연 계산기 페이지 (/calculator/bond)` + 라우트 + 사이드바 | type-check, build, `npm run dev` 수동 확인 |
| 5 | `md/CLAUDE.md + 계획 문서 갱신` | — |

### 수동 확인 체크리스트 (4단계)

- [ ] 학생 선택 → 효율표가 학생마다 다르게 정렬되는지 (예: 시로코 ×4 = 꽃다발 2종, ×3 = 하루 세 번 덤벨 세트)
- [ ] 현재 랭크 진행 EXP 를 넣으면 필요 EXP 가 그만큼 줄어드는지
- [ ] 보유 선물 / 상자 입력 → 도달 랭크 · 잔여 EXP 갱신
- [ ] 부족분 추천에 한정 선물 (5996~5999) 이 나오지 않는지
- [ ] 현재 ≥ 목표, 목표 100, 학생 미선택 등 경계 상태
- [ ] 다크 모드 / 모바일 폭

---

## 6. 미결 / 확인 필요

| 항목 | 영향 | 처리 |
|---|---|---|
| **꽃다발 EXP** — SchaleDB 는 싱그러운 / 아름다운 꽃다발 ExpValue 60 (×4 = 240), [PLAN_bond_rank.md](PLAN_bond_rank.md) 의 사진 메모는 "이벤트 고급선물 = 일반선물 수치" (×4 = 80) | 꽃다발 **보유분** 계산만 달라짐. 부족분 추천은 한정 제외라 무관 | 게임 내 확인 전까지 SchaleDB 값 사용 + "한정" 배지 |
| 획득 경로 지역 기준 (Global = 한섭) | 한정 판정 | Global(인덱스 1) 로 진행, 코드 주석 명시 |
| `FavorStatValue` 구간 ↔ 랭크 대응 | 스탯 표시 기능 | 확인 후 후속 단계에서 추가 |
| 인연 EXP 곡선 출처 이미지 (`자료/인랭 계산기/…webp`) 가 저장소에 없음 | 곡선 재검증 불가 | 패치 시 외부 자료로 재검증 |

---

## 7. 후속 (이번 범위 밖)

- **B안 — 기간 시뮬레이터**: 쓰다듬기 (15 EXP/회, 일일 횟수 필요), 스케줄 (지역 1~10 = 15 / 11 = 20 / 12 = 25, 보너스 50 — [PLAN_bond_rank.md](PLAN_bond_rank.md) 사진 메모), 카페 초대권 등. 일일 횟수 · 티켓 수 데이터 확보 후.
- **플래너 반영**: 계산기 함수로 플래너 인연 계산의 두 한계 해소 — ① 현재 랭크 진행 EXP 미반영, ② Phase B 부족분 권장에 한정 선물 (꽃다발) 이 선택되는 문제. 선물 선택 상자 계산 반영 여부 (애장품 경합 포함) 도 이때 결정.
- **선호 선물 표시**: 학생 상세 / 플래너 학생 화면에 ×4 / ×3 선물 목록.
