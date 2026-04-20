import type { ComponentType } from 'react';
import type { NoteType } from '@/types/secretNote';

/** DB 저장 형태로 직렬화된 결과 */
export interface SerializedNote {
  content: string;                    // secret_notes.content (NOT NULL)
  structuredData: unknown | null;     // secret_notes.structured_data
}

/** 각 노트 타입이 구현해야 하는 플러그인 인터페이스 */
export interface NoteTypePlugin<TData = unknown> {
  type: NoteType;
  label: string;

  /** 새 노트 생성 시 초기값 */
  createEmpty: () => TData;

  /** DB row → in-memory 상태 */
  deserialize: (row: { content: string; structuredData: unknown | null }) => TData;

  /** in-memory 상태 → DB 저장 형태 */
  serialize: (data: TData) => SerializedNote;

  /** 편집 UI (controlled) */
  Editor: ComponentType<{ value: TData; onChange: (v: TData) => void }>;

  /** 공개 뷰 렌더 */
  Viewer: ComponentType<{ data: TData; title: string; createdAt: string; updatedAt: string }>;

  /** 목록/복구 페이지의 타입 배지 (선택) */
  badge?: { label: string; className: string };
}
