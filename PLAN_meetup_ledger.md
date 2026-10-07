# 오프라인 모임 회계 계산기 계획 (`/admin/meetups`)

> 관리자 전용으로 오프라인 모임의 **회비 장부 + 더치페이 정산**을 한 화면에서 처리한다.
> 결산 결과는 비밀 노트처럼 **슬러그 링크(`/m/:slug`)로 참가자에게 공개**할 수 있다.
> 작성일: 2026-10-06 · 검증 반영: 2026-10-06 (§9)
>
> **상태 (2026-10-06): 구현 완료 · 마이그레이션 up · period · treasurer 적용 확인 (editor_read 는 조회로 확인 불가) · 실제 계정 확인 후 main 병합 · 배포.** 계획과 달라진 점은 §10.
>
> 관련 문서: [PLAN_admin_only_board.md](PLAN_admin_only_board.md) (비밀 노트 — admin 전용 RLS + 슬러그 공개 RPC 원형)
> 관련 파일: [20260418_secret_notes_up.sql](supabase/migrations/20260418_secret_notes_up.sql), [secretNoteRepository.ts](my-site/src/repositories/secretNoteRepository.ts), [SecretNoteViewPage.tsx](my-site/src/service/secretNote/pages/SecretNoteViewPage.tsx), [Sidebar.tsx](my-site/src/components/navigation/Sidebar.tsx)

---

## 0. 결정 사항

| # | 질문 | 결정 |
|---|---|---|
| D1 | 범위 | **회비 장부 + 더치페이 통합 모델** (§2) |
| D2 | 저장 위치 | **Supabase** — 관리자끼리 같은 장부 공유 |
| D3 | 참가자 정보 | **닉네임만** 저장. 연락처 · 계좌번호는 DB 에 남기지 않음 |
| D4 | 결산 공개 | **슬러그 링크로 공개** (`/m/:slug`, 비밀 노트와 같은 RPC 방식) |
| D5 | 권한 | ~~admin 전용~~ → **admin 편집 + editor(부관리자) 열람만** (2026-10-06 변경, §10) |

아래는 계획 작성 중 정한 설계 선택. 검증 단계에서 바꿀 수 있다.

| # | 항목 | 제안 |
|---|---|---|
| D6 | 송금 방식 | 장부별 토글 `총무 경유` (기본) / `송금 건수 줄이기` (§3.4). 총무 미지정이면 `송금 건수 줄이기` 고정 |
| D7 | 공개 데이터 | 저장 시 클라이언트가 만든 **공개용 스냅샷**(`public_snapshot`)만 RPC 로 노출. 내부 메모 · 원본 `data` 는 노출 안 함 (§4.3) |
| D8 | 회비 잔액 처리 | 남으면 `이월` (기본) / `환급`, 모자라면 `추가 징수` (기본) / `총무 부담`. 환급 · 추가 징수는 **참가비 비례** 배분 (§3.3) |
| D9 | 저장 방식 | **명시적 저장 버튼** + 미저장 표시 + 이탈 경고. 자동 저장 없음. 입력 검증 오류가 있으면 저장 불가 (§3.0) |
| D10 | 동시 수정 | `updated_at` 낙관적 잠금. 0행이면 재조회해 `CONFLICT` / `NOT_FOUND` 구분 (§4.4) |
| D11 | 정산 완료 표시 | 완료 체크 시점의 순잔액을 `settledAmount` 로 저장. 이후 금액이 바뀌면 **차액**을 표시 (§2.1, §3.4) |

---

## 1. 범위

### 이번에 하는 것

- 모임 목록 / 생성 / 삭제(soft) / 복구 — `/admin/meetups`
- 모임 장부 편집 — `/admin/meetups/:id`
  - 참가비 구간 (예: `1차` 30,000 / `1+2차` 45,000)
  - 참가자 (닉네임, 참가비 구간, 납부 여부, 정산 완료 여부, 내부 메모)
  - 지출 (항목명, 분류, 금액, 결제자, 충당 방식, 내부 메모)
  - 요약 (총 참가비, 총지출, 회비 잔액, 1인 부담액, 미납자)
  - 정산 송금 목록 + **텍스트 복사** (카톡/디스코드용)
  - 공개 설정 (공개 토글, 링크 복사, 슬러그 재발급)
  - 상태 `진행 중` / `정산 완료` (완료 시 편집 잠금, 다시 열기 가능)
- 공개 결산 페이지 — `/m/:slug` (비로그인 열람, 읽기 전용)

### 이번에 안 하는 것

- 영수증 사진 첨부 (Storage 용량 · 개인정보 고려, 필요 시 2단계)
- 송금 금액 단위 반올림 (100원 / 1,000원 단위) — 1원 단위로 정확히 맞춘다
- 가중치 분담 (예: 1.5인분). 분담은 **균등**, 제외하고 싶은 사람은 분담 대상에서 체크 해제
- 총무 계좌와 모임 통장이 **다른 계좌**인 경우의 구분 (총무 = 모임 통장으로 간주)
- 감사 로그 (`*_logs`) — admin 만 쓰는 리소스라 비밀 노트와 같이 스코프 아웃
- 엑셀 / CSV 내보내기
- **Tauri 앱에서의 공개 링크 복사** — `window.location.origin` 이 앱 내부 주소(`tauri://localhost` 등)라 잘못된 링크가 복사된다. 기존 비밀 노트 링크 복사도 같은 문제. Tauri 앱은 현재 서비스하지 않으므로 **Tauri 배포 준비 시 함께 수정** (공개 사이트 주소 환경변수 등)

---

## 2. 데이터 모델

### 2.1 `MeetupLedgerData` (jsonb `data` 컬럼에 저장)

```ts
/** types/meetup.ts */
export interface MeetupFeeTier {
  id: string;        // newId() — §2.3
  label: string;     // '1차', '1+2차'
  amount: number;    // 원, 정수 ≥ 0
}

export interface MeetupParticipant {
  id: string;
  name: string;              // 닉네임 (D3). 장부 안에서 중복 불가 (§3.0)
  feeTierId: string | null;  // null = 참가비 없음 (더치페이 전용 모임)
  /** 참가비를 **정산 전에 미리** 냈는지. 정산 송금에 참가비를 같이 보낸 경우는 체크하지 않는다 (이중 계산 방지) */
  feePaid: boolean;
  /** 정산 완료 체크 시점의 순잔액 b_i (null = 미완료). 현재 b_i 와 다르면 그 차이가 추가로 주고받을 차액 (D11) */
  settledAmount: number | null;
  memo: string;              // 내부 메모 — 공개 스냅샷 제외
}

export type MeetupExpenseCategory = 'venue' | 'food' | 'goods' | 'transport' | 'etc';
// 대관 / 식음료 / 경품·굿즈 / 교통 / 기타

export interface MeetupExpense {
  id: string;
  label: string;
  category: MeetupExpenseCategory;
  amount: number;                        // 원, 정수 > 0
  paidBy: 'treasury' | string;           // 'treasury' = 모임 통장(총무), 그 외 participant id
  cover: { kind: 'fee' }                 // 회비에서 충당
       | { kind: 'split'; among: string[] }; // 지정 참가자 균등 분담 (participant id 목록)
  memo: string;                          // 내부 메모 — 공개 스냅샷 제외
}

export interface MeetupLedgerData {
  version: 1;
  treasurerId: string | null;            // 총무 participant id
  feeTiers: MeetupFeeTier[];
  participants: MeetupParticipant[];
  expenses: MeetupExpense[];
  surplusMode: 'carry' | 'refund';       // 회비 잔액이 남을 때 (D8)
  deficitMode: 'collect' | 'absorb';     // 회비가 모자랄 때 (D8)
  transferMode: 'hub' | 'min';           // 송금 방식 (D6)
}
```

