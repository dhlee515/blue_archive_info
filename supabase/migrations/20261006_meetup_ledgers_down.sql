-- =========================================================================
-- meetup_ledgers 롤백 — 20261006_meetup_ledgers_up.sql 의 역순
-- =========================================================================
-- ⚠ 장부 데이터가 전부 삭제됩니다.
-- generate_short_slug() 는 secret_notes 소유이므로 건드리지 않습니다.
-- =========================================================================

drop function if exists get_meetup_settlement_by_slug(text);
drop table if exists meetup_ledgers;          -- 트리거 · 정책 · 인덱스 함께 삭제
drop function if exists meetup_ledgers_autoslug();
