import type { NoteTypePlugin } from '../types';
import type { RulesData } from '@/types/secretNote';
import RulesEditor from './RulesEditor';
import RulesViewer from './RulesViewer';

const EMPTY: RulesData = { heading: '', sections: [] };

/** 규칙 공지 플러그인 — 섹션/행/배너/푸터 구조의 구조화 콘텐츠 */
export const rulesPlugin: NoteTypePlugin<RulesData> = {
  type: 'rules',
  label: '규칙 공지',
  createEmpty: () => structuredClone(EMPTY),
  deserialize: ({ structuredData }) => (structuredData as RulesData) ?? structuredClone(EMPTY),
  serialize: (data) => ({ content: '', structuredData: data }),
  Editor: RulesEditor,
  Viewer: RulesViewer,
  badge: {
    label: '규칙',
    className: 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
  },
};
