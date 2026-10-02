# 인연랭크 계산기 계획 (`/calculator/bond`)

> 계산기 탭에 학생 인연랭크 계산기를 신규 추가한다 (플래너와 별개 페이지).
> **학생 1명을 선택하고 그 학생 기준으로만 계산한다.**
> 작성일: 2026-10-02 · 검증 반영: 2026-10-02 (§8)
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
| 선물 선택 상자 환산값 (학생별 최고 효율 SR) | ×3 (60) **270명** / ×4 (80) 2명 / ×2 (40) 1명 / ×1 (20) 4명 (콜라보) |
| 제조 가능 SSR 최고 배수 | ×4 204명 / ×3 68명 / ×2 5명. 최고 배수 동점: 1종 261명, 2종 11명, **13종 전부 (×2) 5명** — 동점끼리는 개당 EXP 가 같아 필요 개수 동일 |
| 미출시 학생 | `IsReleased[1]` (Global) = false **14명** — 플래너 학생 추가 모달은 현재 구분 없이 노출 |
| 획득 경로 지역 차이 | `Craftable` 값이 지역별로 다른 선물 **없음** → Global 기준 판정이 전 지역과 동일 |

---

## 1. 범위

### 이번에 하는 것 (A안 — 필요 선물 계산기)

- 현재 랭크 (+ 현재 랭크 진행 EXP) → 목표 랭크 **필요 EXP**
- 선택 학생 기준 **선물 효율표** (52종, 배수별 그룹, 한정 표시)
- 보유 선물 + 선물 선택 상자 → **획득 EXP 합계 / 도달 가능 랭크 / 잔여 EXP**
- 부족 시 **추가로 필요한 선물 수** — 고급 선물 (SSR) 1종 기준 개수 / 일반 선물은 선물 선택 상자 개수 (§3.5)

### 이번에 하지 않는 것

| 항목 | 이유 / 후속 |
|---|---|
| 쓰다듬기 · 스케줄 기반 "목표까지 며칠" (B안) | 일일 횟수 등 데이터 미확보. 아래 §7 후속 |
| 인연 보너스 스탯 표시 | `FavorStatValue` 구간 의미 확인 필요 (§6) |
| 플래너 인벤토리 연동 (보유 선물 불러오기) | 계산기 독립성 우선. 필요 시 후속 |
| 입력값 저장 | 보고서 계산기와 동일하게 새로고침 시 초기화 |

### 선물 선택 상자 처리

계산기는 인연 전용이므로 **상자 = 해당 학생에게 가장 효율 좋은 SR 선물 1개** 로 환산 (refactoring 논의의 (a) 방식). 애장품 재료와의 경합은 고려하지 않음.
상자 내용물 (SR 5000~5034) = 일반 선물 35종 전부 = 제조 가능 SR 전부이므로, **보유 상자 환산과 SR 부족분 추천이 같은 기준** 을 쓴다.

### 결정 사항 (2026-10-02)

| # | 항목 | 결정 |
|---|---|---|
| D1 | SSR 부족분 추천 | 제조 가능 SSR 중 정렬 맨 앞 1종의 **필요 개수만** 표시. 최고 배수 동점이 있으면 이름 옆에 "외 n종" |
| D2 | SR 부족분 추천 | **선물 선택 상자 N개** (상자를 학생별 최고 효율 SR 로 교환 가정) + 해당 SR 이름 병기 ("또는 ○○ N개") |
| D3 | 현재 랭크 진행 EXP 입력 | **현재 랭크 구간 안에서 쌓은 EXP** 로 받음 (누적 EXP 아님). 게임 표시 방식 확인 전까지 이 기준 |
| D4 | 미출시 학생 (Global 기준 14명) | 학생 선택 모달에서 숨기지 않고 **"미출시" 배지** 표시 |
| D5 | 홈 화면 카드 | **추가하지 않음** (보고서 계산기와 동일하게 사이드바만) |

---

## 2. 화면 구성

