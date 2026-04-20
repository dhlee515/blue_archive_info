-- =========================================================================
-- ROLLBACK : secret_notes 타입 플러그인 관련 확장 제거
-- =========================================================================
-- 주의: structured_data 컬럼의 모든 JSON 데이터가 영구 삭제됩니다.
-- note_type != 'free' 인 노트가 있으면 content 가 빈 문자열이므로 실질적으로 데이터 손실.
-- 실행 전 rules 노트 존재 여부 확인 권장:
--   select count(*) from secret_notes where note_type <> 'free';
-- =========================================================================

-- 1) RPC 원본 시그니처로 복구
drop function if exists get_secret_note_by_slug(text);

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

-- 2) 제약 및 컬럼 제거
alter table secret_notes drop constraint if exists structured_data_required_when_not_free;
alter table secret_notes drop column if exists structured_data;
alter table secret_notes drop column if exists note_type;
