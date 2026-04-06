import { useState, useEffect, useRef, useCallback } from 'react';
import { domToPng } from 'modern-screenshot';
import { StudentRepository } from '@/repositories/studentRepository';
import type { Student } from '@/types/student';
import type { RerollCategory } from '@/types/reroll';
import RerollCategoryRow from '../components/RerollCategoryRow';
import rerollData from '@/data/reroll.json';

export default function RerollPage() {
  const [students, setStudents] = useState<Map<number, Student>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    StudentRepository.getStudents().then((list) => {
      const map = new Map<number, Student>();
      for (const s of list) map.set(s.schaleId, s);
      setStudents(map);
      setLoading(false);
    });
  }, []);

  const handleToggle = useCallback((schaleId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(schaleId)) next.delete(schaleId);
      else next.add(schaleId);
      return next;
    });
  }, []);

  const handleDownload = async () => {
    if (!captureRef.current || capturing) return;
    setCapturing(true);

    // 캡처 시 잘림 방지: 원본 스타일 임시 변경
    const container = captureRef.current;
    const wrapper = container.parentElement!;
    const origWrapperStyle = wrapper.style.cssText;
    const origContainerStyle = container.style.cssText;

    // 부모를 overflow hidden으로 설정하여 화면에서는 확장이 보이지 않도록 함
    wrapper.style.overflow = 'hidden';
    container.style.width = 'max-content';
    container.style.maxWidth = 'none';

    const rows = container.querySelectorAll<HTMLElement>('.reroll-row');
    const origRowStyles: string[] = [];
    rows.forEach((row) => {
      origRowStyles.push(row.style.cssText);
      row.style.overflow = 'visible';
      row.style.flexWrap = 'nowrap';
    });

    try {
      const dataUrl = await domToPng(container, {
        scale: 2,
        quality: 1,
        fetchFn: async (url) => {
          try {
            const res = await fetch(url);
            const blob = await res.blob();
            return await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch {
            return false;
          }
        },
      });

      // 다운로드 트리거
      const today = new Date().toISOString().slice(0, 10);
      const link = document.createElement('a');
      link.download = `리세계_추천_${today}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('이미지 캡처 실패:', err);
    } finally {
      // 스타일 원복
      wrapper.style.cssText = origWrapperStyle;
      container.style.cssText = origContainerStyle;
      rows.forEach((row, i) => {
        row.style.cssText = origRowStyles[i];
      });
      setCapturing(false);
    }
  };

  const categories = rerollData as RerollCategory[];

  // reroll 데이터와 학생 데이터 조인
  const resolvedCategories = categories.map((cat) => ({
    ...cat,
    students: cat.students
      .map((rs) => {
        const student = students.get(rs.schaleId);
        return student ? { ...rs, student } : null;
      })
      .filter((s): s is NonNullable<typeof s> => s !== null),
  }));

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-400 dark:text-slate-500">
        로딩 중...
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-slate-100">
            리세계 추천 학생
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            학생을 클릭하여 선택한 뒤, 이미지로 저장할 수 있습니다.
          </p>
        </div>
        <button
          onClick={handleDownload}
          disabled={capturing}
          className="shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {capturing ? '저장 중...' : '이미지 저장'}
        </button>
      </div>

      {/* 선택 초기화 */}
      {selectedIds.size > 0 && (
        <button
          onClick={() => setSelectedIds(new Set())}
          className="mb-3 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors"
        >
          선택 초기화 ({selectedIds.size}명 선택됨)
        </button>
      )}

      {/* 캡처 대상 영역 */}
      <div
        ref={captureRef}
        className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4"
      >
        {/* 캡처 이미지 제목 */}
        <div className="text-center mb-4 pb-3 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-gray-800 dark:text-slate-200">
            리세계 추천 학생
          </h2>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
            빨간 테두리 = 최우선 추천
          </p>
        </div>

        {/* 추천도 방향 표시 */}
        <div className="flex items-center gap-2 mb-3 md:pl-32">
          <span className="text-xs font-medium text-blue-600 dark:text-blue-400">추천도 높음</span>
          <div className="flex-1 h-px bg-linear-to-r from-blue-400 to-transparent dark:from-blue-500" />
          <svg className="w-3 h-3 text-gray-300 dark:text-slate-600 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </div>

        {resolvedCategories.map((cat) => (
          <RerollCategoryRow
            key={cat.key}
            label={cat.label}
            students={cat.students}
            selectedIds={selectedIds}
            onToggle={handleToggle}
          />
        ))}

        {resolvedCategories.every((c) => c.students.length === 0) && (
          <p className="text-center py-8 text-gray-400 dark:text-slate-500">
            추천 학생 데이터가 없습니다.
          </p>
        )}
      </div>
    </div>
  );
}