```
인연랭크 계산기
──────────────────────────────────────────────
[학생 선택]   (아이콘 + 이름, 클릭 시 검색 모달)

[입력]
  현재 랭크 [  ]   현재 랭크 진행 EXP [  ]   목표 랭크 [100]

[보유 선물]   — 선택 학생 기준, 배수별 그룹 → 그룹 안 개당 EXP 순   (예: 시로코)
  ×4  [아이콘] 싱그러운 꽃다발 (한정)       240/개   [  ]
  ×4  [아이콘] 아름다운 꽃다발 (한정)       240/개   [  ]
  ×3  [아이콘] 하루 세 번 덤벨 세트         180/개   [  ]
  ×3  [아이콘] 페로로 휠 슬라이드 (SR)       60/개   [  ]
  ×3  …  (미쿠 포토 카드 · 반짝이는 꽃다발 — 한정, 60/개)
  ×2 / ×1  (기본 접힘)
  ──
  [아이콘] 선물 선택 상자 → 페로로 휠 슬라이드 (×3, 60/개)   [  ]

[결과]
  ① 필요 EXP      12,345  (현재 → 목표, 진행 막대)
  ② 보유분 EXP     8,000  → 도달 가능 랭크 47 (+120 EXP)
  ③ 부족 4,345 EXP
       고급 선물: 하루 세 번 덤벨 세트 (×3, 180/개) 25개
       일반 선물: 선물 선택 상자 73개 (또는 페로로 휠 슬라이드 73개, ×3 · 60/개)
```

- 학생 미선택이 기본 상태 — 결과 영역 대신 안내 문구. 미출시 학생 선택 시 결과 위에 "미출시 학생" 안내 (D4).
- 정렬은 **배수 (반응 단계) 그룹 → 그룹 안 개당 EXP 내림차순**. 즉 ×4 SR (80) 이 ×3 SSR (180) 보다 위 — "개당 EXP 순" 이 아님에 주의.
- 효율표는 ×2 / ×1 그룹 기본 접힘 (입력 대상이 많아 스크롤 부담).
- 숫자 입력은 전부 `components/form/NumberInput`.
- 현재 랭크 변경 시 진행 EXP 최대값 (`expDelta[current + 1] − 1`) 이 바뀐다. `NumberInput` 은 `max` prop 이 바뀌어도 기존 값을 재보정하지 않으므로 **페이지의 current 변경 핸들러가 progress 를 clamp** 한다. 목표 랭크도 `target ≥ current` 로 보정.

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
| `requiredBondExp(current, progress, target)` | `CUMULATIVE[target] − CUMULATIVE[current] − progress` (≥ 0). progress = 현재 랭크 구간 안 EXP (D3), `0 ≤ progress < expDelta[current + 1]` (current = 100 이면 0) |
| `maxBondFromExp(current, progress, exp)` | 보고서 계산기 `maxLevelFromExp` 와 같은 방식 → `{ rank, leftover }` |
| `buildGiftTable(student, items, commonTags)` | 선물별 `{ item, mult, expPerItem, limited }` — `(mult desc, expPerItem desc, id asc)` 정렬. `limited` = Global 기준 `Craftable · Shop · StageDrop` 모두 false |
| `choiceBoxValue(student, box, items, commonTags)` | 상자 `Items` 중 이 학생 최고 효율 선물 → `{ item, mult, expPerItem }` |
| `holdingsExp(table, counts, boxes)` | 보유 선물 + 상자 환산 EXP 합계 |
| `suggestShortfall(remainingExp, table, boxValue)` | **SSR**: 제조 가능 (limited=false) SSR 정렬 맨 앞 1종 → `{ item, count, tiedCount }` (D1). **SR**: `ceil(remainingExp / boxValue.expPerItem)` 상자 개수 + 환산 대상 SR (D2) |

### 3.4 지역 인덱스

SchaleDB 지역 배열은 `[Jp, Global, Cn]`. 한섭은 Global 에 포함되므로 **인덱스 1** 사용. `Craftable` 은 전 지역 동일 (§0) 이라 한정 판정엔 영향 없음. `IsReleased[1]` 로 미출시 판정 (D4).

### 3.5 부족분 추천 규칙 (D1 · D2)

- **SSR**: 동점 선물들은 개당 EXP 가 같으므로 어느 것을 골라도 필요 개수는 같다 → 정렬 맨 앞 1종의 개수만 계산. 동점 수는 표시용 (`외 n종`). 예: 제조 SSR 13종이 전부 ×2 인 학생 → "레이스 베개 외 12종 (×2, 120/개) N개".
- **SR**: 선물 선택 상자 내용물 = 일반 선물 35종 전부 → "상자 N개를 최고 효율 SR 로 교환" 과 "최고 효율 SR N개" 는 같은 계산. 상자 1개 값이 학생별로 하나로 정해져 동점 문제 없음. 상자 획득 경로가 제한적이므로 SR 이름 병기.
- 한정 선물 (5996~5999) 은 두 경로 모두에서 자연 제외 (SSR 은 `Craftable` 필터, SR 은 상자 내용물에 없음).
- 둘은 **대안** 이다 (SSR 만으로 채우거나, 상자만으로 채우거나). 혼합 최적화는 하지 않음.