- 한 모임은 참가자 수십 명 · 지출 수십 건 수준 → **문서 하나(jsonb)로 통째로 읽고 저장**. 플래너 인벤토리(`planner_inventory.items`)와 같은 방식.
- `version` 은 나중에 구조가 바뀔 때 마이그레이션 분기용.
- 참가자를 삭제하면 그 사람을 가리키는 `paidBy` / `among` / `treasurerId` 를 정리해야 한다 → 삭제 전에 "이 참가자가 결제한 지출 N건이 있습니다" 확인 후, 결제자는 `treasury` 로 이동 · 분담 목록에서는 제거 · 총무였다면 `treasurerId = null`. 그 결과 분담 대상이 0명이 된 지출이나 총무가 필요한 상태는 §3.0 검증 오류로 표시되고, 고칠 때까지 저장이 막힌다.

### 2.3 정규화 · id 생성

- **읽을 때 정규화** `normalizeLedgerData(raw)`: 새로 만든 행의 `data` 는 DB 기본값 `{}` 이고, 나중에 필드가 늘어날 수도 있으므로 리포지토리가 읽을 때 빠진 필드를 기본값으로 채운다 (`version: 1`, 빈 배열, `surplusMode: 'carry'`, `deficitMode: 'collect'`, `transferMode: 'hub'`, `settledAmount: null` …).
- **id 생성** `newId()`: `crypto.randomUUID` 가 있으면 사용, 없으면 대체 생성. 휴대폰에서 `http://192.168.x.x:5173` 로 dev 서버에 접속하면 보안 컨텍스트가 아니라서 `randomUUID` 가 없다. `localPlannerRepository` 에 같은 대체 로직(`newId`, 대체 시 `local-<시각>-<난수>`)이 있으므로 `utils/id.ts` 로 옮겨 함께 쓴다 (`local-` 접두어를 조건으로 쓰는 코드는 없음 — 확인함).

### 2.2 세 가지 사용 형태가 모두 이 모델로 표현되는지

| 형태 | 입력 방식 |
|---|---|
| 회비제 | 참가비 구간 설정, 지출은 전부 `cover: fee`, 결제자 `treasury` |
| 더치페이 | 참가비 구간 없음(`feeTierId: null`), 지출은 `cover: split`, 결제자 = 실제 카드 긁은 사람 |
| 혼합 | 1차는 회비로, 2차 술값은 참석자끼리 `split` |

---

## 3. 계산 규칙 (`service/meetup/utils/meetupSettlement.ts`, 순수 함수)

모든 금액은 **정수(원)**. 소수 연산 없음.

### 3.0 입력 검증 `validateLedger(data)` → 오류 목록

오류가 하나라도 있으면 저장 버튼 비활성화 + 오류 목록 표시. 정산 결과 영역은 "입력 오류를 먼저 고치세요" 로 대체.

| 규칙 | 이유 |
|---|---|
| 닉네임 비어 있지 않음, 장부 안에서 중복 없음 (앞뒤 공백 제거 후 비교) | 송금 목록 · 공개 페이지가 닉네임으로 사람을 구분 |
| `split` 지출의 분담 대상 ≥ 1명 | 0명이면 그 금액이 계산에서 빠져 §3.4 불변식이 깨짐 |
| 참가비가 있는 사람이 있거나, 결제자가 `treasury` 이거나, **회비 충당(`cover: fee`) 지출**이 있으면 **총무 지정 필수** | 총무가 없으면 통장 잔액 `b_T` 를 받을/보낼 사람이 없음 (검증 스크립트에서 20,000원이 남는 사례 확인) |
| `paidBy` / `among` / `feeTierId` / `treasurerId` 가 존재하는 id 를 가리킴 | 삭제 후 남은 참조 방지 |
| 금액: 참가비 ≥ 0, 지출 > 0, 정수 | `NumberInput` 이 대부분 막지만 저장 직전에 한 번 더 확인 |

### 3.1 균등 분배 `splitEven(amount, ids)`

- `base = floor(amount / n)`, `rest = amount mod n`
- 목록 순서(참가자 표 순서) 앞의 `rest` 명에게 +1원
- 합계가 항상 `amount` 와 정확히 일치

### 3.2 비례 분배 `splitProportional(amount, weights)`

- 최대 잔여 방식 (각자 `floor(amount × w / Σw)`, 남는 원은 소수부가 큰 순 → 동점은 목록 순서)
- `Σw = 0` (참가비 있는 사람이 없음) → `splitEven` 으로 대체 (0 나누기 방지)

### 3.3 회비 잔액

```
R0 = Σ 참가비(전원, 납부 여부 무관) − Σ cover=fee 지출
```

| 상황 | 모드 | 처리 | 최종 통장 잔액 R |
|---|---|---|---|
| R0 > 0 | `carry` (이월) | 없음 | R0 |
| R0 > 0 | `refund` (환급) | `refund_i = splitProportional(R0, 참가비)` | 0 |
| R0 < 0 | `collect` (추가 징수) | `extra_i = splitProportional(−R0, 참가비)` | 0 |
| R0 < 0 | `absorb` (총무 부담) | 없음 | R0 (음수 = 총무 손실, 경고 표시) |

### 3.4 순잔액과 송금

사람 i:

```
owed_i = 참가비_i + Σ(i 가 분담하는 split 지출의 몫) − refund_i + extra_i
paid_i = (feePaid_i ? 참가비_i : 0) + Σ(i 가 결제한 지출)
b_i    = paid_i − owed_i          // + 받을 돈, − 보낼 돈
```

모임 통장 T (총무):

```
C   = Σ 납부된 참가비 − Σ(T 가 결제한 지출)   // 지금 통장에 있는 돈
b_T = R − C
```

**불변식**: `Σ b_i + b_T = 0` (§3.0 검증을 통과하면 모든 지출이 fee 또는 1명 이상 split 으로 충당되므로 항상 성립). 계산 결과에서 이 합이 0 이 아니면 버그 → 검증 항목 V1.

