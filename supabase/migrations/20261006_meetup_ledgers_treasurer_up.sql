-- =========================================================================
-- meetup_ledgers : 모임별 총무(여러 명)에게 편집 권한
-- =========================================================================
-- 20261006_meetup_ledgers_up.sql (+ editor_read, period) 이후 실행.
-- 최고 관리자가 모임마다 지정한 총무들(사이트 회원)은 그 모임만 열람 · 편집할 수 있습니다.
--   - 가능: 장부 편집 · 저장, 정산 완료 처리 / 다시 열기, 공개 링크 켜기 · 끄기 · 재발급
--   - 불가: 삭제 · 복원, 총무 임명 · 해제 (최고 관리자만) — 트리거로 강제
-- 송금이 모이는 정산 총무(장부 본문 data.treasurerId)는 이 총무들 중 한 명 (앱이 검증).
-- 기존 데이터 수정 없음 (기존 장부는 총무 없음 = 지금처럼 관리자만 편집).
-- 롤백은 20261006_meetup_ledgers_treasurer_down.sql 사용.
-- =========================================================================

-- 1) 총무 회원 id 목록 (profiles.id). 배열이라 FK 는 걸 수 없음
alter table meetup_ledgers
  add column treasurer_user_ids uuid[] not null default '{}';

create index meetup_ledgers_treasurers_idx
  on meetup_ledgers using gin (treasurer_user_ids);

-- 2) 총무 정책 : 자기 모임만 열람 / 수정 (승인 대기 계정 제외)
create policy "meetup_ledgers_treasurer_select"
  on meetup_ledgers for select
  using (
    auth.uid() = any (treasurer_user_ids)
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor', 'user')
    )
  );

create policy "meetup_ledgers_treasurer_update"
  on meetup_ledgers for update
  using (
    auth.uid() = any (treasurer_user_ids)
    and deleted_at is null
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor', 'user')
    )
  )
  with check (auth.uid() = any (treasurer_user_ids));

-- 3) 관리자 전용 컬럼 보호 : 관리자가 아니면 총무 목록 · 삭제 상태 · 작성자 변경 불가
--    (RLS 는 행 단위라 컬럼을 막지 못하므로 트리거로 강제)
create or replace function meetup_ledgers_guard_admin_columns()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  ) then
    if new.treasurer_user_ids is distinct from old.treasurer_user_ids
       or new.deleted_at is distinct from old.deleted_at
       or new.created_by is distinct from old.created_by then
      raise exception '총무 임명 · 해제, 삭제 · 복원은 최고 관리자만 할 수 있습니다.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger meetup_ledgers_guard_bu
  before update on meetup_ledgers
  for each row execute function meetup_ledgers_guard_admin_columns();
