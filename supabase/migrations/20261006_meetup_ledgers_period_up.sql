-- =========================================================================
-- meetup_ledgers : 모임 기간 (시작일 ~ 끝일)
-- =========================================================================
-- 20261006_meetup_ledgers_up.sql 이후 실행.
-- 기존 meetup_date 를 "시작일"로 그대로 쓰고, 끝일 컬럼만 추가합니다.
-- 끝일이 null 이면 하루짜리 모임. 기존 데이터 수정 없음.
-- 롤백은 20261006_meetup_ledgers_period_down.sql 사용.
-- =========================================================================

-- 1) 끝일 컬럼
alter table meetup_ledgers
  add column meetup_end_date date;

-- 2) 끝일은 시작일이 있을 때만, 시작일 이후로만
alter table meetup_ledgers
  add constraint meetup_ledgers_period_valid
  check (
    meetup_end_date is null
    or (meetup_date is not null and meetup_end_date >= meetup_date)
  );

-- 3) 공개 결산 RPC 갱신 (반환 컬럼이 바뀌므로 drop + recreate)
drop function if exists get_meetup_settlement_by_slug(text);

create or replace function get_meetup_settlement_by_slug(p_slug text)
returns table (
  title text,
  meetup_date date,
  meetup_end_date date,
  status text,
  public_snapshot jsonb,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select title, meetup_date, meetup_end_date, status, public_snapshot, updated_at
    from meetup_ledgers
   where slug = p_slug
     and share_enabled
     and deleted_at is null
   limit 1;
$$;

revoke all on function get_meetup_settlement_by_slug(text) from public;
grant execute on function get_meetup_settlement_by_slug(text) to anon, authenticated;