송금 목록 생성 시 **총무 본인(participant)과 T 는 한 노드로 합친다** (총무 개인 ↔ 모임 통장 사이 송금은 표시하지 않음).

- `hub` (총무 경유, 기본): 모든 사람이 총무와만 주고받음. `b_i < 0` → `i → 총무 |b_i|`, `b_i > 0` → `총무 → i b_i`. 회비제에서 자연스러움. **총무가 지정돼 있어야 선택 가능.**
- `min` (UI 이름 **송금 건수 줄이기**): 받을 사람 / 보낼 사람을 금액 큰 순으로 정렬해 짝짓기 (그리디). 송금 건수 ≤ 잔액 0 이 아닌 노드 수 − 1. 진짜 최소 건수는 NP-hard 라 보장하지 않음 (실사용 규모에서는 대부분 최소와 같음). 더치페이에서 유리. 동점은 목록 순서로 고정 → 같은 입력이면 항상 같은 결과.
- 총무가 없으면 (순수 더치페이) `transferMode` 와 무관하게 `min` 으로 계산하고 토글을 비활성화.

**정산 완료와 차액 (D11)**

- `정산 완료` 체크 → `settledAmount = 현재 b_i` 저장. 체크 해제 → `null`.
- 이후 지출 추가 · 수정으로 `b_i` 가 바뀌면 `diff = b_i − settledAmount` ≠ 0 → 그 사람 행에 "차액 +n원 (받을 돈)" / "차액 −n원 (보낼 돈)" 배지.
- 정산 완료된 사람은 송금 목록에서 **차액만** 남긴다 (`diff` 로 총무와의 송금 생성). 차액이 0 이면 송금 없음.
  - 이때 총무 쪽 남은 잔액 = `−Σ(완료자 diff + 미완료자 b_i)` — 완료자가 이미 총무와 `settledAmount` 만큼 주고받았으므로 성립 (V12).
- **정산 완료 체크는 `hub` 모드에서만 활성화.** `min` 은 완료자가 총무가 아닌 다른 사람과 주고받았을 수 있어, 남은 잔액을 장부만으로 알 수 없다. `min` 으로 바꾸면 기존 완료 표시는 유지하되 체크박스 비활성화 + "총무 경유 모드에서만 정산 완료를 기록합니다" 안내.
- 총무는 정산 완료 체크 대상이 아님 (다른 사람들과의 송금 결과로 자동으로 맞춰짐).

### 3.5 공개 스냅샷 `buildPublicSnapshot(data, meta)`

```ts
interface MeetupPublicSnapshot {
  version: 1;
  generatedAt: string;
  treasurerName: string | null;
  summary: { totalFee; totalExpense; feeCovered; splitTotal; r0; surplusMode; deficitMode; finalBalance };
  expenses: { label; category; amount; payerName; coverLabel }[];   // memo 제외
  participants: { name; tierLabel; owed; paid; balance; feePaid; settled: boolean; diff: number }[]; // memo 제외, diff = 정산 후 차액
  transfers: { from: string; to: string; amount: number }[];        // 닉네임 기준
}
```

공개 페이지는 이 스냅샷을 **그대로 렌더만** 한다 (계산 안 함). 관리자 화면과 공개 화면이 같은 표 컴포넌트를 읽기 전용 모드로 공유.

---

## 4. DB (Supabase)

### 4.1 마이그레이션 `supabase/migrations/20261006_meetup_ledgers_{up,down}.sql`

```sql
create table meetup_ledgers (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  title           text not null,
  meetup_date     date,
  status          text not null default 'open' check (status in ('open', 'closed')),
  share_enabled   boolean not null default false,
  data            jsonb not null default '{}'::jsonb,   -- MeetupLedgerData
  public_snapshot jsonb,                                -- MeetupPublicSnapshot
  created_by      uuid not null references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz                           -- soft delete
);

create index meetup_ledgers_list_idx on meetup_ledgers(meetup_date desc) where deleted_at is null;

-- slug 자동 생성 + updated_at 갱신 (secret_notes_autoslug 와 같은 패턴)
create or replace function meetup_ledgers_autoslug()
returns trigger language plpgsql as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := generate_short_slug();
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger meetup_ledgers_biu
  before insert or update on meetup_ledgers
  for each row execute function meetup_ledgers_autoslug();

alter table meetup_ledgers enable row level security;

create policy "meetup_ledgers_admin_all"
  on meetup_ledgers for all
  using      (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

-- 공개 열람 RPC : 공개 켜짐 + 미삭제 + 스냅샷만
create or replace function get_meetup_settlement_by_slug(p_slug text)
returns table (title text, meetup_date date, status text, public_snapshot jsonb, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select title, meetup_date, status, public_snapshot, updated_at
    from meetup_ledgers
   where slug = p_slug and share_enabled and deleted_at is null
   limit 1;
$$;

revoke all on function get_meetup_settlement_by_slug(text) from public;
grant execute on function get_meetup_settlement_by_slug(text) to anon, authenticated;
```

- **`generate_short_slug()` 재사용**: secret_notes 마이그레이션이 만든 함수. `20260418_secret_notes_down.sql` 이 이 함수를 drop 하므로, 비밀 노트를 롤백하면 모임 회계의 슬러그 생성이 런타임에 깨진다 → up 파일 헤더에 의존성 명시. (plpgsql 함수 본문 안의 호출은 Postgres 가 의존성으로 추적하지 않아 drop 이 막히지 않음)
- down 파일: RPC → trigger → trigger 함수 → table 순서로 drop. `generate_short_slug()` 는 건드리지 않음.
- **SQL 실행은 사용자가 Supabase 대시보드 SQL Editor 에서 직접** (기존 마이그레이션과 동일).

### 4.2 접근 제어

| 주체 | 테이블 직접 | RPC |
|---|---|---|
| admin | 전체 CRUD (RLS) | 가능 |
| editor / user / anon | **불가** (RLS 로 0행) | 공개 켜진 장부의 스냅샷만 |

`AdminRoute` 는 화면만 막는 장치이고, 실제 보호는 RLS.

### 4.3 공개 스냅샷 갱신

- **저장할 때마다** `data` 와 함께 `public_snapshot = buildPublicSnapshot(data)` 를 같이 기록 (공개 여부와 무관하게 항상) → 공개를 켜는 순간 최신 상태가 바로 보인다.
- 공개 끄기 = `share_enabled = false` → RPC 가 0행 → 링크 "찾을 수 없음".
- 슬러그 재발급 = `slug = null` 업데이트 → 트리거가 새 슬러그 (비밀 노트 `regenerateSlug` 와 동일). 기존 링크 즉시 무효.
- **공개 토글 · 슬러그 재발급도 트리거가 `updated_at` 을 갱신한다.** 그대로 두면 장부 화면에서 토글 후 저장할 때 다른 관리자가 없어도 §4.4 충돌이 난다 → 두 요청은 `.select('slug, share_enabled, updated_at')` 로 새 값을 받아, 화면이 들고 있는 `loadedUpdatedAt` 을 갱신한다 (V13).
  - 미저장 변경이 있는 상태에서 토글하면, 토글은 서버에 바로 반영되고 편집 내용은 그대로 미저장으로 남는다. 다른 관리자가 그 사이에 저장했다면 토글 요청도 잠금 조건(`updated_at`)을 걸어 충돌로 처리.
