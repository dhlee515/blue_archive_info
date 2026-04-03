// SchaleDB fetch + localStorage 캐싱 유틸리티

import { SCHALEDB_ENDPOINTS, SCHALEDB_CACHE, type SchaleDBEndpointKey } from './schaledb';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * SchaleDB 데이터를 fetch하고 localStorage에 캐싱합니다.
 * - TTL 내: 캐시 반환
 * - TTL 만료: 네트워크 fetch → 캐시 갱신
 * - 네트워크 실패: 만료된 캐시라도 반환 (stale-while-error)
 */
export async function fetchSchaleDB<T>(key: SchaleDBEndpointKey): Promise<T> {
  const cacheKey = `${SCHALEDB_CACHE.PREFIX}${key}`;

  // 1. 캐시 확인
  const cached = readCache<T>(cacheKey);
  if (cached && !isExpired(cached.timestamp)) {
    return cached.data;
  }

  // 2. 네트워크 fetch
  try {
    const url = SCHALEDB_ENDPOINTS[key];
    const res = await fetch(url);
    if (!res.ok) throw new Error(`SchaleDB fetch failed: ${res.status}`);

    const data: T = await res.json();
    writeCache(cacheKey, data);
    return data;
  } catch (error) {
    // 3. stale-while-error: 만료 캐시라도 반환
    if (cached) {
      console.warn(`SchaleDB fetch failed for "${key}", using stale cache`, error);
      return cached.data;
    }
    throw error;
  }
}

/** 캐시 수동 무효화 */
export function invalidateSchaleDBCache(key?: SchaleDBEndpointKey): void {
  if (key) {
    localStorage.removeItem(`${SCHALEDB_CACHE.PREFIX}${key}`);
  } else {
    // 전체 SchaleDB 캐시 삭제
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(SCHALEDB_CACHE.PREFIX)) keysToRemove.push(k);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  }
}

function readCache<T>(cacheKey: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

function writeCache<T>(cacheKey: string, data: T): void {
  const entry: CacheEntry<T> = { data, timestamp: Date.now() };
  try {
    localStorage.setItem(cacheKey, JSON.stringify(entry));
  } catch (e) {
    // QuotaExceededError → 오래된 SchaleDB 캐시 삭제 후 재시도
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      evictOldestCache();
      try {
        localStorage.setItem(cacheKey, JSON.stringify(entry));
      } catch {
        // 그래도 실패하면 캐시 없이 진행
      }
    }
  }
}

function isExpired(timestamp: number): boolean {
  return Date.now() - timestamp > SCHALEDB_CACHE.TTL;
}

/** 가장 오래된 SchaleDB 캐시 항목을 삭제 */
function evictOldestCache(): void {
  let oldest: { key: string; timestamp: number } | null = null;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(SCHALEDB_CACHE.PREFIX)) continue;

    try {
      const entry = JSON.parse(localStorage.getItem(key)!) as CacheEntry<unknown>;
      if (!oldest || entry.timestamp < oldest.timestamp) {
        oldest = { key, timestamp: entry.timestamp };
      }
    } catch {
      // 파싱 실패한 항목 삭제
      localStorage.removeItem(key);
      return;
    }
  }

  if (oldest) localStorage.removeItem(oldest.key);
}
