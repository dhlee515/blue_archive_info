-- =========================================================================
-- secret_notes : 타입 플러그인 시스템 대응 스키마 확장
-- =========================================================================
-- 기존 자유 본문 노트는 note_type default 'free' 로 자동 배치.
-- 기존 데이터 수정 없음. 신규 컬럼 + RPC 갱신만.
-- 롤백은 20260419_secret_notes_rules_down.sql 사용.
-- =========================================================================

-- 1) note_type 컬럼 : 'free' | 'rules' (신규 타입 추가 시 text 그대로 확장)
alter table secret_notes
  add column note_type text not null default 'free';

-- 2) 구조화 데이터용 jsonb
alter table secret_notes
  add column structured_data jsonb;

-- 3) 앱 버그 방지용 제약 : free 가 아니면 structured_data 필수
alter table secret_notes
  add constraint structured_data_required_when_not_free
  check (
    note_type = 'free'
    or structured_data is not null
  );

-- 4) RPC 갱신 (drop + recreate) — 반환 컬럼에 note_type, structured_data 포함
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