- **계좌번호는 공개 페이지에 나오지 않는다** (D3). 송금 안내 문구는 텍스트 복사 시 입력하는 계좌를 붙이는 방식 (§5.2).

### 4.4 낙관적 잠금 (D10)

```ts
supabase.from('meetup_ledgers')
  .update({ title, meetup_date, status, data, public_snapshot })
  .eq('id', id)
  .eq('updated_at', loadedUpdatedAt)   // 불러온 시점 값
  .select()
```

- 결과 0행이면 원인이 셋 중 하나 — 다른 관리자가 먼저 수정 / 다른 관리자가 삭제 / 권한 상실 (RLS 는 거부된 행을 오류 없이 0행으로 처리). `id` 로 한 번 재조회해서 구분:
  - 행이 있음 (`deleted_at is null`) → `AppError('다른 관리자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요.', 'CONFLICT')`
  - 행이 없음 / 삭제됨 → `AppError('장부를 찾을 수 없습니다. 삭제되었거나 권한이 없습니다.', 'NOT_FOUND')`
- `AppErrorCode` 에 `'CONFLICT'` 추가 (기존 5종 + 1)
- 충돌 시 편집 내용은 화면에 남겨 둔다 (사용자가 텍스트 복사 등으로 옮긴 뒤 새로고침할 수 있게)
- PostgREST 가 돌려준 `updated_at` 문자열(마이크로초 포함)을 그대로 다시 넘겨 비교 → 정밀도 문제 없는지 검증 V7

---

## 5. 화면

### 5.1 `/admin/meetups` — `MeetupManagePage`

- 목록: 날짜 · 제목 · 상태 배지 · 참가자 수 · 회비 잔액 · 공개 여부 아이콘
- `새 모임` → 제목 · 날짜 입력 모달 → 생성 후 상세로 이동 (빈 `MeetupLedgerData` 기본값)
- 삭제: `confirm('정말 삭제하시겠습니까?')` → soft delete
- 하단 접기 섹션 `삭제된 모임` (복구 버튼) — 별도 라우트(`/admin/deleted-*`)는 만들지 않음

### 5.2 `/admin/meetups/:id` — `MeetupLedgerPage`

```
[제목 · 날짜 · 상태]                         [저장] (미저장 ●)
─ 참가비 구간 ─  1차 30,000 / 1+2차 45,000  [+ 구간]
─ 참가자 ─      닉네임 | 구간 | 납부☑ | 정산☑ | 총무◉ | 메모 | 🗑     [+ 참가자]
─ 지출 ─        항목 | 분류 | 금액 | 결제자 | 회비/분담(대상 선택) | 메모 | 🗑
─ 요약 ─        총 참가비 · 총지출 · 회비 잔액(R0) · 잔액 처리 모드 · 미납자
─ 정산 ─        송금 방식 토글 · 사람별 부담/낸 돈/순잔액 표 · 송금 목록
                [텍스트 복사] (계좌 입력란 — 저장 안 함)
─ 공개 ─        공개 토글 · 링크 복사 · 슬러그 재발급
```

- 금액 입력은 전부 `NumberInput`
- 참가자 추가는 여러 명을 한 번에 붙여넣기 가능 (줄바꿈/쉼표 구분 닉네임) — 현장 입력 편의
- 분담 대상 선택: 기본 `전원`, 펼치면 체크박스 목록
- 장부 상태 `정산 완료` 면 입력 비활성화 + `다시 열기` 버튼 (참가자별 정산 완료 체크와는 별개)
- 참가자별 `정산☑` 은 `hub` 모드에서만 활성화, 차액이 있으면 행에 차액 배지 (§3.4)
- 입력 오류(§3.0)는 해당 행 빨간 테두리 + 상단 오류 목록, 저장 버튼 비활성화
- 이탈 경고: 미저장 변경이 있으면 `beforeunload` (플래너 `InventoryPage` 와 같은 패턴) + 라우터 이동은 `useBlocker` 로 `confirm` (data router 라 사용 가능)
- 모바일: 표 대신 카드형 행, 하단 요약 바 (인연 계산기와 같은 패턴 — 결과 카드가 보이면 숨김)

텍스트 복사 예시:

```
[10/12 블루아카 오프모임 정산]
총 참가비 450,000 / 총지출 432,000 / 잔액 18,000 (이월)

송금 (→ 총무 홍길동, 국민 000-000-000)
· 아리스 → 총무 45,000
· 총무 → 유우카 12,500
```

### 5.3 `/m/:slug` — `MeetupSettlementViewPage`

- RPC 로 스냅샷 조회 → 제목 · 날짜 · 요약 · 지출 내역 · 사람별 표 · 송금 목록 (정산 완료 ✓, 차액이 있으면 차액 표시)
- 없음/비공개/삭제 → "결산을 찾을 수 없습니다."
- `MainLayout` 하위 (비밀 노트 `/n/:slug` 와 같은 트레이드오프)

---

## 6. 파일 배치

| 파일 | 내용 |
|---|---|
| `supabase/migrations/20261006_meetup_ledgers_{up,down}.sql` | §4.1 |
| `my-site/src/types/meetup.ts` | §2.1 + `MeetupLedger` (행 타입) + `MeetupPublicSnapshot` |
| `my-site/src/utils/AppError.ts` | `'CONFLICT'` 추가 |
| `my-site/src/utils/id.ts` | `newId()` — `localPlannerRepository` 에서 이동, 두 곳에서 공용 (§2.3) |
| `my-site/src/service/meetup/utils/meetupSettlement.ts` | §3 순수 함수 (`validateLedger`, `normalizeLedgerData`, `splitEven`, `splitProportional`, `computeSettlement`, `buildTransfers`, `buildPublicSnapshot`, `buildShareText`) |
| `my-site/src/repositories/meetupRepository.ts` | `getLedgers` / `getLedgerById` / `createLedger` / `updateLedger`(잠금 + 0행 재조회) / `setShareEnabled` · `regenerateSlug`(새 `updated_at` 반환) / `deleteLedger` / `getDeletedLedgers` / `restoreLedger` / `getSettlementBySlug`(RPC). AppError 만 throw. **SDK 사용** — 비밀 노트 · 플래너와 같은 선택. `af8ff4f` 의 auth lock 교착은 한 번 걸리면 이후 SDK 쿼리 전체가 멈추는 문제라 이 리포지토리도 같은 수준의 위험을 진다. 저장이 멈추는 현상이 생기면 `lib/supabaseRest.ts` 로 전환하되, 현재 `restUpdate` 는 `Prefer: return=minimal` 이라 갱신 행 수를 알 수 없으므로 **`return=representation` 으로 결과를 돌려주는 변형이 필요** (0행 = 충돌 판정) |
| `my-site/src/service/meetup/components/` | `SettlementSummary`, `ParticipantBalanceTable`, `TransferList` — 관리자/공개 화면 공용 (읽기 전용 prop) |
| `my-site/src/service/admin/pages/MeetupManagePage.tsx`, `MeetupLedgerPage.tsx` | 관리 페이지 (admin 페이지는 `service/admin/pages/` 컨벤션) |
| `my-site/src/service/meetup/pages/MeetupSettlementViewPage.tsx` | 공개 페이지 (비밀 노트 공개 뷰와 같은 배치) |
| `my-site/src/router/index.tsx` | `admin/meetups`, `admin/meetups/:id` (AdminRoute), `m/:slug` |
| `my-site/src/components/navigation/Sidebar.tsx` | admin 블록에 `모임 회계` (색: `teal-*` — 미사용 색) |
| `CLAUDE.md` | 라우트 · Repositories 표 · 데이터 흐름 반영 |