---

## 4. 파일 변경 계획

| 파일 | 작업 |
|---|---|
| `my-site/src/service/calculator/utils/bondCalc.ts` | 신규 — §3.3 순수 함수 |
| `my-site/src/service/calculator/pages/BondCalcPage.tsx` | 신규 — 페이지 |
| `my-site/src/components/student/StudentPickerModal.tsx` | 신규 — 플래너 [AddStudentModal](my-site/src/service/planner/components/AddStudentModal.tsx) 의 검색 + 그리드를 공통 컴포넌트로 추출 (`title`, `disabledIds`, `showUnreleasedBadge` prop). `components/` 는 폴더 단위 (`form/`, `navigation/` …) 라 `student/` 하위에 둔다. `AddStudentModal` 은 wrapper 로 전환하고 `showUnreleasedBadge` 미사용 — **플래너 동작 · 화면 무변경** |
| `my-site/src/types/schaledb.ts` | `SchaleDBItem` 에 `Craftable?` / `Shop?` / `StageDrop?: boolean[]` 추가. `SchaleDBStudent.IsReleased` 타입 확인 (실데이터 `boolean[3]`) |
| `my-site/src/router/index.tsx` | `calculator/bond` → `BondCalcPage` |
| `my-site/src/components/navigation/Sidebar.tsx` | 계산기 그룹에 "인연 계산기" 추가 |
| `CLAUDE.md` | 라우트 표 + 계산기 설명 |
| (변경 없음) `HomePage.tsx` | 홈 카드 추가하지 않음 (D5) |

---

## 5. 진행 순서 (커밋 단위)

| # | 커밋 | 검증 |
|---|---|---|
| 1 | `add/선물 선택 상자를 재화 인벤토리에 추가` — **작업 완료, 미커밋** (`schaledb.ts` · `bondGifts.ts` · `inventoryCatalog.ts`) | type-check, 실데이터로 카탈로그 53개 확인 완료 |
| 2 | `add/인연 계산기 순수 함수 — bondCalc` + `schaledb.ts` 획득 경로 필드 | type-check + 실데이터 스크립트: 시로코 (상자 → 페로로 휠 슬라이드 ×3, SSR 추천 = 하루 세 번 덤벨 세트 ×3), 제조 SSR 13종 동점 학생 1명 (`외 12종`), 콜라보 학생 1명 (상자 ×1 = 20), 진행 EXP 경계값 |
| 3 | `md/StudentPickerModal 공통 컴포넌트 추출` | type-check, 플래너 "학생 추가" 동작 동일 확인 |
| 4 | `add/인연 계산기 페이지 (/calculator/bond)` + 라우트 + 사이드바 | type-check, build, `npm run dev` 수동 확인 |
| 5 | `md/CLAUDE.md + 계획 문서 갱신` | — |

### 수동 확인 체크리스트 (4단계)

- [ ] 학생 선택 → 효율표가 학생마다 다르게 정렬되는지 (예: 시로코 ×4 = 싱그러운 · 아름다운 꽃다발, ×3 = 하루 세 번 덤벨 세트 · 페로로 휠 슬라이드 (SR) · 미쿠 포토 카드 · 반짝이는 꽃다발)
- [ ] 현재 랭크 진행 EXP 를 넣으면 필요 EXP 가 그만큼 줄어드는지, 현재 랭크를 바꾸면 진행 EXP 가 새 최대값 안으로 보정되는지
- [ ] 부족분: SSR 1종 개수 (+ 동점 시 "외 n종"), SR 은 선물 선택 상자 개수 + SR 이름 병기
- [ ] 미출시 학생에 "미출시" 배지, 플래너 "학생 추가" 모달은 이전과 동일
- [ ] 보유 선물 / 상자 입력 → 도달 랭크 · 잔여 EXP 갱신
- [ ] 부족분 추천에 한정 선물 (5996~5999) 이 나오지 않는지
- [ ] 현재 ≥ 목표, 목표 100, 학생 미선택 등 경계 상태
- [ ] 다크 모드 / 모바일 폭

