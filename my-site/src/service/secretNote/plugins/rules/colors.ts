import type { RuleColor } from '@/types/secretNote';

/**
 * 아이콘 박스 배경색 맵 (Tailwind JIT 대응 — 동적 문자열 합성 금지)
 */
export const COLOR_BG: Record<RuleColor, string> = {
  red:    'bg-red-50 dark:bg-red-900/40',
  yellow: 'bg-yellow-50 dark:bg-yellow-900/40',
  green:  'bg-green-50 dark:bg-green-900/40',
  purple: 'bg-purple-50 dark:bg-purple-900/40',
  blue:   'bg-blue-50 dark:bg-blue-900/40',
  orange: 'bg-orange-50 dark:bg-orange-900/40',
  gray:   'bg-gray-100 dark:bg-slate-700',
};

export const COLOR_FG: Record<RuleColor, string> = {
  red:    'text-red-600 dark:text-red-400',
  yellow: 'text-yellow-700 dark:text-yellow-300',
  green:  'text-green-600 dark:text-green-400',
  purple: 'text-purple-700 dark:text-purple-300',
  blue:   'text-blue-700 dark:text-blue-300',
  orange: 'text-orange-600 dark:text-orange-400',
  gray:   'text-gray-600 dark:text-slate-400',
};

export const ALL_COLORS: RuleColor[] = ['red', 'yellow', 'green', 'purple', 'blue', 'orange', 'gray'];
