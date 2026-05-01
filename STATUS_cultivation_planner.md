# 학생 육성 플래너 — 진행 현황 및 향후 계획

> 작성일: 2026-04-29
>
> 원본 설계 문서: [PLAN_cultivation_planner.md](PLAN_cultivation_planner.md)
>
> **요약** : MVP 범위(학생 레벨 / 고유장비 / 고유무기 레벨 / 일반 장비)는 working tree 에 모두 구현 완료. **아직 커밋되지 않음** — 단일 워킹트리에 PR#1~#8 변경분이 누적되어 있으며, 커밋·검증·정리가 다음 단계.

---

## 1. 한눈에 보는 진행률

| PR 단계 (PLAN §14) | 산출물 | 상태 |
|---|---|---|
| PR#1 — DB 마이그레이션 | [supabase/migrations/20260420_cultivation_planner_up.sql](supabase/migrations/20260420_cultivation_planner_up.sql), [_down.sql](supabase/migrations/20260420_cultivation_planner_down.sql) | ✅ 작성 완료 (Supabase Studio 적용·롤백 검증은 미확인) |
| PR#2 — `AuthRoute` 가드 + 타입 | [components/guards/AdminRoute.tsx:41-54](my-site/src/components/guards/AdminRoute.tsx#L41-L54), [types/planner.ts](my-site/src/types/planner.ts) + [types/index.ts](my-site/src/types/index.ts) 배럴 | ✅ |
| PR#3 — 리포지토리 | [repositories/plannerRepository.ts](my-site/src/repositories/plannerRepository.ts) (7 메서드) | ✅ |
| PR#4 — SchaleDB 확장 + 계산 로직 | [lib/schaledb.ts:15-16](my-site/src/lib/schaledb.ts#L15-L16) `config` 엔드포인트, [types/schaledb.ts](my-site/src/types/schaledb.ts) `SchaleDBItem/Equipment/Region/Config`, [service/planner/utils/cultivationCalculator.ts](my-site/src/service/planner/utils/cultivationCalculator.ts), [tables/](my-site/src/service/planner/utils/tables/) | ✅ |
| PR#5 — 페이지 기본 레이아웃 + 자동 저장 | [CultivationPlannerPage.tsx](my-site/src/service/planner/pages/CultivationPlannerPage.tsx) | ✅ |
| PR#6 — 목표치 입력 UI | [LevelTargetInput](my-site/src/service/planner/components/LevelTargetInput.tsx) / [GearTargetInput](my-site/src/service/planner/components/GearTargetInput.tsx) / [WeaponTargetInput](my-site/src/service/planner/components/WeaponTargetInput.tsx) / [EquipmentTargetInput](my-site/src/service/planner/components/EquipmentTargetInput.tsx) + [StudentCard](my-site/src/service/planner/components/StudentCard.tsx) | ✅ |
| PR#7 — 인벤토리 + 부족 리포트 | [InventoryPage.tsx](my-site/src/service/planner/pages/InventoryPage.tsx) (별도 페이지로 분리), [DeficitPanel](my-site/src/service/planner/components/DeficitPanel.tsx), [MaterialCell](my-site/src/service/planner/components/MaterialCell.tsx), [InventoryItemRow](my-site/src/service/planner/components/InventoryItemRow.tsx) | ✅ |
| PR#8 — 사이드바 "플래너" 그룹 + 라우트 표 | [Sidebar.tsx:33-43](my-site/src/components/navigation/Sidebar.tsx#L33-L43), [router/index.tsx:91-98](my-site/src/router/index.tsx#L91-L98), [CLAUDE.md](CLAUDE.md) 라우트 표 | ✅ |

**전체 8/8 완료 — 단, 커밋 분할 + RLS·E2E 검증 + 일부 추가 기능(성급업·정렬 DnD) 미반영.**

---

## 2. 원래 계획 대비 변경·추가된 사항

PLAN 문서에 없거나 다르게 구현된 부분:

