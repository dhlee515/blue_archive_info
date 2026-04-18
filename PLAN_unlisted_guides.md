# 일부공개(Unlisted) 가이드 페이지 구현 계획

> 관리자만 알 수 있는 URL로만 접속 가능한 "일부공개" 가이드를 추가한다.
> 기존 `is_internal`(editor+ 로그인 필요) 와는 별개로, **로그인 없이 토큰 URL로 열람**이 가능한 상태를 만드는 것이 목표.

---

## 0. 요구사항 확정 (착수 전 결정 필요)

- [ ] **A안 (Unlisted)** — URL 알면 누구나 열람. 유출 시 영구 노출. ← 단순
- [ ] **B안 (Secret-Link, 토큰 재발급 가능)** — URL 내 토큰이 DB와 일치해야 열람. 유출 시 재발급으로 차단 가능. ← **추천**
- [ ] 대상 리소스: `guides` 테이블만 (내부 공지/이벤트/학생 페이지는 범위 밖)

본 문서는 **B안 + `guides` 전용** 기준으로 작성한다.

---

## 1. 현재 상태 요약

- `guides.is_internal: boolean` 컬럼 존재 (editor+ 전용 내부 공지용)
- 공개 범위 상태는 사실상 2단계: `public(false)` / `internal(true)`
- 프론트 가드: [AdminRoute.tsx](my-site/src/components/guards/AdminRoute.tsx) — **UX용일 뿐, 실질 보안은 Supabase RLS**
- 공개 상세 라우트: `/guide/:id` → [GuideDetailPage](my-site/src/service/guide/pages/GuideDetailPage.tsx)
- 리포지토리: [guideRepository.ts](my-site/src/repositories/guideRepository.ts)
  - `getGuides(categoryId?, isInternal = false)` 에서 `is_internal` 로 필터
  - `getGuideById(id)` 는 공개/내부 구분 없이 id 단건 조회

---

## 2. 데이터 모델 변경 (Supabase)

### 2.1 스키마 마이그레이션

```sql
-- 1) 공개 범위 enum 추가
create type guide_visibility as enum ('public', 'unlisted', 'internal');

-- 2) 컬럼 추가
alter table guides
  add column visibility guide_visibility not null default 'public',
  add column share_token uuid unique;

-- 3) 기존 데이터 백필
update guides set visibility = 'internal' where is_internal = true;
update guides set visibility = 'public'   where is_internal = false;

-- 4) unlisted 상태 제약: 토큰이 있어야만 unlisted가 성립
alter table guides
  add constraint unlisted_requires_token
  check (visibility <> 'unlisted' or share_token is not null);

-- 5) (이후 모든 참조 제거 확인 후) 기존 컬럼 제거
-- alter table guides drop column is_internal;
```

> `is_internal` 컬럼은 **코드 레벨 참조를 전부 제거한 뒤** 별도 마이그레이션에서 drop. 한 번에 지우지 않음.

### 2.2 RLS 정책 (가장 중요)

프론트 가드는 UX, 실질 보안은 여기서 결정됨. `share_token` 은 **PostgREST 쿼리 파라미터로 대조**해야 안전하다.

```sql
-- SELECT 정책 재작성
drop policy if exists "guides_select" on guides;

create policy "guides_select_public"
  on guides for select
  using (visibility = 'public' and deleted_at is null);

create policy "guides_select_unlisted"
  on guides for select
  using (
    visibility = 'unlisted'
    and deleted_at is null
    and share_token is not null
    -- 쿼리에서 ?share_token=eq.<token> 조건을 반드시 걸도록 유도.
    -- 정책 자체는 공개이되, 클라이언트가 토큰을 모르면 id만으로는 조회 불가하도록
    -- id 노출을 막는 방법이 없으므로: 아래 'id 숨김' 주의사항 참고.
  );

create policy "guides_select_internal"
  on guides for select
  using (
    visibility = 'internal'
    and deleted_at is null
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );
```

