// Supabase REST 직접 호출 — supabase-js SDK 를 우회하는 쓰기 요청용.
//
// 배경 (af8ff4f): onAuthStateChange 콜백 안에서 SDK 를 호출하면 supabase-js 내부 auth lock 이
// 걸려 이후 SDK 쿼리가 응답 없이 대기하는 문제가 있었음. 가이드 insert/update 와 계정 정보 변경은
// fetch 로 직접 보내 이 경로를 피한다. SDK 로 되돌리지 말 것.

import { supabase } from '@/lib/supabase';
import { AppError } from '@/utils/AppError';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function getSessionToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

function headers(token: string, extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'apikey': SUPABASE_KEY,
    ...extra,
  };
}

async function send(url: string, init: RequestInit, failMessage: string): Promise<void> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new AppError(failMessage, 'API_ERROR', body);
  }
}

/** PostgREST insert. 비로그인 시 anon key 로 요청 (RLS 가 판정). */
export async function restInsert(table: string, body: Record<string, unknown>, failMessage: string): Promise<void> {
  const token = (await getSessionToken()) ?? SUPABASE_KEY;
  await send(
    `${SUPABASE_URL}/rest/v1/${table}`,
    { method: 'POST', headers: headers(token, { 'Prefer': 'return=minimal' }), body: JSON.stringify(body) },
    failMessage,
  );
}

/** PostgREST update. `filter` 는 쿼리스트링 (예: `id=eq.123`). */
export async function restUpdate(
  table: string,
  body: Record<string, unknown>,
  filter: string,
  failMessage: string,
): Promise<void> {
  const token = (await getSessionToken()) ?? SUPABASE_KEY;
  await send(
    `${SUPABASE_URL}/rest/v1/${table}?${filter}`,
    { method: 'PATCH', headers: headers(token, { 'Prefer': 'return=minimal' }), body: JSON.stringify(body) },
    failMessage,
  );
}

/** GoTrue 현재 유저 정보 변경 (이메일 / 비밀번호). 로그인 필수. */
export async function updateAuthUser(attrs: { email?: string; password?: string }, failMessage: string): Promise<void> {
  const token = await getSessionToken();
  if (!token) throw new AppError('로그인이 필요합니다.', 'UNAUTHORIZED');
  await send(
    `${SUPABASE_URL}/auth/v1/user`,
    { method: 'PUT', headers: headers(token), body: JSON.stringify(attrs) },
    failMessage,
  );
}
