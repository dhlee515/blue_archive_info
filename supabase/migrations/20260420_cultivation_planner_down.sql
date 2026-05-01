-- =========================================================================
-- ROLLBACK : cultivation planner 관련 오브젝트 전부 제거
-- =========================================================================
-- 이 스크립트 실행 시 planner_students / planner_inventory 의 모든 데이터가
-- 영구 삭제됩니다. 기존 guides / secret_notes / profiles 등 다른 테이블은 영향 없음.
--
-- touch_updated_at() 함수는 범용 유틸리티이므로 유지합니다.
-- (다른 마이그레이션이 재사용할 가능성이 있음)
-- =========================================================================

drop policy if exists "planner_students_own"  on planner_students;
drop policy if exists "planner_inventory_own" on planner_inventory;

drop trigger if exists planner_students_bu  on planner_students;
drop trigger if exists planner_inventory_bu on planner_inventory;

drop table if exists planner_students;
drop table if exists planner_inventory;

-- touch_updated_at() 함수는 의도적으로 drop 하지 않음.