**중요한 함정:** `unlisted` 를 단순 SELECT 공개로 두면 `/rest/v1/guides?visibility=eq.unlisted` 한 줄로 전 목록이 새어나간다. 두 가지 방어 중 택 1:

- **(권장) SECURITY DEFINER RPC 도입** — `get_guide_by_token(token uuid)` RPC만 노출하고, `unlisted` 행에 대한 직접 SELECT 정책은 만들지 않음.
  ```sql
  create or replace function get_guide_by_token(p_token uuid)
  returns setof guides
  language sql
  security definer
  set search_path = public
  as $$
    select * from guides
    where share_token = p_token
      and visibility = 'unlisted'
      and deleted_at is null
    limit 1;
  $$;
  revoke all on function get_guide_by_token(uuid) from public;
  grant execute on function get_guide_by_token(uuid) to anon, authenticated;
  ```
- **대안**: RLS에 `current_setting('request.jwt.claims', true)` 나 요청 헤더 기반 체크를 쓰려면 엣지 함수 필요. 복잡도 ↑.

→ **결정: RPC 방식 채택**.

### 2.3 인덱스

```sql
create index guides_share_token_idx on guides(share_token) where share_token is not null;
create index guides_visibility_idx on guides(visibility) where deleted_at is null;
```

---

## 3. 타입 변경

[types/guide.ts](my-site/src/types/guide.ts)

```ts
export type GuideVisibility = 'public' | 'unlisted' | 'internal';

export interface Guide {
  // ...
  visibility: GuideVisibility;   // 추가
  shareToken: string | null;     // 추가
  // isInternal 제거 (또는 파생 getter로 임시 호환)
}

export interface GuideFormData {
  // ...
  visibility: GuideVisibility;   // isInternal 대체
}
```

---

## 4. 리포지토리 변경 ([guideRepository.ts](my-site/src/repositories/guideRepository.ts))

- [ ] `getGuides()` 시그니처 변경: `(categoryId?, visibility: GuideVisibility = 'public')`
  - 현재 `isInternal: boolean` 기반 분기 → `visibility` 분기로 교체
  - `unlisted` 는 **목록 조회에서 항상 제외** (관리자 전용 페이지에서만 별도 조회)
- [ ] `getGuideById()` — `public`/`internal` 전용. `unlisted` 행은 RLS로 차단됨
- [ ] `getGuideByShareToken(token: string): Promise<Guide>` 신설 → `supabase.rpc('get_guide_by_token', { p_token: token })` 호출
- [ ] `getUnlistedGuides(): Promise<Guide[]>` 신설 (관리자 전용) — `visibility=eq.unlisted` 로 조회하되 RLS상 editor/admin 역할 검사가 필요하므로 별도 정책 추가:
  ```sql
  create policy "guides_select_unlisted_for_staff"
    on guides for select
    using (
      visibility = 'unlisted'
      and exists (
        select 1 from profiles
        where profiles.id = auth.uid() and profiles.role in ('admin','editor')
      )
    );
  ```
- [ ] `regenerateShareToken(id: string, userId: string)` 신설 — `update guides set share_token = gen_random_uuid()` + 로그 기록
- [ ] `createGuide` / `updateGuide` — `visibility` 저장. `unlisted` 로 설정 시 서버에서 `share_token` 자동 생성(트리거 또는 클라 생성 둘 다 가능, **DB 트리거 권장**):
  ```sql
  create or replace function ensure_share_token()
  returns trigger language plpgsql as $$
  begin
    if new.visibility = 'unlisted' and new.share_token is null then
      new.share_token := gen_random_uuid();
    end if;
    if new.visibility <> 'unlisted' then
      new.share_token := null;
    end if;
    return new;
  end $$;
  create trigger guides_share_token_bi before insert or update on guides
    for each row execute function ensure_share_token();
  ```
- [ ] `toGuide()` 매퍼에 `visibility`, `shareToken` 추가. `isInternal` 필드는 `row.visibility === 'internal'` 파생으로 당분간 유지(하위 호환).

---

## 5. 라우팅 ([router/index.tsx](my-site/src/router/index.tsx))

