-- =========================================================================
-- meetup_ledgers : 모임 기간 롤백 — 끝일 컬럼 제거, RPC 를 이전 형태로
-- =========================================================================
-- ⚠ 저장된 끝일 데이터는 사라집니다 (시작일 meetup_date 는 유지).
-- =========================================================================

drop function if exists get_meetup_settlement_by_slug(text);

create or replace function get_meetup_settlement_by_slug(p_slug text)
returns table (
  title text,
  meetup_date date,
  status text,
  public_snapshot jsonb,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select title, meetup_date, status, public_snapshot, updated_at
    from meetup_ledgers
   where slug = p_slug
     and share_enabled
     and deleted_at is null
   limit 1;
$$;

revoke all on function get_meetup_settlement_by_slug(text) from public;
grant execute on function get_meetup_settlement_by_slug(text) to anon, authenticated;

alter table meetup_ledgers drop constraint if exists meetup_ledgers_period_valid;
alter table meetup_ledgers drop column if exists meetup_end_date;