---

## 7. 진행 순서

1. 이 문서 검증 → 수정 반영 → 문서 커밋
2. 마이그레이션 SQL 작성 → **사용자가 Supabase 에서 실행**
3. 타입 + `AppError` + `utils/id.ts` + `meetupSettlement` 순수 함수 → scratchpad 검증 스크립트 (V1~V6, V11, V12, V14)
4. 리포지토리
5. 관리 페이지 2개 + 라우트 + 사이드바
6. 공개 페이지
7. 모바일 확인 (360 / 390px), `npm run type-check`, `npm run build`
8. CLAUDE.md 갱신 → 기능 단위 커밋 → 병합은 지시 시

관리 화면 실사용 테스트는 admin 로그인이 필요하므로 **사용자 확인 단계**가 들어간다 (dev 서버에서 직접 입력 → 결과 공유). 공개 페이지는 사용자가 만든 공개 링크로 headless 확인 가능.

---

## 8. 검증 항목

| # | 항목 | 방법 |
|---|---|---|
| V1 | 모든 입력에서 `Σ b_i + b_T = 0` | 무작위 장부 다수 생성 스크립트 |
| V2 | `splitEven` / `splitProportional` 합계 = 원금, `Σw = 0` 대체 동작 | 스크립트 |
| V3 | 회비제 · 더치페이 · 혼합 · 잔액 4모드 수기 예제와 결과 일치 | 스크립트 (손계산 기대값) |
| V4 | `hub` 송금 = 총무 상대만, `min` 송금 건수 ≤ 잔액 0 이 아닌 노드 수 − 1, 같은 입력 → 같은 결과 | 스크립트 |
| V5 | 송금 목록 적용 후 모든 순잔액이 0 이 되고 통장 잔액 = R | 스크립트 |
| V6 | 공개 스냅샷에 `memo` 문자열이 포함되지 않음 | 스크립트 |
| V7 | 낙관적 잠금: 두 탭에서 같은 장부 저장 → 두 번째가 `CONFLICT` | 사용자 확인 |
| V8 | anon 키로 `meetup_ledgers` 직접 SELECT → 0행, RPC → 공개 켜진 장부만 | REST 호출 |
| V9 | 공개 끄기 / 삭제 / 슬러그 재발급 후 기존 링크 → "찾을 수 없음" | 사용자 확인 + headless |
| V10 | 360 / 390px 가로 넘침 없음, 하단 요약 바 동작 | headless Edge |
| V11 | §3.0 규칙별로 오류가 나는 장부 → 오류 목록에 잡히고 저장 불가 (빈 분담 대상, 중복 닉네임, 총무 없는 회비 장부, 끊긴 참조) | 스크립트 + 사용자 확인 |
| V12 | 일부 정산 완료 후 지출 추가 → 차액 = `b_i − settledAmount`, 송금 적용 후 모두 0 | 스크립트 |
| V13 | 공개 토글 / 슬러그 재발급 직후 저장 → 충돌 안 남. 다른 탭에서 삭제 후 저장 → `NOT_FOUND` 메시지 | 사용자 확인 |
| V14 | `normalizeLedgerData({})` → 빈 장부 기본값, 필드 일부 누락 → 기본값 채움 | 스크립트 |

---

## 9. 검증 기록 (2026-10-06)

### 확인된 것

- §3 공식을 문서 그대로 스크래치패드에 구현해 **무작위 장부 20,000개**로 돌림 → V1 (합계 0) · V4 (`hub` 총무 경유 / `min` 건수 상한) · V5 (송금 후 전원 0) 실패 0건
- 손계산 예제: 3명 × 30,000, 지출 80,000 (통장 결제), B 미납, 이월 → "B → 총무 30,000", 최종 통장 잔액 10,000 일치
- 코드 대조: `generate_short_slug()` 정의 · drop 위치, `createBrowserRouter` (→ `useBlocker` 사용 가능), `teal-*` 미사용, admin / 공개 페이지 배치 관례, `AppError` 구조, RLS · RPC 패턴 모두 문서와 일치

### 발견해서 반영한 것

| # | 문제 | 반영 |
|---|---|---|
| 1 | 총무 미지정인데 참가비 / 통장 결제 지출이 있으면 `b_T` 를 받을 사람이 없어 금액이 남음 (스크립트에서 20,000원 사례) | §3.0 총무 필수 규칙, §3.4 총무 없으면 `min` 고정 |
| 2 | 참가자 삭제로 분담 대상이 0명이 되면 불변식이 깨짐 · 닉네임 중복 시 송금 목록에서 구분 불가 | §3.0 입력 검증 신설, 오류 시 저장 불가 (D9) |
| 3 | 공개 토글 · 슬러그 재발급도 `updated_at` 을 바꿔, 직후 저장이 충돌로 오탐 | §4.3 새 `updated_at` 반환 → 화면 값 갱신 |
| 4 | 0행 갱신은 충돌 외에 삭제 · 권한 상실도 원인 (RLS 는 오류 없이 0행) | §4.4 재조회로 `CONFLICT` / `NOT_FOUND` 구분 |
| 5 | `settled: boolean` 은 완료 후 금액 변경을 드러내지 못하고, 참가비 납부와 정산 송금이 이중 계산될 수 있음 | D11 `settledAmount` + 차액 표시, `feePaid` = 정산 전 선납만, 완료 체크는 `hub` 전용 |
| 7 | "콜백 밖에서만 호출하므로 raw REST 불필요" 는 부정확 — 교착은 이후 SDK 쿼리 전체를 멈춤 | §6 비밀 노트 · 플래너와 같은 수준 위험으로 정정, REST 전환 시 `return=representation` 필요 명시 |
| 8 | `crypto.randomUUID` 는 비보안 컨텍스트 (휴대폰 → LAN IP dev 서버) 에서 없음 | §2.3 `utils/id.ts` 공용 `newId()` |
| 9 | 새 행의 `data` 는 `{}` | §2.3 `normalizeLedgerData` |
| 10 | 그리디는 진짜 최소 건수를 보장하지 않음 | UI 이름 "송금 건수 줄이기", §3.4 설명 정정 |

