import type { NoteTypePlugin } from '../types';
import FreeEditor from './FreeEditor';
import FreeViewer from './FreeViewer';

/** 자유 본문 플러그인 — 기존 비밀 노트의 기본 동작 */
export const freePlugin: NoteTypePlugin<string> = {
  type: 'free',
  label: '자유 본문',
  createEmpty: () => '',
  deserialize: ({ content }) => content,
  serialize: (html) => ({ content: html, structuredData: null }),
  Editor: FreeEditor,
  Viewer: FreeViewer,
  // free 타입에는 배지 없음 (기본 타입)
};
