import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

/** 이벤트 계산기 페이지의 공통 레이아웃 래퍼 */
export default function EventCalcShell({ children }: Props) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {children}
    </div>
  );
}
