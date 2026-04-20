/**
 * 규칙 공지 에디터에서 선택 가능한 lucide-react 아이콘 큐레이션 리스트.
 * 전체 lucide 는 수천 개라 공지/규칙 맥락에 자주 쓰이는 것만 추렸다.
 * 사용 시 저장 문자열 형식: `"lucide:Shield"`
 */
export const CURATED_LUCIDE_ICONS = [
  // 경고 / 금지 / 안내
  'Shield', 'ShieldAlert', 'ShieldCheck', 'AlertTriangle', 'AlertCircle', 'AlertOctagon',
  'Ban', 'XCircle', 'CheckCircle', 'Info', 'HelpCircle',
  // 사용자 / 권한
  'Users', 'User', 'UserX', 'UserCheck', 'UserPlus', 'UserMinus',
  // 보안 / 공개 범위
  'Lock', 'Unlock', 'Eye', 'EyeOff', 'Key',
  // 커뮤니케이션
  'MessageSquare', 'MessageSquareOff', 'Megaphone', 'Bell', 'BellOff', 'Flag',
  // 미디어
  'Image', 'Camera', 'Video', 'Film', 'Mic', 'MicOff', 'Volume2', 'VolumeX',
  // 링크 / 파일
  'Link', 'Link2Off', 'ExternalLink', 'FileText', 'File', 'FolderOpen', 'Paperclip',
  // 거래 / 상업
  'DollarSign', 'Coins', 'CreditCard', 'ShoppingCart', 'Gift',
  // 평가
  'Heart', 'Star', 'Award', 'ThumbsUp', 'ThumbsDown', 'Sparkles',
  // 일정 / 장소
  'Calendar', 'Clock', 'MapPin', 'Bookmark',
  // 게임 / 블아 관련
  'Gamepad2', 'Dice5', 'Swords', 'Target', 'Trophy', 'Crown', 'Zap',
  // 기타
  'Skull', 'Scissors', 'Settings', 'Search', 'Filter',
] as const;

export type CuratedLucideIcon = typeof CURATED_LUCIDE_ICONS[number];