- [ ] `/guide/share/:token` 추가 → `GuideDetailPage` 를 재사용하되 로더에서 `getGuideByShareToken` 사용
  - 비로그인 접근 허용
  - 댓글/수정/삭제 버튼 비노출 (권한 체크로 이미 처리됨, 재확인)
- [ ] `/admin/unlisted-guides` 추가 → `AdminRoute` (또는 `EditorRoute`) 로 감싼 `UnlistedGuidesPage` 신규
- [ ] 기존 `/guide/:id` 는 그대로 두되, 내부적으로 `visibility != 'public'` 이면 404 처리

---

## 6. 페이지/컴포넌트 변경

### 6.1 GuideFormPage ([service/guide/pages/GuideFormPage.tsx](my-site/src/service/guide/pages/GuideFormPage.tsx))
- [ ] "공개 / 일부공개 / 내부" 라디오 그룹 추가 (기존 `is_internal` 체크박스 교체)
- [ ] 저장 후 `unlisted` 인 경우 결과 화면에 **링크 복사 버튼** + **토큰 재발급** 버튼 노출

### 6.2 GuideDetailPage
- [ ] URL 패턴에 따라 로더 분기:
  - `/guide/:id` → `getGuideById`
  - `/guide/share/:token` → `getGuideByShareToken`
- [ ] `unlisted` 페이지에선 `<meta name="robots" content="noindex, nofollow">` 주입 (react-router loader + head 태그, 혹은 페이지 내 `useEffect` 로 `document.head`)
- [ ] 외부 링크는 `rel="noopener noreferrer"` 확인 (Referer 누수 방지)

### 6.3 UnlistedGuidesPage (신규, admin)
- [ ] 언리스티드 가이드 목록 테이블
  - 컬럼: 제목 / 카테고리 / 작성자 / 생성일 / [링크 복사] / [토큰 재발급] / [공개로 전환]

---

## 7. 보안 체크리스트

- [ ] `guides` 테이블 기본 SELECT 정책이 `public` 만 허용하는지 재확인 (기존 정책 있는 경우 덮어쓰기)
- [ ] `unlisted` 의 id 추측 공격 방지 → 직접 SELECT 정책 없음 + RPC 만 노출되는지 확인
- [ ] `share_token` 은 UUID v4 (≥122 bit 엔트로피). base64 직렬화 시 길이 유지
- [ ] 라우트에 `noindex` 주입 확인
- [ ] `referrerPolicy="no-referrer"` 또는 외부 링크 `rel` 확인
- [ ] 이미지 URL은 Supabase Storage public bucket 이라 URL 자체는 보호 안 됨. **컨텐츠 기밀성이 필요한 경우 signed URL 로 전환 필요** (본 범위 밖, 메모)

---

## 8. 작업 순서 (머지 단위)

1. **PR#1 — 스키마** : enum/컬럼/트리거/RLS/RPC 마이그레이션 + 백필. `is_internal` 은 유지.
2. **PR#2 — 리포지토리/타입** : `visibility` 기반으로 교체. `isInternal` 은 파생 getter로 호환 유지.
3. **PR#3 — 라우트/페이지** : `/guide/share/:token` 추가, `GuideFormPage` UI 변경.
4. **PR#4 — 관리 페이지** : `/admin/unlisted-guides` + 링크복사/재발급.
5. **PR#5 — 정리** : `is_internal` 컬럼/코드 완전 제거.

각 단계에서 `npm run type-check` 및 수동 브라우저 테스트로 회귀 확인.

---

## 9. 열린 질문

- [ ] `unlisted` 가이드에도 댓글/좋아요 등 상호작용이 있을 예정인가? (있다면 RLS 확장 필요)
- [ ] 공개→언리스티드로 전환 시 기존 `/guide/:id` URL 접근을 어떻게 처리할지 (404 / 리다이렉트)
- [ ] 토큰 재발급 시 이전 토큰을 즉시 무효화할지 / 유예 기간을 둘지
- [ ] 언리스티드 가이드 작성 권한을 admin 만 줄지, editor 도 허용할지
