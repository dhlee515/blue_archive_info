import { useState, useRef, useEffect } from 'react';
import type { RulesData, RuleSection, RuleItem, RuleColor, RuleBanner } from '@/types/secretNote';
import { RuleIcon } from '../RuleIcon';
import { ALL_COLORS, COLOR_BG, COLOR_FG } from './colors';
import { CURATED_LUCIDE_ICONS } from './icons';

interface Props {
  value: RulesData;
  onChange: (v: RulesData) => void;
}

export default function RulesEditor({ value, onChange }: Props) {
  const update = (patch: Partial<RulesData>) => onChange({ ...value, ...patch });

  // 섹션 조작
  const addSection = () => update({
    sections: [...value.sections, { label: '새 섹션', items: [] }],
  });
  const updateSection = (idx: number, patch: Partial<RuleSection>) => {
    const sections = [...value.sections];
    sections[idx] = { ...sections[idx], ...patch };
    update({ sections });
  };
  const removeSection = (idx: number) => {
    if (!confirm('이 섹션을 삭제할까요? 섹션 내 모든 행이 사라집니다.')) return;
    update({ sections: value.sections.filter((_, i) => i !== idx) });
  };
  const moveSection = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= value.sections.length) return;
    const sections = [...value.sections];
    [sections[idx], sections[target]] = [sections[target], sections[idx]];
    update({ sections });
  };

  // 행 조작
  const addItem = (sIdx: number) => {
    const sections = [...value.sections];
    sections[sIdx] = {
      ...sections[sIdx],
      items: [...sections[sIdx].items, { icon: '📌', color: 'blue', title: '', sub: '' }],
    };
    update({ sections });
  };
  const updateItem = (sIdx: number, iIdx: number, patch: Partial<RuleItem>) => {
    const sections = [...value.sections];
    const items = [...sections[sIdx].items];
    items[iIdx] = { ...items[iIdx], ...patch };
    sections[sIdx] = { ...sections[sIdx], items };
    update({ sections });
  };
  const removeItem = (sIdx: number, iIdx: number) => {
    const sections = [...value.sections];
    sections[sIdx] = {
      ...sections[sIdx],
      items: sections[sIdx].items.filter((_, i) => i !== iIdx),
    };
    update({ sections });
  };
  const moveItem = (sIdx: number, iIdx: number, dir: -1 | 1) => {
    const items = [...value.sections[sIdx].items];
    const target = iIdx + dir;
    if (target < 0 || target >= items.length) return;
    [items[iIdx], items[target]] = [items[target], items[iIdx]];
    const sections = [...value.sections];
    sections[sIdx] = { ...sections[sIdx], items };
    update({ sections });
  };

  // 배너
  const addBanner = () => update({ banner: { icon: '🔕', title: '', body: '' } });
  const updateBanner = (patch: Partial<RuleBanner>) => {
    if (!value.banner) return;
    update({ banner: { ...value.banner, ...patch } });
  };
  const removeBanner = () => update({ banner: undefined });

  // 푸터
  const addFooter = () => update({ footer: '' });
  const removeFooter = () => update({ footer: undefined });

  const inputCls = 'w-full p-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100 text-sm';
  const sectionCardCls = 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4';

  return (
    <div className="flex flex-col gap-4">
      {/* ── 메타 ── */}
      <div className={sectionCardCls}>
        <div className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-3">헤더</div>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder="태그 (예: 📋 Notice)"
              value={value.tag ?? ''}
              onChange={(e) => update({ tag: e.target.value })}
            />
            <input
              className={inputCls}
              placeholder="버전 (예: ver. 26.04.11)"
              value={value.version ?? ''}
              onChange={(e) => update({ version: e.target.value })}
            />
          </div>
          <input
            className={inputCls}
            placeholder="제목 (필수)"
            value={value.heading}
            onChange={(e) => update({ heading: e.target.value })}
          />
          <textarea
            className={inputCls}
            placeholder="부제 (선택)"
            rows={2}
            value={value.subtitle ?? ''}
            onChange={(e) => update({ subtitle: e.target.value })}
          />
        </div>
      </div>

      {/* ── 섹션 리스트 ── */}
      {value.sections.map((section, sIdx) => (
        <div key={sIdx} className={sectionCardCls}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">섹션 {sIdx + 1}</span>
            <div className="flex-1" />
            <button type="button" onClick={() => moveSection(sIdx, -1)} disabled={sIdx === 0} className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-slate-700 rounded disabled:opacity-30">↑</button>
            <button type="button" onClick={() => moveSection(sIdx, 1)} disabled={sIdx === value.sections.length - 1} className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-slate-700 rounded disabled:opacity-30">↓</button>
            <button type="button" onClick={() => removeSection(sIdx)} className="px-2 py-0.5 text-xs bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded">섹션 삭제</button>
          </div>

          <input
            className={`${inputCls} font-bold mb-3`}
            placeholder="섹션 라벨 (예: 기본 규칙)"
            value={section.label}
            onChange={(e) => updateSection(sIdx, { label: e.target.value })}
          />

          <div className="flex flex-col gap-2">
            {section.items.map((item, iIdx) => (
              <div key={iIdx} className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-2 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <IconPicker value={item.icon} onChange={(icon) => updateItem(sIdx, iIdx, { icon })} />
                  <ColorPicker value={item.color} onChange={(color) => updateItem(sIdx, iIdx, { color })} />
                  <div className="flex-1" />
                  <button type="button" onClick={() => moveItem(sIdx, iIdx, -1)} disabled={iIdx === 0} className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-slate-700 rounded disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => moveItem(sIdx, iIdx, 1)} disabled={iIdx === section.items.length - 1} className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-slate-700 rounded disabled:opacity-30">↓</button>
                  <button type="button" onClick={() => removeItem(sIdx, iIdx)} className="px-1.5 py-0.5 text-xs bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded">삭제</button>
                </div>
                <input
                  className={inputCls}
                  placeholder="행 제목"
                  value={item.title}
                  onChange={(e) => updateItem(sIdx, iIdx, { title: e.target.value })}
                />
                <input
                  className={inputCls}
                  placeholder="부제 (선택)"
                  value={item.sub ?? ''}
                  onChange={(e) => updateItem(sIdx, iIdx, { sub: e.target.value })}
                />
                <textarea
                  className={`${inputCls} resize-y`}
                  placeholder="본문 (선택) — 공개 뷰에서 행을 클릭하면 펼쳐집니다"
                  rows={6}
                  value={item.body ?? ''}
                  onChange={(e) => updateItem(sIdx, iIdx, { body: e.target.value })}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => addItem(sIdx)}
              className="px-3 py-1.5 text-xs font-medium bg-indigo-50 dark:bg-indigo-900/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-lg"
            >
              + 행 추가
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addSection}
        className="px-3 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
      >
        + 섹션 추가
      </button>

      {/* ── 배너 ── */}
      {value.banner ? (
        <div className={sectionCardCls}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">배너</span>
            <div className="flex-1" />
            <button type="button" onClick={removeBanner} className="px-2 py-0.5 text-xs bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded">배너 제거</button>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <IconPicker value={value.banner.icon} onChange={(icon) => updateBanner({ icon })} />
            <input
              className={`${inputCls} font-bold`}
              placeholder="배너 제목"
              value={value.banner.title}
              onChange={(e) => updateBanner({ title: e.target.value })}
            />
          </div>
          <textarea
            className={inputCls}
            placeholder="배너 내용"
            rows={2}
            value={value.banner.body}
            onChange={(e) => updateBanner({ body: e.target.value })}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={addBanner}
          className="px-3 py-2 text-sm font-medium bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-lg"
        >
          + 배너 추가
        </button>
      )}

      {/* ── 푸터 ── */}
      {value.footer !== undefined ? (
        <div className={sectionCardCls}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">푸터</span>
            <div className="flex-1" />
            <button type="button" onClick={removeFooter} className="px-2 py-0.5 text-xs bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded">푸터 제거</button>
          </div>
          <textarea
            className={inputCls}
            placeholder="푸터 내용 (예: ⚠️ 경고 횟수와 무관하게 죄질이 심한 경우 즉시 강퇴될 수 있습니다.)"
            rows={2}
            value={value.footer}
            onChange={(e) => update({ footer: e.target.value })}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={addFooter}
          className="px-3 py-2 text-sm font-medium bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-lg"
        >
          + 푸터 추가
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────────  SUBCOMPONENTS  ───────────────────────────── */

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'emoji' | 'lucide'>(value.startsWith('lucide:') ? 'lucide' : 'emoji');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-9 min-w-9 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-slate-600 text-base"
      >
        <RuleIcon value={value} />
      </button>
      {open && (
        <div className="absolute z-20 top-10 left-0 w-72 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-3 shadow-lg">
          <div className="flex gap-1 mb-2">
            <button
              type="button"
              onClick={() => setMode('emoji')}
              className={`flex-1 px-2 py-1 text-xs font-medium rounded ${mode === 'emoji' ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400'}`}
            >
              Emoji
            </button>
            <button
              type="button"
              onClick={() => setMode('lucide')}
              className={`flex-1 px-2 py-1 text-xs font-medium rounded ${mode === 'lucide' ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400'}`}
            >
              Lucide
            </button>
          </div>
          {mode === 'emoji' ? (
            <input
              type="text"
              autoFocus
              maxLength={4}
              value={value.startsWith('lucide:') ? '' : value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="이모지 입력"
              className="w-full p-2 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 dark:text-slate-100 text-sm"
            />
          ) : (
            <div className="grid grid-cols-6 gap-1 max-h-48 overflow-y-auto">
              {CURATED_LUCIDE_ICONS.map((name) => {
                const val = `lucide:${name}`;
                const selected = value === val;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => { onChange(val); setOpen(false); }}
                    title={name}
                    className={`w-9 h-9 rounded flex items-center justify-center transition-colors ${selected ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300'}`}
                  >
                    <RuleIcon value={val} className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: RuleColor; onChange: (v: RuleColor) => void }) {
  return (
    <div className="flex gap-0.5">
      {ALL_COLORS.map((c) => {
        const selected = value === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            title={c}
            className={`w-6 h-6 rounded-md border-2 flex items-center justify-center ${COLOR_BG[c]} ${COLOR_FG[c]} ${selected ? 'border-gray-800 dark:border-slate-100' : 'border-transparent'}`}
          >
            <span className="text-[10px] font-bold">●</span>
          </button>
        );
      })}
    </div>
  );
}
