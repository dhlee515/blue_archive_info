-- =========================================================================
-- meetup_ledgers : 관리자 전용 오프라인 모임 회계 장부 (+ 슬러그 공개 결산)
-- =========================================================================
-- 기존 테이블/데이터 영향 없음. 전부 신규 오브젝트만 생성합니다.
-- 롤백은 20261006_meetup_ledgers_down.sql 사용.
--
-- ⚠ 의존성: generate_short_slug() 는 20260418_secret_notes_up.sql 에서 생성된 함수입니다.
--   secret_notes 를 롤백(20260418_secret_notes_down.sql)하면 이 함수가 drop 되어
--   모임 장부 생성 / 슬러그 재발급이 런타임에 실패합니다. (plpgsql 본문 안의 호출은
--   Postgres 가 의존성으로 추적하지 않아 drop 이 막히지 않음)
-- =========================================================================

-- 1) 테이블
create table meetup_ledgers (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  title           text not null,
  meetup_date     date,
  status          text not null default 'open' check (status in ('open', 'closed')),
  share_enabled   boolean not null default false,
  data            jsonb not null default '{}'::jsonb,   -- MeetupLedgerData (types/meetup.ts)
  public_snapshot jsonb,                                -- MeetupPublicSnapshot — 공개 RPC 가 이것만 반환
  created_by      uuid not null references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz                           -- soft delete
);

create index meetup_ledgers_list_idx on meetup_ledgers(meetup_date desc) where deleted_at is null;

-- 2) 트리거 함수 : slug 자동 생성 + updated_at 갱신 (secret_notes_autoslug 와 같은 패턴)
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

-- 3) RLS : admin 전용 (목록/생성/수정/삭제/복구 전부)
alter table meetup_ledgers enable row level security;

create policy "meetup_ledgers_admin_all"
  on meetup_ledgers for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- 4) anon/authenticated 공개 결산 열람 RPC
-- 공개 켜짐 + 미삭제 장부의 공개 스냅샷만 반환. 원본 data (내부 메모 포함) 는 노출하지 않음.
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
