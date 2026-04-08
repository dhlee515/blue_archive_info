import type { CardRarity } from '@/types/event';

/** 등급별 색상 — 카드 풀과 그리드에서 공통 사용 */
export const RARITY_STYLES: Record<CardRarity, string> = {
  SSR: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700',
  SR: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200 border-purple-300 dark:border-purple-700',
  R: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700',
  N: 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 border-gray-300 dark:border-slate-600',
};