| 항목 | PLAN | 실제 구현 | 비고 |
|---|---|---|---|
| 인벤토리 화면 | `CultivationPlannerPage` 내부 `InventoryPanel` 컴포넌트 | **별도 페이지 `/planner/inventory`** 로 분리 ([InventoryPage.tsx](my-site/src/service/planner/pages/InventoryPage.tsx)) + 사이드바 "재화 인벤토리" 메뉴 추가 | 페이지 길이/검색 UX 분리 이득. 플래너 페이지에서 "재화 인벤토리 편집 →" 링크로 이동 |
| 인벤토리 그룹화 | 단일 패널 | [inventoryCatalog.ts](my-site/src/service/planner/utils/inventoryCatalog.ts) 로 그룹 빌드: `synthetic` / `pieces-{Category}` / `gear-favor` / `artifacts` / `gear-other` | 검색 + 그룹 펼침 토글 |
| 재료 라벨/아이콘 매핑 | 페이지에서 인라인 처리 | [materialInfo.ts](my-site/src/service/planner/utils/materialInfo.ts) 헬퍼로 추출 | synthetic 키(`credit`/`student_exp`/`weapon_exp`) 라벨링 일원화 |
| 학생 레벨/무기 테이블 | `tables/*.ts` 에 직접 하드코딩 | **데이터는 `data/planner/*.json`, 모듈은 `tables/*.ts` 가 import 후 `cumSum` 으로 누적값 파생** | 정적 자료를 코드와 분리 — 데이터 갱신 시 ts 수정 불필요 |
| 무기 성급업(엘레프) | 범위 밖 | 데이터·모듈만 추가됨: [data/weapon_star.json](my-site/src/data/weapon_star.json), [tables/weaponStar.ts](my-site/src/service/planner/utils/tables/weaponStar.ts) | **계산기/UI 미연결** — 다음 단계 후보 |
| Synthetic 키 | PLAN 미명시 | 명시적 도입: `'credit' | 'student_exp' | 'weapon_exp'` | items.min.json 에 1:1 대응 없는 자원을 키로 표현 |
| 사이드바 노출 | 비회원에게도 노출 (계획대로) | 동일 | `AuthRoute` 가 클릭 시 `/login` 으로 유도 |
| 자동 저장 | StudentCard / 인벤토리 둘 다 500ms 디바운스 | 동일 + "저장 중 → 저장됨" 뱃지 ([StudentCard.tsx:150-167](my-site/src/service/planner/components/StudentCard.tsx#L150-L167), [InventoryPage.tsx:219-237](my-site/src/service/planner/pages/InventoryPage.tsx#L219-L237)) | 일관된 UX |

---

## 3. 미해결·검증 필요 항목

### 3.1 출시 전 반드시 확인

- [ ] **마이그레이션 적용** — `20260420_cultivation_planner_up.sql` 을 실제 Supabase 프로젝트에 실행, `_down.sql` 으로 롤백 검증 (PLAN §14 PR#1 의 요구사항)
- [ ] **RLS 동작 확인** — anon 키로 `GET /rest/v1/planner_students` / `planner_inventory` 호출 시 `[]` 반환되는지 (PLAN §13 보안 체크리스트)
- [ ] **`auth.users` cascade** — 테스트 계정 삭제 시 두 테이블 모두 자동 정리되는지
- [ ] **`unique (user_id, student_id)` 위반** — 같은 학생 추가 시 사용자에게 의미 있는 메시지 ([plannerRepository.ts:44-47](my-site/src/repositories/plannerRepository.ts#L44-L47) 에서 처리됨, 토스트/알림 UX 검증)
- [ ] **클라이언트 검증** — jsonb 내부는 서버 검증이 없으므로 음수/NaN/타겟<현재 등 invalid input 차단 (현재 각 input 컴포넌트가 clamp + 자동 보정 중, 엣지 케이스 추가 점검 필요)
- [ ] **`npm run type-check`** — 타입 에러 0 확인 (현재 working tree 상태에서 미실행)
- [ ] **`npm run build`** — 빌드 성공 확인

### 3.2 PLAN 에 있었으나 누락된 부분

- [ ] **`config.min.json` 의 상한값 동적 사용** — 엔드포인트는 [schaledb.ts:16](my-site/src/lib/schaledb.ts#L16) 에 추가됐으나, 실제 input 컴포넌트는 [tables/studentExp.ts](my-site/src/service/planner/utils/tables/studentExp.ts) / [tables/weaponLevel.ts](my-site/src/service/planner/utils/tables/weaponLevel.ts) 의 **하드코딩된 maxLevel** 을 사용 중. PLAN §8.1 에서는 "config 에서 동적 조회" 명시 — 지역(KR/Global/JP)별 상한 차이가 의미 있어지면 보강 필요
- [ ] **학생 카드 정렬 (DnD)** — `PlannerRepository.reorderStudents` 메서드는 구현됐으나 [CultivationPlannerPage.tsx](my-site/src/service/planner/pages/CultivationPlannerPage.tsx) 가 호출하지 않음. dnd-kit 통합 미구현
- [ ] **"초기화" 버튼** — PLAN §11.1 레이아웃 헤더에 있었으나 미구현

### 3.3 추가 발견 사항

- [ ] **무기 성급업 엘레프 UI** — [tables/weaponStar.ts](my-site/src/service/planner/utils/tables/weaponStar.ts) 만 추가되고 입력/계산기 연결 안 됨. 학생 고유 엘레프(items.min.json 의 10000+ id) 매핑 로직도 미구현
- [ ] **고유무기 레벨업의 `student` 인자 미사용** — [cultivationCalculator.ts:122](my-site/src/service/planner/utils/cultivationCalculator.ts#L122) `_student` 로 받았으나 실제로는 학생별 무기 EXP 차이가 있는지 (없다면 인자 자체 제거 검토)
- [ ] **EquipmentTargetInput 의 `current[idx] ?? 1`** — 데이터가 없을 때 1 로 폴백 ([EquipmentTargetInput.tsx:52](my-site/src/service/planner/components/EquipmentTargetInput.tsx#L52)) — 슬롯이 잠겨있는 학생/티어 0 케이스가 있다면 재검토

---

## 4. 향후 계획

### 4.1 단기 (출시 전 정리)

1. **커밋 분할** — 현재 단일 working tree 변경분을 PLAN 의 PR#1~#8 단위로 끊어 커밋 (또는 일관된 단일 커밋으로 합칠지 결정). 다른 변경분 ([CLAUDE.md](CLAUDE.md), [Sidebar.tsx](my-site/src/components/navigation/Sidebar.tsx), [schaledb.ts](my-site/src/lib/schaledb.ts), [EligmaCalcPage.tsx](my-site/src/service/calculator/pages/EligmaCalcPage.tsx) 등)도 같이 정리
2. **§3.1 검증 항목 일괄 수행** — 마이그레이션 적용 + RLS + cascade + type-check + build
3. **DnD 정렬 + 초기화 버튼** — UX 마무리
4. **성급업(엘레프) UI** — 데이터는 이미 있으니, `WeaponTargetInput` 에 성급 셀렉터 추가하거나 별도 `WeaponStarInput` 컴포넌트로 분리. 학생별 고유 엘레프 id 매핑은 `SchaleDBStudent` 의 어느 필드에서 얻는지 추가 조사 필요 (PLAN §16 에는 명시되지 않음)

### 4.2 중기 (PLAN §8.6 향후 확장)

SchaleDB 학생 JSON 에 **이미 존재하는 필드** 를 활용해 하드코딩 없이 추가 가능:

| 기능 | 활용 필드 | 비고 |
|---|---|---|
| 일반 스킬 (Normal/Passive/Sub) 레벨업 | `SkillMaterial`, `SkillMaterialAmount` | [types/schaledb.ts](my-site/src/types/schaledb.ts) `SchaleDBStudent` 에 필드 보강 필요 |
| EX 스킬 레벨업 | `SkillExMaterial`, `SkillExMaterialAmount` | 동상 |
| 잠재력 (공/체/치) 강화 | `PotentialMaterial` + 자체 누적 테이블 | 잠재력 단계당 재료/크레딧 공식은 별도 조사 |
| 호감도 (Bond) | `FavorItemTags`, `FavorItemUniqueTags` | 호감도 → 선물 효율은 재료 매핑 필요. 인벤토리 카탈로그 (`gear-favor` 그룹) 와 통합 가능 |

→ 각각 새 입력 컴포넌트 (`SkillTargetInput`, `PotentialTargetInput` ...) 와 `cultivationCalculator` 의 함수 추가. `PlannerTargets` 인터페이스에 optional 필드 확장.

### 4.3 장기 (범위 외 → 보류)

- **플래너 공유/내보내기** — 읽기 전용 슬러그 URL 또는 이미지 캡처 (`modern-screenshot` 이미 의존성에 있음)
- **비회원 로컬 모드** — `localStorage` 기반 임시 저장, 로그인 시 마이그레이션
- **이벤트 플래너 등 추가 도메인** — `/planner/event`, `/planner/raid` 등 동일 네임스페이스 하위로 확장. 공통 `PlannerLayout` / `MaterialCell` / `inventoryCatalog` 추출 시점은 두 번째 플래너 도입 시
- **다중 플래너 / 시나리오 비교** — "메인 플래너", "이벤트 대비 플래너" 등 분리

---

## 5. 알려진 제약

| 항목 | 제약 | 대응 |
|---|---|---|
| 학생 레벨 EXP / 무기 EXP 테이블 | SchaleDB 호스팅 안 함 → 하드코딩 ([data/planner/*.json](my-site/src/data/planner/)) | 게임 패치로 테이블 변경 시 수동 업데이트 필요. 출처 주석 유지 |
| 지역(KR/Global/JP) 상한값 | 현재 KR/Global 기준 하드코딩 (`STUDENT_MAX_LEVEL=90`, `WEAPON_MAX_LEVEL=60`) | `config.min.json` 동적 조회 미반영 — JP 지원 필요 시 보강 |
| 인벤토리 jsonb 검증 | 서버 검증 없음 | 클라이언트 input 에서 clamp. 악의적 클라이언트 우회 시 자기 데이터만 망가뜨릴 수 있음 (보안 이슈는 아님) |
| 학생 데이터 캐시 | `fetchSchaleDB` 가 `schaledbCache` 를 통해 캐시 | 첫 페이지 진입 시 4개 JSON(`students`/`items`/`equipment` + repository) 병렬 페치. 모바일 첫 로드 시간 모니터링 필요 |
| 일반 장비 Recipe 깊이 | 현재 재귀 평탄화 ([cultivationCalculator.ts:161-181](my-site/src/service/planner/utils/cultivationCalculator.ts#L161-L181)) | T1~T10 깊이는 검증됐으나, 순환 참조가 발생하면 무한 루프 → SchaleDB 데이터 신뢰 가정. 방어적 가드 필요 시 depth 카운터 추가

---

## 6. 다음 액션 추천 (작업 재개 시 우선순위)

1. **§3.1 검증 일괄 수행** (가장 위험도 높음 — 미배포 마이그레이션·RLS)
2. **커밋 분할 + PR 푸시** — 현재 working tree 정리
3. **DnD 정렬 + 초기화 버튼** — UX 미완성 (PLAN 에 명시됨)
4. **무기 성급업(엘레프) UI** — 데이터만 떠 있는 상태 정리
5. **§4.2 중기 확장** — 스킬 → 잠재력 → 호감도 순서 추천 (학생 JSON 의 필드 의존도 순)
