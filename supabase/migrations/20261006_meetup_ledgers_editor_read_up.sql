-- =========================================================================
-- meetup_ledgers : 부관리자(editor) 열람 허용
-- =========================================================================
-- 20261006_meetup_ledgers_up.sql 이후 실행.
-- 기존 admin 전용 정책(meetup_ledgers_admin_all)은 그대로 두고, editor 에게 SELECT 만 추가로 허용.
-- (permissive 정책은 OR 로 합쳐지므로 insert / update / delete 는 여전히 admin 만)
-- 롤백은 20261006_meetup_ledgers_editor_read_down.sql 사용.
-- =========================================================================

create policy "meetup_ledgers_editor_select"
  on meetup_ledgers for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'editor'
    )
  );
