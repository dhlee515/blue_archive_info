import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { RuleIcon as RuleIconValue } from '@/types/secretNote';

interface Props {
  value: RuleIconValue;
  className?: string;
}

/**
 * emoji 또는 lucide-react 아이콘을 렌더합니다.
 * - `"📋"` → emoji (부모 font-size 상속)
 * - `"lucide:Shield"` → lucide 컴포넌트 (className 으로 크기 지정)
 */
export function RuleIcon({ value, className = '' }: Props) {
  if (value.startsWith('lucide:')) {
    const name = value.slice('lucide:'.length);
    const Icon = (LucideIcons as unknown as Record<string, LucideIcon | undefined>)[name];
    if (Icon) return <Icon className={className || 'w-4 h-4'} />;
    return <span className="text-xs text-red-500">?</span>;
  }
  return <span className={`leading-none ${className}`}>{value}</span>;
}
