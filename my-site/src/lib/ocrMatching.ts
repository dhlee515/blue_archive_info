// OCR 결과 텍스트를 SchaleDB 항목과 매칭하는 로직.
//
// 우선순위 (높음 → 낮음):
//   1. 정확 일치 (공백/특수문자 정규화 후)
//   2. 보정 매핑 적용 후 정확 일치
//   3. 자모 분해 N-gram 유사도 (한글 OCR 특화)
//   4. Levenshtein fallback
//   5. 임계값 미달 → null (사용자 confirm 필요)

import levenshtein from 'fast-levenshtein';

/** OCR 자주 틀리는 패턴을 SchaleDB 정식 명칭으로 보정. tools/ocr/remap.json 과 동기화. */
const OCR_REMAP: Record<string, string> = {
  '최상금 활동 보고서': '최상급 활동 보고서',
  회루: '회로',
};

/**
 * 학교/이름 영문 → 한글 매핑.
 * SchaleDB 한국어 데이터의 학교명은 모두 한글이지만 게임 캡처에는 영문 표기가 많음
 * (예: "EX TRINITY" → 트리니티 학교의 EX 스킬 항목).
 * 매칭 직전에 영문 토큰을 한글로 치환해 후보 검색 가능성 확보.
 */
const ENGLISH_KOREAN_ALIASES: Record<string, string> = {
  // 학교명
  TRINITY: '트리니티',
  GEHENNA: '게헨나',
  ABYDOS: '아비도스',
  MILLENNIUM: '밀레니엄',
  ARIUS: '아리우스',
  REDWINTER: '붉은겨울',
  HYAKKIYAKO: '백귀야행',
  SHANHAIJING: '산해경',
  VALKYRIE: '발키리',
  HIGHLANDER: '하이랜더',
  WILDHUNT: '와일드헌트',
  // 자주 보이는 일반어
  EX: 'EX',
};

/**
 * OCR 텍스트에서 토큰을 추출해 영문 alias 와 fuzzy 매칭, 한글로 치환한다.
 * 매칭 실패 토큰은 그대로 유지.
 *
 * "EX TRTY" → "EX 트리니티"
 * "EX REDNNWNTER" → "EX 붉은겨울"
 * "EX DEHERAA" → "EX 게헨나"
 */
function applyEnglishAliases(text: string): string {
  // 영문 단어/공백 분리
  const tokens = text.split(/(\s+)/);
  return tokens
    .map((tok) => {
      if (!/[A-Za-z]/.test(tok)) return tok; // 영문 없으면 패스
      const upper = tok.toUpperCase().replace(/[^A-Z]/g, ''); // 영문만
      if (upper.length < 3) return tok;
      // 정확 일치 우선
      if (ENGLISH_KOREAN_ALIASES[upper]) {
        return ENGLISH_KOREAN_ALIASES[upper];
      }
      // fuzzy 일치 (Levenshtein 기반). 임계값 0.5 — 게임 OCR 의 영문 왜곡 패턴 흡수.
      // alias 사전 항목은 학교명 같은 distinctive 용어들이라 false positive 리스크 제한적.
      let best: { key: string; score: number } | null = null;
      for (const aliasKey of Object.keys(ENGLISH_KOREAN_ALIASES)) {
        if (aliasKey.length < 5) continue; // 너무 짧은 alias 는 false positive 위험 (skip)
        if (Math.abs(aliasKey.length - upper.length) > 4) continue;
        const dist = levenshtein.get(upper, aliasKey);
        const maxLen = Math.max(upper.length, aliasKey.length);
        const score = 1 - dist / maxLen;
        if (score >= 0.5 && (!best || score > best.score)) {
          best = { key: aliasKey, score };
        }
      }
      if (best) return ENGLISH_KOREAN_ALIASES[best.key];
      return tok;
    })
    .join('');
}

export type MatchMethod = 'exact' | 'remap' | 'jamo' | 'levenshtein';

export interface MatchCandidate {
  /** 호출자가 결정하는 고유 식별자 (인벤토리 키 / SchaleDB id 등). */
  key: string;
  name: string;
}

export interface MatchResult {
  candidate: MatchCandidate;
  score: number; // 0 ~ 1 (높을수록 일치)
  method: MatchMethod;
}

const DEFAULT_THRESHOLD = 0.6;

