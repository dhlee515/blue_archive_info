import type { NoteType } from '@/types/secretNote';
import type { NoteTypePlugin } from './types';
import { freePlugin } from './free';
import { rulesPlugin } from './rules';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPlugin = NoteTypePlugin<any>;

/**
 * 노트 타입 레지스트리.
 * 신규 타입 추가 시 아래 객체에 한 줄 등록하면 폼/뷰/목록이 자동으로 인식.
 *
 * `Partial` 로 둔 이유: 타입은 먼저 선언하고 플러그인은 나중 PR 에서 추가되는
 * 점진적 도입을 허용. 등록 누락은 `getPlugin` 런타임 체크로 방어.
 */
const REGISTRY: Partial<Record<NoteType, AnyPlugin>> = {
  free: freePlugin,
  rules: rulesPlugin,
};

export function getPlugin(type: NoteType): AnyPlugin {
  const plugin = REGISTRY[type];
  if (!plugin) throw new Error(`Unknown note type: ${type}`);
  return plugin;
}

export const ALL_PLUGINS: AnyPlugin[] = Object.values(REGISTRY).filter((p): p is AnyPlugin => Boolean(p));
