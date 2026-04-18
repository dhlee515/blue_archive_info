-- =========================================================================
-- ROLLBACK : secret_notes 관련 오브젝트 전부 제거
-- =========================================================================
-- 이 스크립트 실행 시 secret_notes 테이블의 모든 데이터가 영구 삭제됩니다.
-- 기존 guides / profiles 등 다른 테이블은 영향 없음.
-- =========================================================================

drop function if exists get_secret_note_by_slug(text);
drop policy if exists "secret_notes_admin_all" on secret_notes;
drop trigger if exists secret_notes_biu on secret_notes;
drop table if exists secret_notes;
drop function if exists secret_notes_autoslug();
drop function if exists generate_short_slug();
