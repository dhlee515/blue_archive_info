# 관리자 전용 비밀 노트(Secret Notes) 구현 계획

> 기존 `guides` 는 **그대로 공개 게시판으로 유지**.
> 관리자만 글을 쓰고 목록을 볼 수 있는 **별도 리소스 `secret_notes`** 를 추가하되,
> 각 글은 **고유 URL로 비로그인 사용자도 접근 가능**하게 한다.
> URL 을 어디에도 게시하지 않으면 일반 사용자는 존재 자체를 모름 → "URL만 아는 사람만 들어온다."

---

## 1. 요구사항 정리

| 역할 | 목록 | 생성/수정/삭제 | 상세 열람 | 복구 |
|---|---|---|---|---|
| 일반(비로그인 포함) | ❌ | ❌ | ✅ (URL 알 때만) | ❌ |
| editor | ❌ | ❌ | ✅ | ❌ |
| **admin** | ✅ | ✅ | ✅ | ✅ |

- 기존 `guides` / `GuideListPage` / 라우트는 **변경 없음**
- 신규 리소스명: **`secret_notes`**
- 공개 열람 URL: **`/n/:slug`** (note 의 n; "secret" 단어는 URL 에 노출하지 않음)
- `slug` 는 예측 불가한 12자 랜덤 base36 (≈62 bit 엔트로피)
- **대표 이미지 필드 없음** (SPA 구조상 OG 미리보기 불가능, 본문 내 이미지로 충분)
- **소프트 삭제 + 복구 UI 제공** (`/admin/deleted-notes` — `/admin/deleted-guides` 와 컨벤션 일치)
- **감사 로그(`secret_note_logs`) 는 스코프 아웃** — admin 본인만 쓰는 리소스라 guide 수준의 audit 불필요. 향후 필요시 PR#7 로 추가

---

## 2. 프로젝트 컨벤션 준수 사항 (체크리스트)

기존 `guides` 스택을 그대로 따른다:

| 영역 | 컨벤션 | 이 계획 적용 |
|---|---|---|
| 리포지토리 | `class` + `static` 메서드, `throw` 로 에러 전파 | `SecretNoteRepository` 로 동일 |
| 메서드 네이밍 | `get{Entity}s()`, `get{Entity}ById()`, `create{E}`, `update{E}`, `delete{E}`, `getDeleted{E}s()`, `restore{E}` | `getNotes`, `getNoteById`, `getNoteBySlug`, `createNote(form, userId)`, `updateNote(id, form, userId)`, `deleteNote(id)`, `getDeletedNotes`, `restoreNote(id)`, `regenerateSlug(id)` |
| mutation 인자 | guide 는 감사 로그 때문에 `userId` 필요. secret note 는 로그 없음 → **YAGNI 에 따라 `userId` 생략**. create/update 는 `author_id` 저장 위해 필요 | 동일 |
| 페이지 디렉토리 | admin CMS 페이지는 `service/admin/pages/` (기존: UserManage, CategoryManage, DeletedGuides, GuideLog, InternalNotice, InternalCategoryManage 전부) | 관리 페이지 3개를 `service/admin/pages/` 에 둠. 공개 뷰만 `service/secretNote/pages/` |
| 페이지 네이밍 | `{Domain}ManagePage` / `Deleted{Domain}Page` / `{Domain}FormPage` / `{Domain}DetailPage` / `{Domain}ListPage` | 관리 목록 = `SecretNoteManagePage`, 폼 = `SecretNoteFormPage`, 삭제 = `DeletedNotesPage`, 공개 뷰 = `SecretNoteViewPage` |
| 타입 | `interface`, camelCase 필드, JSDoc `/** ... */` 주석 | 동일 |
| 페이지 컴포넌트 | `export default function`, `useState` + `useEffect`, `try/catch/finally` + `console.error` + `alert('... 실패했습니다.')` | 동일 |
| 권한 체크 | `useAuthStore((s) => s.isAdmin)` / `canEdit` 헬퍼 사용. `user.role === 'admin'` 직접 비교 **지양** | 동일 |
| 라우트 가드 | `AdminRoute` / `EditorRoute` (기존) | `AdminRoute` 사용 |
| 로딩/빈 상태 문구 | `"데이터를 불러오는 중..."`, `"표시할 ...이 없습니다."`, `"... 실패했습니다."` | 동일 |
| 확인 다이얼로그 | `if (!confirm('정말 삭제하시겠습니까?')) return` | 동일 |
| 스타일링 | Tailwind 다크모드 (`bg-white dark:bg-slate-800`, `text-blue-900 dark:text-blue-300`) | 동일 |
| 색 테마 (섹션별 구분) | 정보글 `blue-*`, 유저관리 `red-*`, 내부공지 `yellow-*`, 가이드 로그 버튼 `purple-*`, 복원 `green-*`, editor 배지 `pink-*` | **비밀 노트 = `indigo-*`** (미사용 색). `purple-*` 는 guide-logs 버튼과 충돌하여 회피 |
| 본문 인코딩 | `encodeContent`/`decodeContent` (Base64) | 초기엔 `secretNoteRepository` 에 복붙, 여유 시 `utils/content.ts` 공용화(PR#6) |
| 본문 렌더 | `DOMPurify.sanitize` + `tiptap-editor prose max-w-none` + `import '@/styles/editor.css'` | 동일 |
| 에디터 | `RichTextEditor` (from `service/guide/components/RichTextEditor.tsx`) 그대로 import | 동일 |
| 이미지 업로드 | `uploadGuideImage` (from `service/guide/utils/uploadGuideImage.ts`) 재사용 — 버킷 공유 | 동일 |

---

## 3. 핵심 설계 결정

1. **`guides` 확장 ❌ / 별도 테이블 ✅** — 기존 스키마·RLS·UI 를 건드리지 않아 회귀 위험 없음.
2. **익명 열람 보안 = Postgres RPC 로만 노출** — 테이블 직접 SELECT 는 admin 만, anon 은 `get_secret_note_by_slug(slug)` SECURITY DEFINER RPC 경유.
3. **슬러그 전략** — 기본: DB 트리거가 12자 base36 랜덤 생성. 관리자가 수동 슬러그 지정 가능. **재발급 기능으로 URL 유출 시 끊기**.
4. **MainLayout 공유 (트레이드오프 명시)** — `/n/:slug` 도 `MainLayout` 하위에 두므로 접속자가 Header/Sidebar 의 일반 메뉴(정보글/학생/계산기 등) 를 볼 수 있음. 사이트 홍보 겸용이라 OK. 완전 분리 원하면 별도 레이아웃 필요 → **현 범위 밖**.

---

## 4. DB 스키마

### 4.1 기존 데이터 변경 없음
- `guides` / `guide_logs` / `profiles` / `categories` / Storage 버킷 전부 **수정 없음**
- `profiles` FK 만 참조

### 4.2 신규 오브젝트

```sql
-- 1) 테이블
create table secret_notes (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  content     text not null,            -- Base64 인코딩된 HTML
  author_id   uuid not null references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz                -- soft delete
);

create index secret_notes_slug_idx    on secret_notes(slug) where deleted_at is null;
create index secret_notes_created_idx on secret_notes(created_at desc) where deleted_at is null;

-- 2) slug 자동 생성
create or replace function generate_short_slug()
returns text language plpgsql as $$
declare
  s text;
begin
  s := lower(substr(encode(gen_random_bytes(12), 'base64'), 1, 12));
  s := regexp_replace(s, '[^a-z0-9]', '', 'g');
  while length(s) < 12 loop
    s := s || lower(substr(encode(gen_random_bytes(6), 'base64'), 1, 6));
    s := regexp_replace(s, '[^a-z0-9]', '', 'g');
  end loop;
  return substr(s, 1, 12);
end $$;

create or replace function secret_notes_autoslug()
returns trigger language plpgsql as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := generate_short_slug();
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger secret_notes_biu
  before insert or update on secret_notes
  for each row execute function secret_notes_autoslug();
```

### 4.3 RLS

```sql
alter table secret_notes enable row level security;

-- admin 만 전체 조회 / 쓰기 (삭제된 글 포함)
create policy "secret_notes_admin_all"
  on secret_notes for all
  using (
    exists (select 1 from profiles
            where profiles.id = auth.uid() and profiles.role = 'admin')
  )
  with check (
    exists (select 1 from profiles
            where profiles.id = auth.uid() and profiles.role = 'admin')
  );

-- anon/일반 사용자용 SELECT 정책 없음 → 직접 조회 차단. 열람은 RPC 만 허용.
```

### 4.4 anon 노출 RPC

```sql
create or replace function get_secret_note_by_slug(p_slug text)
returns table (
  id uuid,
  slug text,
  title text,
  content text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select id, slug, title, content, created_at, updated_at
    from secret_notes
   where slug = p_slug
     and deleted_at is null
   limit 1;
$$;

revoke all on function get_secret_note_by_slug(text) from public;
grant execute on function get_secret_note_by_slug(text) to anon, authenticated;
```

- `author_id` 는 의도적으로 노출 안 함 (작성자 프라이버시)
- `security definer` + `search_path` 고정으로 권한 상승 공격 방지

---

## 5. 타입 ([types/secretNote.ts](my-site/src/types/secretNote.ts))

```ts
/** 비밀 노트 */
export interface SecretNote {
  id: string;
  slug: string;
  title: string;
  content: string;        // decoded HTML
  authorId?: string;      // anon 조회 시 undefined (RPC 는 author_id 미반환)
  createdAt: string;
  updatedAt: string;
}

/** 비밀 노트 작성/수정 폼 데이터 */
export interface SecretNoteFormData {
  title: string;
  content: string;
  customSlug?: string;    // 선택적 수동 슬러그
}
```

- `deletedAt` 필드는 제외 (Guide 타입과 일관)
- [types/index.ts](my-site/src/types/index.ts) 배럴에 export 추가

---

## 6. 리포지토리 ([repositories/secretNoteRepository.ts](my-site/src/repositories/secretNoteRepository.ts))

`GuideRepository` 구조를 그대로 참고. `class SecretNoteRepository` + `static` 메서드.

| 메서드 | 반환 | 권한 | 구현 요점 |
|---|---|---|---|
| `getNoteBySlug(slug)` | `SecretNote \| null` | anon 허용 | `supabase.rpc('get_secret_note_by_slug', { p_slug: slug })` → `toNote()` 매핑 |
| `getNotes()` | `SecretNote[]` | admin | `.from('secret_notes').select('*').is('deleted_at', null).order('created_at', { ascending: false })` |
| `getNoteById(id)` | `SecretNote` | admin | 편집 화면용, `.single()` |
| `createNote(form, userId)` | `SecretNote` | admin | `.from('secret_notes').insert({...}).select().single()` — 트리거가 생성한 **`slug` 반환에 사용**. Base64 인코딩. `author_id` 저장용 `userId` 필요 |
| `updateNote(id, form, userId)` | `SecretNote` | admin | `.update({...}).eq('id', id).select().single()` — 수정 후 반환값으로 UI 즉시 갱신 |
| `deleteNote(id)` | `void` | admin | `.update({ deleted_at: new Date().toISOString() }).eq('id', id)` |
| `getDeletedNotes()` | `SecretNote[]` | admin | `where deleted_at is not null` |
| `restoreNote(id)` | `void` | admin | `.update({ deleted_at: null }).eq('id', id)` |
| `regenerateSlug(id)` | `string` (새 slug) | admin | `.update({ slug: null }).eq('id', id).select('slug').single()` — slug 를 null 로 넣으면 트리거가 새 slug 생성. 반환 slug 로 UI 즉시 갱신 |

**구현 패턴 결정 — SDK 직접 사용 (`supabase.from().insert/update().select().single()`)**
- [GuideRepository](my-site/src/repositories/guideRepository.ts) 의 `restPost`/`restPatch` 헬퍼는 **사용하지 않음**. 이유:
  1. 이 리포는 트리거가 생성한 `slug` 를 반환받아야 하는데 `restPost` 는 `Prefer: return=minimal` 이라 반환값이 비어있음
  2. [AuthRepository](my-site/src/repositories/authRepository.ts), [CategoryRepository](my-site/src/repositories/categoryRepository.ts), [InternalCategoryRepository](my-site/src/repositories/internalCategoryRepository.ts) 등 **대부분의 리포는 SDK 직접 사용**이 표준. guideRepository 만 REST 래퍼 사용의 예외
  3. 반환 타입이 `SecretNote` 전체라 UI 에서 즉시 활용 가능 (기존 `createGuide` 의 `{ id } as Guide` 껍데기 패턴보다 개선)

- `delete/restore/regenerateSlug` 는 audit log 가 없어 `userId` 불필요 → YAGNI 에 따라 단순 시그니처. 향후 `secret_note_logs` 도입 시 확장.
- `encodeContent` / `decodeContent` 는 일단 파일 내부에 복사. 공용화는 PR#6.
- `toNote(row)` private 매퍼 — `GuideRepository.toGuide` 와 동일 패턴.

---

## 7. 라우팅 ([router/index.tsx](my-site/src/router/index.tsx))

```tsx
// 공개 열람 — 가드 없음, MainLayout 하위
{ path: 'n/:slug', element: <SecretNoteViewPage /> }

// 관리자 영역 — AdminRoute (기존 /admin/deleted-guides 와 같은 컨벤션)
{ path: 'admin/notes',              element: <AdminRoute><SecretNoteManagePage /></AdminRoute> }
{ path: 'admin/notes/new',          element: <AdminRoute><SecretNoteFormPage /></AdminRoute> }
{ path: 'admin/notes/:id/edit',     element: <AdminRoute><SecretNoteFormPage /></AdminRoute> }
{ path: 'admin/deleted-notes',      element: <AdminRoute><DeletedNotesPage /></AdminRoute> }
```

> `/admin/deleted-notes` 는 `/admin/deleted-guides` 와 컨벤션 동일(케밥 + `deleted-` prefix).

---

## 8. 페이지/컴포넌트

### 8.1 디렉토리 (기존 admin CMS 컨벤션 준수)
```
service/secretNote/
  pages/
    SecretNoteViewPage.tsx      (공개, /n/:slug)

service/admin/
  pages/
    SecretNoteManagePage.tsx    (admin, /admin/notes)
    SecretNoteFormPage.tsx      (admin, /admin/notes/new & /admin/notes/:id/edit)
    DeletedNotesPage.tsx        (admin, /admin/deleted-notes)
```

> **기존 admin 관리 페이지는 모두 `service/admin/pages/` 에 배치됨** (UserManagePage, CategoryManagePage, DeletedGuidesPage, GuideLogPage, InternalNoticePage, InternalCategoryManagePage). secret note 도 이 규칙을 따름. 공개 뷰만 자체 도메인 디렉토리.
>
> 참조 모델: [InternalNoticePage.tsx](my-site/src/service/admin/pages/InternalNoticePage.tsx) 가 admin 전용 CMS + 자체 라우트 구조의 레퍼런스.

### 8.2 `SecretNoteViewPage` (공개)
- `useParams<{ slug: string }>` → `SecretNoteRepository.getNoteBySlug(slug)`
- 없으면 "존재하지 않거나 삭제된 페이지입니다." + `Link to="/"` 로 홈 유도
- `useEffect` 에서 `<meta name="robots" content="noindex, nofollow">` `document.head` 에 append, cleanup 에서 remove
- 본문 렌더: `<div className="tiptap-editor prose max-w-none text-gray-700 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(note.content) }} />`
- `@/styles/editor.css` import
- **작성자/관리 버튼 일절 노출하지 않음** (admin 접속이어도 여기선 숨김)

### 8.3 `SecretNoteManagePage` (admin, `/admin/notes`)
- 레이아웃: `max-w-4xl mx-auto` ([UserManagePage](my-site/src/service/admin/pages/UserManagePage.tsx#L94) 와 동일)
- 제목: `<h1 className="text-2xl md:text-3xl font-extrabold text-blue-900 dark:text-blue-300 ...">비밀 노트</h1>`
- 상단 우측 액션: [새 노트 작성](indigo 톤, primary), [삭제된 노트](gray 톤, `to="/admin/deleted-notes"`)
- 테이블 row:
  - 제목 + 수정일
  - [링크 복사] → `navigator.clipboard.writeText(\`${window.location.origin}/n/${note.slug}\`)` 후 버튼 라벨을 1.5초간 `"복사됨!"` 으로 토글 (기존 프로젝트엔 성공 alert 패턴이 없으므로 alert 대신 인라인 피드백)
  - [슬러그 재발급] → `confirm('기존 URL이 비활성화됩니다. 재발급하시겠습니까?')` 후 `regenerateSlug(id)` 반환 slug 로 상태 즉시 업데이트 (refetch 불필요)
  - [수정] `<Link to={\`/admin/notes/${id}/edit\`}>`
  - [삭제] `deleteNote` + `confirm('정말 삭제하시겠습니까?')`
- 스타일 톤: `indigo-*` 계열 (purple 은 guide-logs 버튼과 충돌하여 회피)

### 8.4 `SecretNoteFormPage` (admin, `/admin/notes/new` & `/admin/notes/:id/edit`)
- 레이아웃: `max-w-3xl mx-auto` ([GuideFormPage](my-site/src/service/guide/pages/GuideFormPage.tsx#L104) 와 동일)
- 필드:
  - 제목 input (기존 폼 input 클래스 그대로)
  - "커스텀 슬러그(선택)" input + 도움말 "비워두면 자동 생성됩니다."
  - `<RichTextEditor content={content} onChange={setContent} onImageUpload={uploadGuideImage} />`
- 저장/취소 버튼 — 취소 시 `navigate('/admin/notes')`
- 저장 성공: `navigate('/admin/notes')` 만 (기존 [GuideFormPage:86-89](my-site/src/service/guide/pages/GuideFormPage.tsx#L86-L89) 와 일관). 링크 복사는 목록 페이지의 [링크 복사] 버튼으로 수행 — alert 로 성공 알림을 띄우는 패턴은 프로젝트에 없음

### 8.5 `DeletedNotesPage` (admin, `/admin/deleted-notes`)
- [DeletedGuidesPage](my-site/src/service/admin/pages/DeletedGuidesPage.tsx) 를 그대로 참고
- 레이아웃: `max-w-4xl mx-auto`
- 상단 네비: `<Link to="/admin/notes" className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-4 inline-block">← 비밀 노트 관리로</Link>`
- `getDeletedNotes()` → 테이블 렌더, [복구] 버튼(green 톤) → `restoreNote` → row 제거 (기존 DeletedGuidesPage 와 동일 UX)

---

## 9. 사이드바 통합 ([components/navigation/Sidebar.tsx](my-site/src/components/navigation/Sidebar.tsx))

현재 Sidebar 는 상단 블록(로그인/유저관리/내부공지/마이페이지)과 하단 `navLinks` 로 구분됨. **admin 전용 링크는 상단 블록의 `user.role === 'admin'` 가드 안에 추가**.

```tsx
{user.role === 'admin' && (
  <>
    <Link to="/admin/users" ...>유저 관리</Link>
    {/* 신규 */}
    <Link
      to="/admin/notes"
      onClick={onClose}
      className={`... ${
        location.pathname === '/admin/notes'
          || location.pathname.startsWith('/admin/notes/')
          || location.pathname === '/admin/deleted-notes'
          ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
          : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-slate-100'
      }`}
    >
      비밀 노트
    </Link>
  </>
)}
```

- `navLinks` 배열에는 **추가하지 않음** (일반 사용자에게 렌더되는 영역)
- 색 테마: `indigo-*` (purple 은 guide-logs 버튼에 이미 사용)

---

## 10. 보안 체크리스트

- [ ] `secret_notes` 에 anon/authenticated 용 SELECT 정책이 없는지 (admin 만)
- [ ] RPC `get_secret_note_by_slug` 의 `security definer` + `search_path=public` 고정
- [ ] 슬러그 엔트로피 ≥ 60 bit (12자 base36 ≈ 62 bit)
- [ ] 뷰 페이지 `robots noindex, nofollow` meta 주입 + 언마운트 시 제거
- [ ] 본문 HTML `DOMPurify.sanitize` 적용
- [ ] 본문 내 이미지는 Supabase Storage public bucket → 기밀 이미지 금지 안내(에디터 상단 힌트)
- [ ] 슬러그 재발급 시 이전 슬러그 접근은 즉시 404 (DB 상 자동 보장)
- [ ] anon 으로 `GET /rest/v1/secret_notes` 호출 시 `[]` 반환 확인

---

## 11. 작업 순서 (PR 단위)

1. **PR#1 — DB** : 테이블·트리거·RLS·RPC 마이그레이션 + 롤백 스크립트
2. **PR#2 — 타입 & 리포지토리** : `SecretNote` 타입 + `SecretNoteRepository`
3. **PR#3 — 공개 뷰 페이지** : `/n/:slug` + `SecretNoteViewPage` (비로그인 E2E 확인)
4. **PR#4 — 관리자 목록·폼** : `/admin/notes`, `/admin/notes/new`, `/admin/notes/:id/edit` + Sidebar 메뉴
5. **PR#5 — 복구 UI** : `/admin/deleted-notes` + `DeletedNotesPage`
6. **PR#6 — 정리** : `CLAUDE.md` 라우트 표 갱신, `encodeContent` 공용화(선택)

각 단계 `npm run type-check` 필수. 수동 테스트 시나리오:
- [ ] 비로그인 → `/n/<valid-slug>` 렌더 OK
- [ ] 비로그인 → `/n/<invalid>` 404 메시지
- [ ] 비로그인 → `/admin/notes` 접근 시 `/guide` 리다이렉트
- [ ] editor 로그인 → `/admin/notes` 접근 시 리다이렉트
- [ ] admin → 생성·수정·삭제·링크 복사·슬러그 재발급·복구 전부 동작
- [ ] 슬러그 재발급 후 이전 URL → 404
- [ ] `GET /rest/v1/secret_notes` anon 호출 시 `[]`

---

## 12. 착수 전 Supabase 대시보드 확인 (3가지)

1. **`pgcrypto` extension 활성** — `gen_random_bytes()`, `gen_random_uuid()` 사용
2. **`profiles.role = 'admin'` 레코드 존재** — 없으면 관리 페이지 진입 자체 불가
3. **`guide-images` 버킷의 INSERT 정책이 admin 에 열려있는지** — 기존 RichTextEditor 가 쓰고 있으므로 거의 확실 OK

---

## 13. 결정된 사항

| 항목 | 결정 |
|---|---|
| 리소스명 | `secret_notes` |
| 공개 URL | `/n/:slug` |
| 글쓰기 권한 | admin 전용 |
| 복구 UI | 제공 (`/admin/deleted-notes`) |
| 대표 이미지 필드 | 제거 (SPA OG 미지원) |
| 감사 로그 | 스코프 아웃 (향후 PR) |
| 색 테마 | **`indigo-*`** (`purple-*` 은 guide-logs 버튼과 충돌) |
| 이미지 업로더 | 기존 `uploadGuideImage` 재사용 |
| 본문 인코딩 공용화 | 초기 복붙, PR#6 에서 공용화(선택) |
| 페이지 디렉토리 | 공개 뷰 → `service/secretNote/pages/`, 관리 페이지 → `service/admin/pages/` (기존 CMS 컨벤션 준수) |
| 페이지 네이밍 | `SecretNoteViewPage`, `SecretNoteManagePage`, `SecretNoteFormPage`, `DeletedNotesPage` |
| mutation 시그니처 | `createNote(form, userId)`, `updateNote(id, form, userId)`, 나머지는 `(id)` 만 |
