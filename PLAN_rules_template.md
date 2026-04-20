# 비밀 노트 — 타입 플러그인 시스템 + 규칙 공지(Rules) 템플릿 추가 계획

> 기존 `secret_notes` 리소스를 **타입별 플러그인 구조**로 리팩터링한다.
> 기존 "자유 본문"은 `free` 플러그인으로 캡슐화, 신규 "규칙 공지"는 `rules` 플러그인으로 추가한다.
> 향후 `notice` / `event` / `faq` 등 추가 타입은 **플러그인 파일 작성 + 레지스트리 1줄 등록**만으로 도입.
> URL 공유 방식은 기존 `/n/:slug` 그대로 — 새 URL 구조 없음.

---

## 1. 요구사항 정리

- 기존 자유 본문 비밀 노트 **그대로 유지** — 회귀 없어야 함
- 새 타입 **`rules`** — 섹션 라벨 + 행 리스트 + 배너(선택) + 푸터(선택)
- 행 아이콘은 **emoji + lucide-react 혼용 지원** (문자열 `"📋"` 또는 `"lucide:Shield"` 로 인코딩)
- 섹션 수 / 행 수 **상한 없음** — 앱 레벨 제한 금지
- 관리 폼에서 타입 **세그먼트 컨트롤** 로 전환
- 공개 뷰는 타입별 렌더 분기
- **플러그인 구조** — 각 타입은 자체 `Editor` / `Viewer` / `serialize` / `deserialize` / `createEmpty` / `badge` 를 캡슐화. 페이지는 플러그인 API 만 호출 (타입별 if/else 분기 금지)
- 감사 로그 / 슬러그 재발급 / 소프트 삭제 / 복구 UI 는 **전부 타입 무관하게 동작**

---

## 2. 프로젝트 컨벤션 준수 체크리스트

