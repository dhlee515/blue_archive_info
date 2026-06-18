// rules 노트의 행 본문(body) 정규화 helper.
//
// 기존 노트는 plain text body, 신규 (이미지/링크 지원 후) 는 HTML body 가 섞임.
// Viewer 와 Editor 가 같은 정책으로 변환해야 일관성 유지.

import DOMPurify from 'dompurify';

/**
 * 진짜 HTML 태그 패턴.
 *
 * 단순히 `<` 만 검사하면 plain text 의 "값 < 10", "용어 설명: <과제>" 같은 텍스트가
 * HTML 으로 오인되어 잘림. 진짜 태그 (`<a>`, `<br>`, `<img src=...>`) 만 매칭.
 */
const HTML_TAG = /<[a-zA-Z][^>]*>/;

export function isHtmlBody(body: string): boolean {
  return HTML_TAG.test(body);
}

/** plain text 를 HTML 으로 안전 변환 — escape + 줄바꿈 → <br>. */
function plainTextToHtml(body: string): string {
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/\n/g, '<br>');
}

/**
 * Editor 진입 시 RichTextEditor.content 로 줄 정규화.
 *  - 이미 HTML → 그대로
 *  - plain text → escape + br
 * Sanitize 는 editor 가 추가 처리 (또는 저장 시점) — 여기선 변환만.
 */
export function bodyForEditor(body: string | undefined): string {
  if (!body) return '';
  if (isHtmlBody(body)) return body;
  return plainTextToHtml(body);
}

/**
 * Viewer 의 dangerouslySetInnerHTML 직전 호출. 항상 sanitize 결과 반환.
 *  - HTML → DOMPurify
 *  - plain text → escape + br (XSS 무관, 자동 안전)
 */
export function bodyToSafeHtml(body: string): string {
  if (isHtmlBody(body)) {
    return DOMPurify.sanitize(body);
  }
  return plainTextToHtml(body);
}
