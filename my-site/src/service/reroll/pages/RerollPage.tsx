import { useState, useEffect, useRef, useCallback } from 'react';
import { domToPng } from 'modern-screenshot';
import { StudentRepository } from '@/repositories/studentRepository';
import type { Student } from '@/types/student';
import type { RerollCategory } from '@/types/reroll';
import RerollCategoryRow from '../components/RerollCategoryRow';
import rerollData from '@/data/reroll.json';
import studentAliases from '@/data/studentAliases.json';

export default function RerollPage() {
  const [students, setStudents] = useState<Map<number, Student>>(new Map());
  const [nameToId, setNameToId] = useState<Map<string, number>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [inputText, setInputText] = useState('');
  const [pyroxene, setPyroxene] = useState('');
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  // 표에 있는 모든 schaleId 수집
  const allRerollIds = new Set(
    (rerollData as RerollCategory[]).flatMap((cat) => cat.students.map((s) => s.schaleId)),
  );

  useEffect(() => {
    StudentRepository.getStudents().then((list) => {
      const idMap = new Map<number, Student>();
      const nMap = new Map<string, number>();
      for (const s of list) {
        idMap.set(s.schaleId, s);
        // 표에 있는 학생만 이름 매핑
        if (allRerollIds.has(s.schaleId)) {
          nMap.set(s.name, s.schaleId);
        }
      }
      setStudents(idMap);
      setNameToId(nMap);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggle = useCallback((schaleId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(schaleId)) next.delete(schaleId);
      else next.add(schaleId);
      return next;
    });
  }, []);

  // studentAliases.json에서 이름/별명 → schaleId 매핑 빌드
  const aliasMap = new Map<string, number>();
  for (const [id, names] of Object.entries(studentAliases as Record<string, string[]>)) {
    const schaleId = Number(id);
    for (const name of names) {
      aliasMap.set(name, schaleId);
    }
  }

  /** 텍스트 입력으로 학생 선택 반영 */
  const handleApplyInput = () => {
    if (!inputText.trim()) return;
    const names = inputText.split(/[,+]/).map((n) => n.trim()).filter(Boolean);
    const newSelected = new Set(selectedIds);
    for (const name of names) {
      // 1. 별명 매칭
      const aliasId = aliasMap.get(name);
      if (aliasId) {
        newSelected.add(aliasId);
        continue;
      }
      // 2. 정확히 일치
      const id = nameToId.get(name);
      if (id) {
        newSelected.add(id);
        continue;
      }
      // 3. 부분 일치 (하나만 매치될 경우)
      const matches: number[] = [];
      for (const [n, sid] of nameToId) {
        if (n.includes(name)) matches.push(sid);
      }
      if (matches.length === 1) newSelected.add(matches[0]);
    }
    setSelectedIds(newSelected);
    setInputText('');
  };

  const handleReset = () => {
    setSelectedIds(new Set());
    setInputText('');
    setPyroxene('');
    setPrice('');
  };

  const handleDownload = async () => {
    if (!captureRef.current || capturing) return;
    setCapturing(true);

    // 캡처 시 잘림 방지: 원본 스타일 임시 변경
    const container = captureRef.current;
    const wrapper = container.parentElement!;
    const origWrapperStyle = wrapper.style.cssText;
    const origContainerStyle = container.style.cssText;

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

      const today = new Date().toISOString().slice(0, 10);
      const link = document.createElement('a');
      link.download = `리세계_추천_${today}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('이미지 캡처 실패:', err);
    } finally {
      wrapper.style.cssText = origWrapperStyle;
      container.style.cssText = origContainerStyle;
      rows.forEach((row, i) => {
        row.style.cssText = origRowStyles[i];
      });
      setCapturing(false);
    }
  };

  const categories = rerollData as RerollCategory[];

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
            학생을 클릭하거나 이름을 입력하여 선택한 뒤, 이미지로 저장할 수 있습니다.
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

      {/* 보유 학생 입력 */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleApplyInput()}
          placeholder="보유 캐릭터를 + 로 구분하여 입력 (예: 미카+호시노+히나)"
          className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleApplyInput}
          className="shrink-0 px-4 py-2 text-sm font-medium bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
        >
          반영하기
        </button>
        <button
          onClick={handleReset}
          className="shrink-0 px-4 py-2 text-sm font-medium bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
        >
          초기화
        </button>
      </div>

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

        {/* 청휘석 & 가격 입력 (캡처에 포함) */}
        <div className="mt-4 pt-3 border-t border-gray-200 dark:border-slate-700 flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-blue-500 dark:text-blue-400">💎 청휘석 :</span>
            <input
              type="text"
              value={pyroxene}
              onChange={(e) => setPyroxene(e.target.value)}
              placeholder="예: 4350"
              className="w-32 px-2 py-1 text-sm border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-yellow-500 dark:text-yellow-400">🎫 가격 :</span>
            <input
              type="text"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="예: 410,000"
              className="w-32 px-2 py-1 text-sm border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