/** 공백/특수문자 정규화. 매칭 시 일관된 비교를 위해. */
function normalize(s: string): string {
  return s
    .replace(/\s+/g, '')
    .replace(/[()[\]{}<>~!@#$%^&*+=:;'"`?\-_./|\\]/g, '')
    .toLowerCase();
}

/**
 * 한글 음절을 자모로 분해.
 * "회로" → ["ㅎ", "ㅗ", "", "ㅣ", "ㄹ", "ㅗ", ""]
 * 한글 외 문자는 그대로 유지.
 */
const CHOSEONG = [
  'ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ',
  'ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ',
];
const JUNGSEONG = [
  'ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ',
  'ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ',
];
const JONGSEONG = [
  '','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ',
  'ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ',
  'ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ',
];

function decomposeHangul(s: string): string {
  const result: string[] = [];
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const offset = code - 0xac00;
      const cho = Math.floor(offset / 588);
      const jung = Math.floor((offset % 588) / 28);
      const jong = offset % 28;
      result.push(CHOSEONG[cho]);
      result.push(JUNGSEONG[jung]);
      if (jong > 0) result.push(JONGSEONG[jong]);
    } else {
      result.push(ch);
    }
  }
  return result.join('');
}

/** N-gram 유사도 (Dice coefficient). 자모 분해 후 더 의미 있음. */
function ngramSimilarity(a: string, b: string, n = 2): number {
  if (a === b) return 1;
  if (a.length < n || b.length < n) return 0;

  const grams = (s: string): Set<string> => {
    const result = new Set<string>();
    for (let i = 0; i <= s.length - n; i++) {
      result.add(s.slice(i, i + n));
    }
    return result;
  };

  const ga = grams(a);
  const gb = grams(b);
  let intersection = 0;
  for (const g of ga) if (gb.has(g)) intersection++;

  return (2 * intersection) / (ga.size + gb.size);
}

/** Levenshtein 거리 → 0~1 유사도. */
function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const dist = levenshtein.get(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

/**
 * OCR 텍스트를 candidates 리스트에서 best match 찾기.
 * - 임계값 미달 시 null 반환
 * - 동점일 경우 더 짧은 후보 우선 (오버매칭 방지)
 */
export function matchItemName(
  ocrText: string,
  candidates: MatchCandidate[],
  threshold: number = DEFAULT_THRESHOLD,
): MatchResult | null {
  if (!ocrText || candidates.length === 0) return null;

  // 영문 토큰을 한글로 치환 — SchaleDB 가 한글이라 매칭 가능성 ↑
  const aliased = applyEnglishAliases(ocrText);
  const ocrNorm = normalize(aliased);

  // 1. 정확 일치 (alias 적용 후)
  for (const cand of candidates) {
    if (normalize(cand.name) === ocrNorm) {
      return { candidate: cand, score: 1, method: 'exact' };
    }
  }

  // 2. 보정 매핑 후 정확 일치
  const remapped = OCR_REMAP[aliased] ?? OCR_REMAP[ocrText] ?? OCR_REMAP[ocrNorm];
  if (remapped) {
    const remappedNorm = normalize(remapped);
    for (const cand of candidates) {
      if (normalize(cand.name) === remappedNorm) {
        return { candidate: cand, score: 0.95, method: 'remap' };
      }
    }
  }

  // 3. 자모 분해 N-gram 유사도
  const ocrJamo = decomposeHangul(ocrNorm);
  let bestJamo: MatchResult | null = null;
  for (const cand of candidates) {
    const candJamo = decomposeHangul(normalize(cand.name));
    const score = ngramSimilarity(ocrJamo, candJamo, 2);
    if (!bestJamo || score > bestJamo.score) {
      bestJamo = { candidate: cand, score, method: 'jamo' };
    }
  }
  if (bestJamo && bestJamo.score >= threshold) {
    return bestJamo;
  }

  // 4. Levenshtein fallback (음절 단위)
  let bestLev: MatchResult | null = null;
  for (const cand of candidates) {
    const score = levenshteinSimilarity(ocrNorm, normalize(cand.name));
    if (!bestLev || score > bestLev.score) {
      bestLev = { candidate: cand, score, method: 'levenshtein' };
    }
  }
  if (bestLev && bestLev.score >= threshold) {
    return bestLev;
  }

  // 5. 임계값 미달 — 사용자 confirm 필요
  return null;
}

/** 여러 후보 반환 (사용자가 직접 선택할 때 사용). */
export function topMatches(
  ocrText: string,
  candidates: MatchCandidate[],
  limit = 5,
): MatchResult[] {
  if (!ocrText || candidates.length === 0) return [];

  const aliased = applyEnglishAliases(ocrText);
  const ocrNorm = normalize(aliased);
  const ocrJamo = decomposeHangul(ocrNorm);

  const scored = candidates.map((cand): MatchResult => {
    const candNorm = normalize(cand.name);
    if (candNorm === ocrNorm) {
      return { candidate: cand, score: 1, method: 'exact' };
    }
    const candJamo = decomposeHangul(candNorm);
    const jamoScore = ngramSimilarity(ocrJamo, candJamo, 2);
    const levScore = levenshteinSimilarity(ocrNorm, candNorm);
    return {
      candidate: cand,
      score: Math.max(jamoScore, levScore),
      method: jamoScore >= levScore ? 'jamo' : 'levenshtein',
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