---

## 6. 미결 / 확인 필요

| 항목 | 영향 | 처리 |
|---|---|---|
| **꽃다발 EXP** — SchaleDB 는 싱그러운 / 아름다운 꽃다발 ExpValue 60 (×4 = 240), [PLAN_bond_rank.md](PLAN_bond_rank.md) 의 사진 메모는 "이벤트 고급선물 = 일반선물 수치" (×4 = 80) | 꽃다발 **보유분** 계산만 달라짐. 부족분 추천은 한정 제외라 무관 | 게임 내 확인 전까지 SchaleDB 값 사용 + "한정" 배지 |
| 획득 경로 지역 기준 (Global = 한섭) | 한정 · 미출시 판정 | Global(인덱스 1) 로 진행, 코드 주석 명시. `Craftable` 은 전 지역 동일 확인됨 |
| 진행 EXP 의 게임 표시 방식 (랭크 내 EXP / 누적 EXP) | 입력 의미 | D3 (랭크 내 EXP) 로 진행, 게임 확인 후 필요 시 라벨 · 계산 조정 |
| `FavorStatValue` 구간 ↔ 랭크 대응 | 스탯 표시 기능 | 확인 후 후속 단계에서 추가 |
| 인연 EXP 곡선 출처 이미지 (`자료/인랭 계산기/…webp`) 가 저장소에 없음 | 곡선 재검증 불가 | 패치 시 외부 자료로 재검증 |

---

## 7. 후속 (이번 범위 밖)

- **B안 — 기간 시뮬레이터**: 쓰다듬기 (15 EXP/회, 일일 횟수 필요), 스케줄 (지역 1~10 = 15 / 11 = 20 / 12 = 25, 보너스 50 — [PLAN_bond_rank.md](PLAN_bond_rank.md) 사진 메모), 카페 초대권 등. 일일 횟수 · 티켓 수 데이터 확보 후.
- **플래너 반영**: 계산기 함수로 플래너 인연 계산의 두 한계 해소 — ① 현재 랭크 진행 EXP 미반영, ② Phase B 부족분 권장에 한정 선물 (꽃다발) 이 선택되는 문제. 선물 선택 상자 계산 반영 여부 (애장품 경합 포함) 도 이때 결정.
- **선호 선물 표시**: 학생 상세 / 플래너 학생 화면에 ×4 / ×3 선물 목록.

---

## 8. 검증 기록 (2026-10-02)

계획 작성 직후 코드 + SchaleDB 실데이터로 재검증. 아래를 반영.

| # | 지적 | 반영 |
|---|---|---|
| V1 | 제조 SSR 최고 배수 동점 (2종 11명, 13종 5명) 처리 누락 | D1 — 개수는 동점과 무관하므로 맨 앞 1종 + "외 n종" |
| V2 | 진행 EXP 입력 의미 미정 + `NumberInput` 이 max 변경 시 재보정 안 함 | D3 + §2 페이지 clamp 규칙 |
| V3 | Global 미출시 학생 14명 처리 미정 | D4 — "미출시" 배지 (플래너 모달은 무변경) |
| V4 | 상자 환산 예시 "(×4, 80)" 이 실제와 다름 — 270명이 ×3 (60) | §0 · §2 예시 정정 |
| V5 | 체크리스트의 시로코 ×3 예시 불완전 (실제 4종) | §5 정정 |
| V6 | 화면 예시 ③ 의 덤벨을 ×4 로 표기 (시로코 기준 ×3) | §2 예시를 시로코 실데이터로 교체 |
| V7 | "효율순" 표기가 실제 정렬 (배수 우선) 과 다름 | §2 정렬 규칙 명시 |
| V8 | 홈 카드 여부 미정 | D5 — 추가하지 않음 |
| V9 | `StudentPickerModal` 위치가 `components/` 폴더 규칙과 다름 | `components/student/` 로 변경 |
| V10 | SR 부족분 추천 방식 (사용자 제안) | D2 — 선물 선택 상자 개수 기준. 상자 내용물 = 일반 선물 35종 전부라 최고 효율 SR 개수와 같은 계산 |

확인됨 (변경 없음): §0 수치 전반, 재사용 함수 · 경로 실재, Global 기준 `Craftable` 의 지역 무관성, 커밋 단계 구성.
