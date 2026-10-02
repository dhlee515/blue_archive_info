// guides / secret_notes 의 content 컬럼 저장 포맷 — UTF-8 HTML 을 Base64 로 인코딩.

export function encodeContent(html: string): string {
  const bytes = new TextEncoder().encode(html);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** 디코딩 실패 시 (인코딩 이전에 저장된 평문 등) 원본 문자열을 그대로 반환. */
export function decodeContent(encoded: string): string {
  try {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return encoded;
  }
}