### 보류

| # | 문제 | 처리 |
|---|---|---|
| 6 | Tauri 앱에서 `window.location.origin` 이 앱 내부 주소라 공개 링크가 잘못 복사됨 (기존 비밀 노트도 동일) | Tauri 앱은 현재 미서비스 → **Tauri 배포 준비 시 비밀 노트와 함께 수정** (§1 "안 하는 것") |

---

## 10. 구현 기록 (2026-10-06)

### 파일

| 파일 | 내용 |
|---|---|
| `supabase/migrations/20261006_meetup_ledgers_{up,down}.sql` | §4.1 그대로. up 헤더에 `generate_short_slug()` 의존성 경고 |
| `types/meetup.ts` | §2.1 + `TREASURY` 상수 + `MeetupSummary` · `MeetupPublicSettlement` |
| `utils/AppError.ts` · `utils/id.ts` | `CONFLICT` 추가 · `newId()` (`localPlannerRepository` 에서 이동) |
| `service/meetup/utils/meetupSettlement.ts` | 검증 · 정규화 · 분배 · 정산 · 송금 · 스냅샷 · 공유 문구 |
| `repositories/meetupRepository.ts` | §6 메서드 전부. 공개 스냅샷은 리포지토리가 저장 시마다 계산 (`createLedger` / `updateLedger`) |
| `service/meetup/components/SettlementSections.tsx` | `SectionCard` · `SummaryGrid` · `BalanceList` · `TransferList` — 관리 / 공개 화면 공용 |
| `service/admin/pages/MeetupManagePage.tsx` · `MeetupLedgerPage.tsx` | 관리 화면 |
| `service/meetup/pages/MeetupSettlementViewPage.tsx` | 공개 화면 (`noindex`) |
| `router/index.tsx` · `Sidebar.tsx` · `CLAUDE.md` | 라우트 3개 · `모임 회계` (teal) · 문서 |

### 계획과 달라진 점

