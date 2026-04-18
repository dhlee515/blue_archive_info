-- =========================================================================
-- secret_notes : 관리자 전용 비밀 노트 (URL 을 아는 사람만 접근)
-- =========================================================================
-- 기존 테이블/데이터 영향 없음. 전부 신규 오브젝트만 생성합니다.
-- 롤백은 20260418_secret_notes_down.sql 사용.
-- =========================================================================

-- 1) 테이블
create table secret_notes (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  content     text not null,              -- Base64 인코딩된 HTML
  author_id   uuid not null references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz                  -- soft delete
);

create index secret_notes_slug_idx    on secret_notes(slug) where deleted_at is null;
create index secret_notes_created_idx on secret_notes(created_at desc) where deleted_at is null;

-- 2) slug 생성 함수 (12자 base36, ≈62 bit 엔트로피)
create or replace function generate_short_slug()
returns text language plpgsql as $$
declare
  s text;
begin
  s := lower(substr(encode(gen_random_bytes(12), 'base64'), 1, 12));
  s := regexp_replace(s, '[^a-z0-9]', '', 'g');
  while length(s) < 12 loop
    s := s || lower(substr(encode(gen_random_bytes(6), 'base64'), 1, 6));
    s := regexp_replace(s, '[^a-z0-9]', '', 'g');
  end loop;
  return substr(s, 1, 12);
end $$;

-- 3) 트리거 함수 : slug 자동 생성 + updated_at 갱신
create or replace function secret_notes_autoslug()
returns trigger language plpgsql as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := generate_short_slug();
  end if;
  new.updated_at := now();
  return new;
end $$;

-- 4) 트리거
create trigger secret_notes_biu
  before insert or update on secret_notes
  for each row execute function secret_notes_autoslug();

-- 5) RLS 활성화
alter table secret_notes enable row level security;

-- 6) admin 전용 정책 (목록/생성/수정/삭제/복구 전부)
create policy "secret_notes_admin_all"
  on secret_notes for all
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

-- 7) anon/authenticated 열람용 RPC
-- 테이블 직접 SELECT 는 admin 만 허용하고, 공개 열람은 이 RPC 하나만 노출.
create or replace function get_secret_note_by_slug(p_slug text)
returns table (
  id uuid,
  slug text,
  title text,
  content text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select id, slug, title, content, created_at, updated_at
    from secret_notes
   where slug = p_slug
     and deleted_at is null
   limit 1;
$$;

revoke all on function get_secret_note_by_slug(text) from public;
grant execute on function get_secret_note_by_slug(text) to anon, authenticated;
