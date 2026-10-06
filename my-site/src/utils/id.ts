// 클라이언트 측 고유 id 생성

/**
 * `crypto.randomUUID` 가 있으면 사용, 없으면 대체 id.
 * randomUUID 는 보안 컨텍스트 (https / localhost) 에서만 제공되므로,
 * 휴대폰에서 LAN IP (http://192.168.x.x) 로 dev 서버에 접속하면 없다.
 */
export const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