| 영역 | 컨벤션 | 이 계획 적용 |
|---|---|---|
| 리포지토리 패턴 | `.insert().select().single()` SDK 직접 사용 | 동일 |
| 메서드 시그니처 | `createNote(form, userId)`, `updateNote(id, form, userId)` | 동일 |
| 페이지 디렉토리 | admin CMS → `service/admin/pages/`, 공개 뷰 → `service/secretNote/pages/` | 동일 |
| 도메인 전용 컴포넌트 | `service/{feature}/components/` (가이드의 `RichTextEditor` 선례) | `service/secretNote/plugins/` 신설 |
| 타입 | `interface`, camelCase, JSDoc | 동일 |
| 색 테마 | UI chrome = `indigo-*` (비밀 노트 기존), 아이콘 색은 7색 맵핑 테이블 | 동일 |
| 다크모드 | `bg-white dark:bg-slate-800`, `text-blue-900 dark:text-blue-300` | 동일 |
| 폰트 | 시스템 폰트. Google Fonts 반입 금지 | 동일 |
| 기존 의존성 | `lucide-react` 이미 사용 중 ([package.json:26](my-site/package.json#L26)) | lucide 아이콘 재사용 |
| 확장 컴포넌트 | `dangerouslySetInnerHTML` 은 **Free 뷰어에서만**, Rules 뷰어는 전부 문자열 보간 | 동일 |

---

## 3. 핵심 설계 결정

1. **같은 테이블에 컬럼 추가** (`note_type`, `structured_data`) — 별도 테이블이면 RPC/라우트/관리 페이지 3중 복제 발생
2. **`structured_data jsonb`** — Postgres jsonb. 스키마 검증은 클라이언트 TS + 최소 DB CHECK
3. **공개 뷰는 단일 라우트 유지** — `/n/:slug` 하나, 컴포넌트 내부 플러그인 분기
4. **`content` 와 `structured_data` 는 타입별 배타 사용** — `content` 가 NOT NULL 이므로 rules 는 빈 문자열로 채움
5. **UI 폼은 "간단한 동적 배열 입력"** — dnd-kit 없이 위/아래 이동 + 추가/삭제 버튼. **섹션/행 수 무제한** (앱 레벨 제한 없음; Postgres jsonb 용량 제한만 자연 상한으로 작용)
6. **플러그인 구조** — 각 노트 타입은 `NoteTypePlugin` 인터페이스 구현. `free` 도 플러그인화. 신규 타입 도입은 **플러그인 파일 작성 + `registry.ts` 1줄 등록**. `SecretNoteFormPage` / `SecretNoteViewPage` / `SecretNoteManagePage` 는 플러그인 API 만으로 타입별 동작 수행 — **`if (noteType === ...)` 분기 금지**
7. **아이콘 표현** — emoji 와 lucide 아이콘 모두 단일 `string` 필드로 저장. `"📋"` 은 emoji, `"lucide:<PascalName>"` 은 lucide. 렌더는 공용 `<RuleIcon value={...} />` 컴포넌트가 분기
8. **배너 / 푸터** — `RulesData` 의 **선택 필드**. 에디터에서 "배너 추가" / "푸터 추가" 토글로 on/off

---

## 4. DB 스키마 변경

### 4.1 마이그레이션 SQL

신규 파일: `supabase/migrations/20260419_secret_notes_rules_up.sql`

```sql
-- 1) note_type 컬럼 : 'free' | 'rules' (신규 타입 추가 시 enum 확장 대신 text 사용)
alter table secret_notes
  add column note_type text not null default 'free';

-- 2) 구조화 데이터용 jsonb
alter table secret_notes
  add column structured_data jsonb;

-- 3) 앱 버그 방지용 제약 : free 면 content 필수, 구조화 타입이면 structured_data 필수
alter table secret_notes
  add constraint structured_data_required_when_not_free
  check (
    note_type = 'free'
    or structured_data is not null
  );

-- 4) RPC 갱신 (drop + recreate) — 반환 컬럼 확장
drop function if exists get_secret_note_by_slug(text);

create or replace function get_secret_note_by_slug(p_slug text)
returns table (
  id uuid,
  slug text,
  title text,
  note_type text,
  content text,
  structured_data jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select id, slug, title, note_type, content, structured_data, created_at, updated_at
    from secret_notes
   where slug = p_slug
     and deleted_at is null
   limit 1;
$$;

revoke all on function get_secret_note_by_slug(text) from public;
grant execute on function get_secret_note_by_slug(text) to anon, authenticated;
```

### 4.2 기존 데이터 영향
- 기존 노트는 `note_type = 'free'`, `structured_data = null` → UI/렌더 그대로
- CHECK 제약은 기존 데이터 전부 통과 (`note_type = 'free'` 이므로)

### 4.3 롤백

`supabase/migrations/20260419_secret_notes_rules_down.sql`

```sql
drop function if exists get_secret_note_by_slug(text);

create or replace function get_secret_note_by_slug(p_slug text)
returns table (
  id uuid, slug text, title text, content text,
  created_at timestamptz, updated_at timestamptz
)
language sql security definer set search_path = public
as $$
  select id, slug, title, content, created_at, updated_at
    from secret_notes where slug = p_slug and deleted_at is null limit 1;
$$;
revoke all on function get_secret_note_by_slug(text) from public;
grant execute on function get_secret_note_by_slug(text) to anon, authenticated;

alter table secret_notes drop constraint if exists structured_data_required_when_not_free;
alter table secret_notes drop column if exists structured_data;
alter table secret_notes drop column if exists note_type;
```

---

## 5. 타입 확장 ([types/secretNote.ts](my-site/src/types/secretNote.ts))

```ts
/** 노트 타입 (플러그인 레지스트리 키) */
export type NoteType = 'free' | 'rules';  // 신규 플러그인 추가 시 여기에 확장

/** 행 아이콘 색 */
export type RuleColor = 'red' | 'yellow' | 'green' | 'purple' | 'blue' | 'orange' | 'gray';

/**
 * 아이콘 값
 * - emoji:  "📋" (그대로)
 * - lucide: "lucide:Shield" (PascalCase 이름)
 */
export type RuleIcon = string;

/** 규칙 행 하나 */
export interface RuleItem {
  icon: RuleIcon;
  color: RuleColor;
  title: string;
  sub?: string;
}

/** 규칙 섹션 */
export interface RuleSection {
  label: string;
  items: RuleItem[];
}

/** 배너(선택) */
export interface RuleBanner {
  icon: RuleIcon;
  title: string;
  body: string;
}

/** 규칙 공지 전체 구조 — rules 플러그인의 data 타입 */
export interface RulesData {
  tag?: string;
  version?: string;
  heading: string;
  subtitle?: string;
  sections: RuleSection[];
  banner?: RuleBanner;
  footer?: string;
}

/** 비밀 노트 */
export interface SecretNote {
  id: string;
  slug: string;
  title: string;
  noteType: NoteType;
  content: string;                      // free 전용 (decoded HTML)
  structuredData: unknown | null;       // 플러그인이 deserialize 함
  authorId?: string;
  createdAt: string;
  updatedAt: string;
}

/** 폼 데이터 — noteType + 플러그인 data */
export interface SecretNoteFormData {
  title: string;
  noteType: NoteType;
  pluginData: unknown;                  // 플러그인의 in-memory 상태
  customSlug?: string;
}
```

- `structuredData` / `pluginData` 를 `unknown` 으로 두어 **플러그인이 자체 타입을 책임**지도록. 페이지/리포는 타입 알 필요 없음.
- [types/index.ts](my-site/src/types/index.ts) 배럴에 `NoteType`, `RuleColor`, `RuleIcon`, `RuleItem`, `RuleSection`, `RuleBanner`, `RulesData` 추가

---

## 6. 플러그인 시스템 설계 (신설)

### 6.1 디렉토리 구조
```
service/secretNote/plugins/
  types.ts            // NoteTypePlugin 인터페이스
  registry.ts         // 레지스트리 + getPlugin()
  RuleIcon.tsx        // emoji/lucide 겸용 아이콘 렌더 컴포넌트 (공용)
  free/
    FreeEditor.tsx    // RichTextEditor 래퍼
    FreeViewer.tsx    // DOMPurify 렌더 (기존 SecretNoteViewPage 로직 이전)
    index.ts          // freePlugin export
  rules/
    RulesEditor.tsx
    RulesViewer.tsx
    index.ts          // rulesPlugin export
```

### 6.2 `NoteTypePlugin` 인터페이스 ([plugins/types.ts](my-site/src/service/secretNote/plugins/types.ts))

```ts
import type { ComponentType } from 'react';
import type { NoteType } from '@/types/secretNote';

export interface SerializedNote {
  content: string;                 // NOT NULL 이므로 기본 ''
  structuredData: unknown | null;
}

export interface NoteTypePlugin<TData = unknown> {
  type: NoteType;
  label: string;                   // 폼 탭에 표시. "자유 본문" / "규칙 공지"

  /** 새 노트 생성 시 초기값 */
  createEmpty: () => TData;

  /** DB row → in-memory 상태 */
  deserialize: (row: { content: string; structuredData: unknown | null }) => TData;

  /** in-memory 상태 → DB 저장 형태 */
  serialize: (data: TData) => SerializedNote;

  /** 편집 UI. 부모가 controlled 로 관리 */
  Editor: ComponentType<{ value: TData; onChange: (v: TData) => void }>;

  /** 공개 뷰 렌더 */
  Viewer: ComponentType<{ data: TData; title: string; updatedAt: string }>;

  /** 목록/복구 페이지의 타입 배지 (선택) */
  badge?: { label: string; className: string };
}
```

### 6.3 레지스트리 ([plugins/registry.ts](my-site/src/service/secretNote/plugins/registry.ts))

```ts
import type { NoteType } from '@/types/secretNote';
import type { NoteTypePlugin } from './types';
import { freePlugin } from './free';
import { rulesPlugin } from './rules';

// 신규 타입 추가 시 이 객체에 한 줄만 등록
const REGISTRY: Record<NoteType, NoteTypePlugin<any>> = {
  free: freePlugin,
  rules: rulesPlugin,
};

export function getPlugin(type: NoteType): NoteTypePlugin<any> {
  const plugin = REGISTRY[type];
  if (!plugin) throw new Error(`Unknown note type: ${type}`);
  return plugin;
}

export const ALL_PLUGINS: NoteTypePlugin<any>[] = Object.values(REGISTRY);
```

### 6.4 `freePlugin` 예시

```ts
// plugins/free/index.ts
export const freePlugin: NoteTypePlugin<string> = {
  type: 'free',
  label: '자유 본문',
  createEmpty: () => '',
  deserialize: ({ content }) => content,
  serialize: (html) => ({ content: html, structuredData: null }),
  Editor: FreeEditor,     // <RichTextEditor value={...} onChange={...} />
  Viewer: FreeViewer,     // <DOMPurify-rendered div>
  // free 에는 배지 없음
};
```

### 6.5 `rulesPlugin` 예시

```ts
// plugins/rules/index.ts
import type { RulesData } from '@/types/secretNote';

const INITIAL: RulesData = { heading: '', sections: [] };

export const rulesPlugin: NoteTypePlugin<RulesData> = {
  type: 'rules',
  label: '규칙 공지',
  createEmpty: () => structuredClone(INITIAL),
  deserialize: ({ structuredData }) => (structuredData as RulesData) ?? structuredClone(INITIAL),
  serialize: (data) => ({ content: '', structuredData: data }),
  Editor: RulesEditor,
  Viewer: RulesViewer,
  badge: {
    label: '규칙',
    className: 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
  },
};
```

### 6.6 `RuleIcon` 공용 컴포넌트

```tsx
// plugins/RuleIcon.tsx
import * as LucideIcons from 'lucide-react';
import type { RuleIcon as RuleIconValue } from '@/types/secretNote';

interface Props { value: RuleIconValue; className?: string }

export function RuleIcon({ value, className = 'w-4 h-4' }: Props) {
  if (value.startsWith('lucide:')) {
    const name = value.slice('lucide:'.length) as keyof typeof LucideIcons;
    const Icon = LucideIcons[name] as React.ComponentType<{ className?: string }> | undefined;
    if (Icon) return <Icon className={className} />;
    return <span className="text-xs text-red-500">?</span>;
  }
  return <span className="text-base leading-none">{value}</span>;
}
```

### 6.7 아이콘 피커 (에디터용)
- `RulesEditor` 내부에서 각 행의 아이콘 선택 시:
  - [emoji 입력] + [lucide 선택] 두 가지 모드 전환
  - lucide 는 **큐레이션된 목록** (`Shield`, `AlertTriangle`, `Users`, `Lock`, `Link`, `Image`, `Ban`, ...) 을 배열로 정의 — 전체 lucide 를 다 노출하면 너무 많음. 상수 `CURATED_LUCIDE_ICONS: string[]` 를 유지
  - 향후 필요 시 검색 UI 추가 가능 (범위 밖)

---

## 7. 리포지토리 변경 ([repositories/secretNoteRepository.ts](my-site/src/repositories/secretNoteRepository.ts))

### 7.1 `toNote` 매퍼
```ts
private static toNote(row: Record<string, unknown>): SecretNote {
  return {
    id: row.id as string,
    slug: row.slug as string,
    title: row.title as string,
    noteType: (row.note_type as NoteType) ?? 'free',
    content: decodeContent((row.content as string) ?? ''),
    structuredData: (row.structured_data as unknown) ?? null,
    authorId: (row.author_id as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
```

### 7.2 `createNote` / `updateNote` — 플러그인 경유로 단순화

```ts
static async createNote(formData: SecretNoteFormData, userId: string): Promise<SecretNote> {
  const plugin = getPlugin(formData.noteType);
  const { content, structuredData } = plugin.serialize(formData.pluginData);

  const insertData: Record<string, unknown> = {
    title: formData.title,
    author_id: userId,
    note_type: formData.noteType,
    content: formData.noteType === 'free' ? encodeContent(content) : '',
    structured_data: structuredData,
  };
  if (formData.customSlug?.trim()) {
    insertData.slug = formData.customSlug.trim();
  }

  const { data, error } = await supabase
    .from('secret_notes')
    .insert(insertData).select().single();
  if (error) throw error;
  return SecretNoteRepository.toNote(data);
}
```

- `content` Base64 인코딩은 **free 타입일 때만** 적용 (rules 는 빈 문자열이 DB 그대로 저장되어야 NOT NULL 통과)
- 타입별 if/else 가 최소 한 곳(인코딩 결정)에 남지만, 이건 DB 컬럼 제약 때문이지 UI 분기가 아니므로 허용

### 7.3 나머지 메서드는 변경 없음
- `getNoteBySlug` / `getNotes` / `getNoteById` / `deleteNote` / `restoreNote` / `regenerateSlug`

---

## 8. 페이지/컴포넌트 변경

### 8.1 `SecretNoteFormPage` ([service/admin/pages/SecretNoteFormPage.tsx](my-site/src/service/admin/pages/SecretNoteFormPage.tsx))
- 상단 **타입 세그먼트 컨트롤** — `ALL_PLUGINS.map(p => <button>{p.label}</button>)` 로 자동 생성
- 상태: `noteType`, `pluginData`, `title`, `customSlug`
- 타입 변경 시 `pluginData = plugin.createEmpty()` 로 초기화 + 확인 프롬프트 `"작성 중인 내용이 삭제됩니다. 전환하시겠습니까?"` (기존 데이터 있을 때만)
- 선택된 플러그인의 `<plugin.Editor value={pluginData} onChange={setPluginData} />` 렌더
- 저장: `SecretNoteRepository.createNote({ title, noteType, pluginData, customSlug }, userId)`
- 편집 진입 시: `plugin.deserialize({ content: note.content, structuredData: note.structuredData })` 로 `pluginData` 초기화

### 8.2 `SecretNoteViewPage` ([service/secretNote/pages/SecretNoteViewPage.tsx](my-site/src/service/secretNote/pages/SecretNoteViewPage.tsx))
```tsx
const plugin = getPlugin(note.noteType);
const pluginData = plugin.deserialize({
  content: note.content,
  structuredData: note.structuredData,
});
return <plugin.Viewer data={pluginData} title={note.title} updatedAt={note.updatedAt} />;
```
- `noindex` 메타 주입은 타입 무관 공통
- "존재하지 않음" 분기는 기존 그대로

### 8.3 `SecretNoteManagePage` / `DeletedNotesPage`
- 각 행에 `plugin.badge` 가 있으면 제목 옆에 배지 렌더
- 다른 변경 없음

### 8.4 `RulesEditor` ([plugins/rules/RulesEditor.tsx](my-site/src/service/secretNote/plugins/rules/RulesEditor.tsx))
- 메타: `tag`, `version`, `heading`, `subtitle` (input)
- **섹션 카드 리스트** (무제한):
  - 섹션 제목 input + [↑/↓/삭제]
  - 행 카드 리스트:
    - [아이콘 선택] (emoji input / lucide 선택 모달)
    - [색 선택] (7색 pill)
    - `title` / `sub` input
    - [↑/↓/삭제]
  - [행 추가]
- [섹션 추가]
- **배너** : 기본 OFF → [배너 추가] 버튼 → 펼쳐지면 icon/title/body input 편집. [배너 제거] 로 다시 OFF
- **푸터** : 기본 OFF → [푸터 추가] → textarea. [푸터 제거] 로 OFF
- Tailwind 다크모드 일관 적용

### 8.5 `RulesViewer` ([plugins/rules/RulesViewer.tsx](my-site/src/service/secretNote/plugins/rules/RulesViewer.tsx))
- §9 디자인 매핑대로 렌더
- `data.banner` / `data.footer` 는 undefined 면 미렌더
- `data.sections` 는 항상 렌더, 비어있으면 "내용 없음" 플레이스홀더

### 8.6 `FreeEditor` / `FreeViewer` (이전 로직 이동)
- `FreeEditor` : 기존 `SecretNoteFormPage` 의 RichTextEditor 호출을 래핑
- `FreeViewer` : 기존 `SecretNoteViewPage` 의 DOMPurify 렌더 블록을 이동 — **기능 동일, 파일만 이전**

---

## 9. 공개 뷰 디자인 매핑 (목업 HTML → 프로젝트 Tailwind)

| 목업 요소 | 목업 값 | 프로젝트 클래스 |
|---|---|---|
| body 배경 | `#0d1117` | `MainLayout` 상속 |
| 카드(surface) | `#161b22 / #30363d` | `bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl` |
| row hover | `#1c2330` | `hover:bg-blue-50/30 dark:hover:bg-slate-700/50` |
| tag "📋 Notice" | accent 반투명 | `text-xs font-bold tracking-wider uppercase px-2.5 py-1 rounded bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800` |
| h1 그라디언트 | linear-gradient 텍스트 | **단순화** — `text-2xl md:text-3xl font-extrabold text-blue-900 dark:text-blue-300 tracking-tight` |
| section-label | uppercase muted | `text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-400 mt-7 mb-3` |
| row 구분선 | `#30363d` | `border-b last:border-b-0 border-gray-100 dark:border-slate-700` |
| icon-box 32×32 | 반투명 배경 | `w-8 h-8 rounded-lg flex items-center justify-center` + §9.1 색 맵 |
| row-title | 14px bold | `text-sm md:text-base font-semibold text-gray-800 dark:text-slate-200` |
| row-sub | muted | `text-xs text-gray-500 dark:text-slate-400 mt-0.5` |
| row-num (01, 02…) | muted 우측 | `text-[11px] font-bold text-gray-400 dark:text-slate-500 pt-0.5 min-w-[18px] text-right` |
| banner | purple 반투명 | `bg-purple-50 dark:bg-purple-900/40 border border-purple-200 dark:border-purple-800 rounded-xl p-4` |
| banner-title | purple bold | `text-sm font-bold text-purple-700 dark:text-purple-300` |
| footer | surface + red 강조 | `bg-white dark:bg-slate-800 border rounded-xl p-4 text-xs`, `<strong>` → `text-red-600 dark:text-red-400` |
| max-width | 600px | `max-w-2xl mx-auto` (가독성) |

### 9.1 아이콘 색 → Tailwind 상수 테이블
```ts
// plugins/rules/colors.ts
export const COLOR_BG: Record<RuleColor, string> = {
  red:    'bg-red-50 dark:bg-red-900/40',
  yellow: 'bg-yellow-50 dark:bg-yellow-900/40',
  green:  'bg-green-50 dark:bg-green-900/40',
  purple: 'bg-purple-50 dark:bg-purple-900/40',
  blue:   'bg-blue-50 dark:bg-blue-900/40',
  orange: 'bg-orange-50 dark:bg-orange-900/40',
  gray:   'bg-gray-100 dark:bg-slate-700',
};
export const COLOR_FG: Record<RuleColor, string> = {
  red:    'text-red-600 dark:text-red-400',
  yellow: 'text-yellow-700 dark:text-yellow-300',
  green:  'text-green-600 dark:text-green-400',
  purple: 'text-purple-700 dark:text-purple-300',
  blue:   'text-blue-700 dark:text-blue-300',
  orange: 'text-orange-600 dark:text-orange-400',
  gray:   'text-gray-600 dark:text-slate-400',
};
```
> **Tailwind JIT 이 전체 문자열을 볼 수 있도록 동적 합성 금지.** 상수 맵만 사용.

---

## 10. 보안 체크

- [ ] `structured_data` 는 jsonb — HTML 삽입 불가, `RulesViewer` 는 `dangerouslySetInnerHTML` **사용 금지**. 모든 텍스트는 `{value}` 보간
- [ ] lucide 아이콘 이름은 `"lucide:"` 접두어로만 판별. `LucideIcons[name]` 조회 실패 시 폴백 렌더
- [ ] RPC 반환에 `author_id` 여전히 미포함 (기존 정책 유지)
- [ ] `customSlug` 검증 : 영문/숫자/하이픈만 (기존 정책 유지)
- [ ] `noteType` 은 화이트리스트(`'free' | 'rules'`) 만 허용. 레지스트리에 없는 값은 저장 실패 (TS 레벨 + `getPlugin` 런타임 체크)
- [ ] DB CHECK `structured_data_required_when_not_free` — 앱 버그로 null 이 와도 거부

---

## 11. 작업 순서 (PR 단위)

1. **PR#1 — 플러그인 스켈레톤 + `free` 플러그인으로 리팩터링 (기능 동일 보장)**
   - `plugins/types.ts`, `plugins/registry.ts`, `plugins/RuleIcon.tsx`, `plugins/free/*`
   - `SecretNoteFormPage` / `SecretNoteViewPage` 를 플러그인 API 로 전환 (타입별 분기 제거)
   - **rules 없이 free 만 등록한 상태로 기존 자유 본문 노트가 그대로 작동해야 함 → 회귀 테스트 중요**
2. **PR#2 — DB 확장**
   - `20260419_secret_notes_rules_up.sql` 작성 + 수동 실행
   - RPC 응답 필드 확인 (Studio 에서 `select * from get_secret_note_by_slug(...)`)
3. **PR#3 — 타입 & 리포 업데이트**
   - `SecretNote` / `SecretNoteFormData` 확장, `toNote` 에 신규 컬럼 매핑
   - `createNote` / `updateNote` 를 `pluginData` 기반으로 재작성
4. **PR#4 — `rules` 플러그인 본체**
   - `RulesData` 타입, `RulesEditor`, `RulesViewer`, `colors.ts`, 아이콘 피커, 큐레이션된 lucide 리스트
   - `plugins/registry.ts` 에 `rulesPlugin` 한 줄 등록
5. **PR#5 — 관리 UI 완성**
   - `SecretNoteFormPage` 에 세그먼트 컨트롤 추가, 타입 전환 프롬프트
   - `SecretNoteManagePage` / `DeletedNotesPage` 에 `plugin.badge` 렌더
6. **PR#6 — 정리**
   - `CLAUDE.md` 데이터 모델 섹션에 `note_type` / 플러그인 시스템 1~2줄 추가
   - 수동 QA (§11.1 체크리스트)

### 11.1 수동 테스트 체크리스트
- [ ] **회귀 (PR#1 완료 시점)** : 기존 자유 본문 노트 작성/수정/조회 모두 기존과 동일
- [ ] rules 노트 작성 → 목록에 `"규칙"` indigo 배지
- [ ] free → rules 전환 시 경고 프롬프트 노출 + 확인 후 초기화
- [ ] `/n/<slug>` 에서 rules 노트 렌더 (디자인 매핑 확인)
- [ ] 배너 / 푸터 토글 off 상태로 저장 후 조회 → 해당 블록 미표시
- [ ] 섹션 50개 / 섹션당 행 50개 저장 시도 → 정상 (상한 없음 확인)
- [ ] 아이콘을 emoji → lucide 전환 후 저장 → 뷰에서 올바른 아이콘
- [ ] 비로그인 `GET /rest/v1/secret_notes` 여전히 `[]`

---

## 12. 결정된 사항

| 항목 | 결정 |
|---|---|
| 확장 방식 | `secret_notes` 에 `note_type`, `structured_data jsonb` 컬럼 추가 |
| 라우트 | 변경 없음 — `/n/:slug`, `/admin/notes/*` 그대로 |
| 플러그인 구조 | 도입 — `NoteTypePlugin` 인터페이스 + `registry.ts`. free 도 플러그인화 |
| 아이콘 표현 | emoji + lucide-react 혼용. 문자열 `"📋"` / `"lucide:<Name>"` 로 인코딩. 공용 `<RuleIcon />` 컴포넌트 |
| lucide 선택 UI | 큐레이션된 상수 리스트 (`CURATED_LUCIDE_ICONS`) 에서 선택 |
| 배너 / 푸터 | 선택 필드. 에디터에서 [추가] / [제거] 토글 |
| 섹션 / 행 수 | **무제한** (앱 레벨 상한 없음) |
| 드래그 앤 드롭 | 미지원 — 위/아래 이동 버튼만 (YAGNI) |
| 색 테마 | UI chrome `indigo-*`, 아이콘 색 상수 맵 (Tailwind JIT 대응) |
| 폰트 | 시스템 폰트. Google Fonts 반입 없음 |
| 기존 데이터 영향 | 없음 — `note_type default 'free'` 로 자동 배치 |
| 향후 타입 추가 | 플러그인 파일 작성 + 레지스트리 1줄 등록 |
