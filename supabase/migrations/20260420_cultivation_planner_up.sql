-- =========================================================================
-- cultivation planner : 학생 육성 플래너 (유저별 플래너 학생 + 보유 재화)
-- =========================================================================
-- 기존 테이블/데이터 영향 없음. 전부 신규 오브젝트만 생성합니다.
-- 롤백은 20260420_cultivation_planner_down.sql 사용.
-- =========================================================================

-- 1) 플래너에 담은 학생 (1 user : N students)
create table planner_students (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  student_id  integer not null,                       -- SchaleDB Id
  targets     jsonb not null default '{}'::jsonb,     -- PlannerTargets 직렬화
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, student_id)                        -- 같은 학생 중복 추가 방지
);

create index planner_students_user_idx on planner_students(user_id, sort_order);

-- 2) 보유 재화 인벤토리 (1 user : 1 inventory)
create table planner_inventory (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  items      jsonb not null default '{}'::jsonb,      -- { "<item_id>": number }
  updated_at timestamptz not null default now()
);

-- 3) updated_at 자동 갱신 트리거 함수 (두 테이블 공통)
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger planner_students_bu
  before update on planner_students
  for each row execute function touch_updated_at();

create trigger planner_inventory_bu
  before update on planner_inventory
  for each row execute function touch_updated_at();

-- 4) RLS 활성화
alter table planner_students  enable row level security;
alter table planner_inventory enable row level security;

-- 5) 정책 : 본인 데이터만 CRUD 가능
create policy "planner_students_own"
  on planner_students for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "planner_inventory_own"
  on planner_inventory for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
