// 도메인 타입 정의 - 비밀 노트 (admin 전용, URL 공유용)

/** 노트 타입 — 플러그인 레지스트리의 키 */
export type NoteType = 'free' | 'rules';

/** 행별 아이콘 색 팔레트 */
export type RuleColor = 'red' | 'yellow' | 'green' | 'purple' | 'blue' | 'orange' | 'gray';

/**
 * 아이콘 값
 * - emoji  : "📋"
 * - lucide : "lucide:Shield"  (PascalCase 이름)
 */
export type RuleIcon = string;

/** 규칙 행 하나 */
export interface RuleItem {
  icon: RuleIcon;
  color: RuleColor;
  title: string;
  sub?: string;
  body?: string;      // 선택. 공개 뷰에서 행 클릭 시 펼쳐지는 plain text 본문
}

/** 규칙 섹션 */
export interface RuleSection {
  label: string;
  items: RuleItem[];
}

/** 배너 (선택) */
export interface RuleBanner {
  icon: RuleIcon;
  title: string;
  body: string;
}

/** 규칙 공지 전체 구조 — rules 플러그인의 data 타입 */
export interface RulesData {
  tag?: string;
  version?: string;
  heading: string;
  subtitle?: string;
  sections: RuleSection[];
  banner?: RuleBanner;
  footer?: string;
}

/** 비밀 노트 */
export interface SecretNote {
  id: string;
  slug: string;
  title: string;
  noteType: NoteType;
  content: string;                   // free 전용 (decoded HTML)
  structuredData: unknown | null;    // 구조화 타입 전용 (플러그인이 deserialize)
  authorId?: string;                 // anon 조회(RPC) 시 undefined
  createdAt: string;
  updatedAt: string;
}

/** 비밀 노트 작성/수정 폼 데이터 — 플러그인이 자체 타입을 책임 */
export interface SecretNoteFormData {
  title: string;
  noteType: NoteType;
  pluginData: unknown;               // 선택된 플러그인의 in-memory 상태
  customSlug?: string;
}
