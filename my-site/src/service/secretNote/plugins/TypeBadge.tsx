import type { NoteType } from '@/types/secretNote';
import { getPlugin } from './registry';

interface Props {
  noteType: NoteType;
}

/** 노트 타입 배지. 해당 플러그인에 `badge` 가 정의된 경우에만 렌더. */
export function TypeBadge({ noteType }: Props) {
  const plugin = getPlugin(noteType);
  if (!plugin.badge) return null;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap shrink-0 ${plugin.badge.className}`}>
      {plugin.badge.label}
    </span>
  );
}