1. **총무 필수 조건 확장 (§3.0)** — 참가비 · 통장 결제 외에 **회비 충당 지출**도 포함. 참가비 없이 회비 충당 지출만 있고 `총무 부담` 모드면 통장 잔액이 음수인데 받을 사람이 없는 경우가 남아 있었음 (구현 중 발견).
2. **공개 스냅샷에 `isTreasurer` 추가** — 총무 본인 행이 "참가비 미납 · −40,000" 처럼 보여 오해 소지. 총무 배지 + 금액 대신 "통장에서 정리" 표시.
3. **요약 카드 열 수를 컨테이너 쿼리로** (`@container` / `@lg:grid-cols-4`) — 관리 화면 오른쪽 좁은 칸(22rem)에서 화면 폭 기준 4열이면 금액이 잘림.
4. **모바일 하단 바 = 요약 + 저장 버튼** — 인연 계산기처럼 결과가 보이면 숨기는 대신, 저장 버튼이 필요해 항상 표시. 요약을 누르면 결과 칸으로 스크롤.
5. **입력 오류는 상단 목록 + 해당 행 빨간 테두리** — 저장 버튼 비활성화, 정산 · 송금 영역은 "입력 오류를 먼저 고치세요".
6. 참가비 구간 삭제 시 그 구간을 쓰던 참가자는 확인 후 `참가비 없음` 으로 자동 변경 (검증 오류로 남기지 않음).
7. **D5 변경 — 부관리자 열람 허용** (구현 후 요청). 추가 마이그레이션 `20261006_meetup_ledgers_editor_read_{up,down}.sql` — 기존 admin 정책은 두고 editor SELECT 정책만 추가 (permissive 정책 OR). 라우트 `EditorRoute`, 사이드바는 `canEditRole` 블록(내부 공지 위). 목록 화면은 생성 · 삭제 · 삭제된 모임을 admin 만 표시, 장부 화면은 `readOnly` → 입력 fieldset 비활성 · 저장 / 상태 / 공개 토글 / 재발급 숨김, 정산 문구 복사 · 공개 링크 복사는 허용. editor 는 내부 메모도 볼 수 있음. mock 검증: 390px 넘침 없음, 편집 영역 활성 컨트롤 0개, PATCH 요청 0건.
8. **모임 기간 (시작일 ~ 끝일)** (구현 후 요청). 추가 마이그레이션 `20261006_meetup_ledgers_period_{up,down}.sql` — 기존 `meetup_date` 를 시작일로 유지하고 `meetup_end_date` 컬럼 추가 (null = 하루짜리, check: 끝일은 시작일이 있을 때만 · 시작일 이후), 공개 RPC 는 반환 컬럼이 바뀌어 drop + recreate. 앱: `normalizePeriod` (끝일 = 시작일이면 null), `periodError` (DB 제약과 같은 규칙, 오류 시 생성 · 저장 불가), `formatPeriod` (`2026-10-12 ~ 10-13`, 해가 바뀌면 연도 포함), 정산 문구 머리 `[10/12~10/13 …]`. 검증 스크립트 28개 통과, mock 화면 390 / 1280px 넘침 없음.
9. **참석 기간 · 지출 날짜 · "그날 참석자" 분담** (구현 후 요청, DB 변경 없음 — 전부 jsonb `data`). 참가자 `attendFrom` / `attendTo` (null = 모임 전체), 지출 `date` (null = 모임 시작일), 충당 방식 `present` 추가 (= 그 날짜 참석자 전원 균등 분담, **계산할 때마다** 참석 기간으로 다시 구함 — 참석 기간을 고치거나 사람을 추가해도 기존 지출이 따라감). 기존 `split` 은 "직접 선택 분담"으로 유지. 회비는 기존 참가비 구간으로 처리 (일수 비례 자동 계산 안 함). 하루짜리 모임이면 입력칸을 숨기고 참석 기간을 무시 (전원 참석). 검증 추가: 참석 기간 · 지출 날짜가 모임 기간 밖, 참석 끝일 < 시작일, 그날 참석자 0명. 공개 스냅샷: 참가자 `attendLabel` (`10-12만` / `10-12 ~ 10-13`), 지출 `date` + 날짜순 정렬. `computeSettlement` / `validateLedger` / `buildPublicSnapshot` 은 모임 기간을 인자로 받음 (리포지토리 저장 시에도 전달). 검증: 1박 2일 수기 예제 · 규칙 · 정규화(기존 데이터 호환) 19개 + 무작위 여러 날 장부 94,562개 통과, mock 390px 화면에서 "모모이 1일차만" 시나리오 송금 1건 (모모이 → 아리스 10,000) 일치. 테스트 난수 생성기를 LCG → mulberry32 로 교체 (LCG 하위 비트 주기 때문에 경우가 고르게 섞이지 않았음 — 교체 후 기존 묶음도 150,326개 통과).
10. **참가자 = 사이트 회원 선택** (구현 후 요청). 자유 입력(닉네임 붙여넣기)을 없애고 `회원 추가` 모달(`MemberPickerModal`)에서 고름 — 닉네임 검색 · 여러 명 선택 · 이미 추가된 회원 잠금, 삭제된 계정 제외, 승인 대기는 `대기` 배지, 동명이인 구분용 가입일 표시. **게스트(비회원) 입력은 두지 않음** — 가입을 안내. 참가자에 `userId` 추가, 닉네임은 추가 시점 값을 복사 (결산 기록이므로 이후 닉네임 변경을 따라가지 않음, 회원 이름칸은 잠금), 장부 안에서 닉네임이 겹치면 ` (2)` 접미사 (회원가입이 닉네임 중복을 막지 않음). 검증: 같은 회원 중복 추가 → 오류. 기존 데이터(`userId` 없음)는 `비회원` 배지 + 이름 수정 가능으로 유지. 공개 스냅샷에는 `userId` 미포함. DB 변경 없음. mock 390px: 목록 정렬 · 대기 배지 · `아리스 (2)` · 재오픈 시 3명 잠금 · 넘침 없음.
11. **모임별 총무(여러 명)에게 편집 권한** (구현 후 요청, 이어서 "총무 복수 임명" 요청 반영 — SQL 실행 전이라 같은 파일을 배열 방식으로 고쳐 씀). 추가 마이그레이션 `20261006_meetup_ledgers_treasurer_{up,down}.sql` — `treasurer_user_ids uuid[]` 컬럼 (GIN 인덱스, `auth.uid() = any(...)` 정책), 총무 SELECT / UPDATE 정책 (승인 대기 제외), 관리자가 아니면 `treasurer_user_id` · `deleted_at` · `created_by` 변경을 막는 트리거 (RLS 는 행 단위라 컬럼을 못 막음). 결정: 총무 권한 = 편집 · 저장 · 정산 완료 처리 · 공개 설정 · 링크 재발급 (삭제 · 복원 · 총무 임명 · 해제는 최고 관리자) / 총무는 여러 명, 송금이 모이는 정산 총무(◉ 정산)는 그중 한 명 (검증 규칙) — 처음엔 "편집 총무 = 정산 총무 한 사람"이었으나 복수 임명으로 "정산 총무 ∈ 총무들"로 바뀜. 총무 목록은 최고 관리자가 저장할 때만 함께 보냄, ◉ 는 편집 권한자가 총무 중에서 고름, 총무는 항상 참가자 (임명 시 자동 추가, 해제 전에는 삭제 불가), 정산 총무가 해제되면 첫 총무로 자동 이동 / 일반 회원은 자기가 총무인 모임이 있을 때만 사이드바 메뉴. 라우트는 `AuthRoute` (보이는 장부는 RLS 가 결정, 남의 장부 주소로 들어가면 "찾을 수 없음"). 모임 생성 시 총무 1명 이상 지정 필수 (`MemberPickerModal treasurers` — 승인 대기 제외, 기존 총무 미리 선택), 총무들이 첫 참가자들 + 첫 총무가 정산 총무. 장부 화면 참가자 영역에 총무 목록 + `총무 변경`(최고 관리자). 기존 장부는 총무 없음 → 최고 관리자만 편집 (◉ 는 아무 참가자나), `총무 변경`으로 임명하면 권한 생김. mock (RLS · 트리거 흉내) 390px: admin 이 총무 2명으로 생성 → 총무 변경(1명 해제 · 1명 추가) → 저장 / 남은 총무 · 새 총무 편집 · 저장 · 공개 / 해제된 회원 메뉴 없음 · 직접 접근 차단 / 부관리자 열람 — 전부 기대대로.
12. **참석 기간 → 이벤트별 참석** (구현 후 요청, 9번을 대체. DB 변경 없음). 날짜 단위로는 "1차는 갔는데 2차는 빠짐"을 못 담아서, 지출 하나를 이벤트(예: 고기 1차 30,000)로 보고 **이벤트마다 참석한 사람끼리 실제 결제 금액을 균등 분담**. 충당 방식은 `event`(참석자끼리) / `fee`(회비) 두 가지 — 기존 `present`(그날 참석자) · `split`(직접 선택) 은 `event` 로 합침. 저장은 **불참자 목록**(`cover.absent`) — 이벤트를 만들면 전원 참석으로 시작하고 안 간 사람만 빼며, 나중에 추가한 참가자도 기존 이벤트에 참석으로 잡힘 (사용자 결정). 참석 토글은 지출 카드(참가자 칩)와 참가자 행(이벤트 칩) 양쪽 — 같은 데이터. 참가자 `attendFrom` / `attendTo` 와 지출 `date` 는 삭제, 모임 기간은 표시용으로만 남음 → `computeSettlement` / `validateLedger` / `buildPublicSnapshot` 에서 기간 인자 제거. 기존 데이터는 `normalizeLedgerData(raw, period)` 가 읽을 때 변환 (split → 고르지 않은 사람 불참, present → 그 날짜 참석 기간 밖인 사람 불참, 하루짜리면 전원 참석) — 다음 저장 때 새 형식으로 기록. 공개 스냅샷: 참가자 `absentEvents`(불참 이벤트 이름), 지출 `coverLabel` 에 `2명 분담 · 불참 C`; 저장 전 옛 스냅샷의 `attendLabel` / `date` 도 계속 표시. 검증: 사용자 예시 (고기 1차 30,000 = A·B, 노래방 2차 10,000 = A·C → A 20,000 · B 15,000 · C 5,000) · 토글 · 규칙 · 이전 형식 변환 (변환 후 "모모이 1일차만" 계산 동일) 32개 + 무작위 이벤트 장부 74,693개 통과, 기존 묶음 28개 통과. mock 390px: 옛 `split` 장부가 불참 칩으로 열림 (미저장 표시 없음), 새 지출 = 참석자끼리 · 전원 참석, 지출 카드 / 참가자 행 양쪽 토글 일치, 저장 데이터에 날짜 · 참석 기간 필드 없음, 공개 페이지 불참 배지 · 넘침 없음.
13. **참가비 구간 → 선입금** (구현 후 검토 요청 → A안 결정, 12번과 D1 "회비 장부" 부분을 대체. DB 변경 없음). 검토 결과: 참가비 구간의 원래 용도(1차 / 1+2차 정액)는 이벤트별 참석이 대신하고, 선입금으로 쓰면 기본값 `이월`에서 참가비가 이벤트 비용과 **별도로** 걷혀 통장에 남음 (예: 2만 원씩 선입금 + 고기 3만(A·B) · 노래방 1만(A·C) → B 가 1.5만 원을 더 내라는 안내, `환급` 일 때만 5천 원 환급으로 맞음) + 참가비 구간이 있으면 새 지출이 `회비에서` 로 시작하는 함정. 결정: 참가자마다 **선입금(미리 낸 돈)** 만 적고 항상 정산에서 돌려받음 / 모든 지출 = 이벤트 (`expense.absent`, 충당 방식 선택 없음) / 참가비 구간 · 회비 충당 · 남을 때 · 모자랄 때 설정 삭제 (정액 회비를 받아 남는 돈을 다음 모임으로 넘기는 운영은 지원하지 않음). 계산: 낸 돈 = 선입금 + 직접 결제, 부담 = 참석한 이벤트 몫 합, 통장 현금 C = 선입금 합계 − 통장 결제, b_T = −C (정산 후 통장 0), 불변식 그대로. 선입금이나 통장 결제가 있으면 정산 총무 필수. 이전 데이터 변환 (`normalizeLedgerData`): 참가비 구간 + 선납 → 그 금액이 선입금 (미납 0), `회비에서` → 전원 분담, data `version: 2`. 공개 스냅샷 `version: 2` — 요약 `{ totalExpense, totalPrepaid, treasuryPaid, treasuryCash }`, 참가자 `prepaid`; 다시 저장하기 전의 옛 스냅샷은 `LegacyMeetupSummary` · `tierLabel` · `feePaid` 로 계속 표시. 검증 묶음을 하나로 다시 씀 (`meetup_verify3`): 사용자 예시 3가지 (선입금 없음 / 2만씩 → B 5천 · C 1.5만 환급 / 1만씩 → B 5천 추가 · C 5천 환급) · 규칙 · 이전 형식 변환 · 스냅샷 42개 + 무작위 장부 177,240개 (불변식 · 송금 후 0 · 결정성 · 정산 완료 차액) 통과. mock 390px: 저장 전 공개 페이지가 옛 스냅샷을 그대로 표시, 옛 참가비 장부가 선입금(선납자 2만 · 미납 0) + 전원 분담으로 열림 (미저장 표시 없음), 선입금 입력 · 이벤트 토글 → 요약 · 송금 갱신, 저장 데이터에 옛 필드 없음, 저장 후 공개 페이지 새 요약 · 선입금 배지, 넘침 없음.
14. **공개 결산 페이지 개선** (구현 후 검토 요청 → 1~9번 반영, DB 변경 없음). 링크를 받은 참가자 기준으로 "내가 누구에게 얼마, 왜"를 바로 보이게: ① 정산 완료 체크된 송금을 목록에서 지우지 않고 ✓ 취소선으로 남김 (스냅샷 `completedTransfers` — 완료 시점 금액, 총무 경유 방식만) + 제목 `송금 1건 · 완료 1건` (관리 화면도 같음) ② 순잔액을 부호 대신 말로 — 정산 전은 `받을 돈 1,667원` / `보낼 돈 10,500원` (처음엔 `받음 · 보냄` 이었으나 이미 보낸 것처럼 읽혀 수정), 정산 완료 체크된 사람은 완료 시점 금액을 과거형 `✓ 1,667원 받음`, 차액 배지는 `추가로 보낼 돈 2,000` ③ 참가자 이름을 누르면 이벤트별 내 몫 → 부담 합계 · 선입금 · 직접 결제 → 낸 돈 합계 · 차이 펼침 (계산 줄 `낸 돈 − 부담` 은 `+1,667원` 처럼 중립 표기로 항상 보이고, 그 아래 **현재 상태 줄** — 정산 전 `받을 돈 · 보낼 돈`, 사람별 완료 `✓ 정산 완료 · 1,667원 받음` + 그 뒤 차액 `추가로 보낼 돈 3,000원`, 장부 정산 완료 `✓ 정산 완료 · …` (완료 뒤 차액까지 있으면 `✓ 추가로 3,000원 보냄` 두 줄). 처음엔 상태와 무관하게 정산 전 금액만 보여 완료 후에도 `받을 돈` 으로 남는 문제가 있었음) (스냅샷 참가자 `shares` · `paidDirect`, 관리 화면 사람별 정산도 같음) ④ 지출에 `1인 15,000원` (나머지가 생기면 `1인 약 3,333원`, 스냅샷 `sharerCount`) ⑤ 카드 순서 송금 → 참가자 → 지출 → 요약, 공개 요약은 총지출 · 선입금만 (`SummaryGrid compact`) ⑥ 갱신 시각 `10/6 21:00 갱신` ⑦ 탭 제목 `{모임} 정산` ⑧ 정산 완료 장부는 상단 안내 + `송금 기록` 제목 + 복사 버튼 숨김 ⑨ 송금 금액을 누르면 숫자만 복사 (Clipboard API 가 막힌 인앱 브라우저용 `execCommand` 대체 경로). 새 필드는 모두 선택 필드라 이전 스냅샷은 펼치기 · 1인 금액 없이 그대로 표시. 계좌 안내(Q3 결정과 충돌) · 카톡 미리보기(서버 렌더 필요)는 보류. 검증: 공개 결산본 내역 7개 추가 (내역 합 = 부담, 선입금 + 직접 결제 = 낸 돈, 완료 송금 = 완료 시점 금액, min 방식은 완료 송금 없음) + 무작위 장부 전체에 내역 합 검사 → 49개 통과. mock: 360 / 390 / 1280px 넘침 없음, 펼침 내역 일치, 금액 복사 → 클립보드 `21667`, 정산 완료 화면, 이전 스냅샷 화면.

### 검증 결과

| # | 결과 |
|---|---|
| V1 · V4 · V5 · V6 · V12 | 실제 모듈을 esbuild 로 번들해 무작위 장부 200,000개 생성 → 검증 통과 23,656개 전부 통과 |
| V2 · V3 · V11 · V14 | 수기 예제 · 규칙별 케이스 24개 전부 통과 |
| V7 · V13 | headless Edge + Supabase 응답 mock: 공개 토글 직후 저장 → 충돌 없음, 서버 `updated_at` 변경 후 저장 → 0행 → `CONFLICT` 배너 |
| V9 | mock: 공개 끄기 → 공개 페이지 "결산을 찾을 수 없습니다" |
| V10 | 360 / 390 / 1280px 목록 · 편집 · 공개 화면 가로 넘침 없음 |
| V6 (화면) | 공개 페이지 본문에 내부 메모 문자열 없음 |
| `type-check` · `build` | 통과 |
| **남은 것** | 마이그레이션 실행 후 실제 DB 로 V7 · V8 (anon 직접 SELECT 0행) · V9 · V13 재확인 — 사용자 |
