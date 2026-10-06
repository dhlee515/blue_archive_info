-- =========================================================================
-- meetup_ledgers : 총무 편집 권한 롤백 — 다시 관리자만 편집
-- =========================================================================
-- ⚠ 저장된 총무 임명(treasurer_user_ids)이 사라집니다. 장부 본문(data)의 정산 총무는 유지.
-- =========================================================================

drop trigger if exists meetup_ledgers_guard_bu on meetup_ledgers;
drop function if exists meetup_ledgers_guard_admin_columns();
drop policy if exists "meetup_ledgers_treasurer_update" on meetup_ledgers;
drop policy if exists "meetup_ledgers_treasurer_select" on meetup_ledgers;
drop index if exists meetup_ledgers_treasurers_idx;
alter table meetup_ledgers drop column if exists treasurer_user_ids;
