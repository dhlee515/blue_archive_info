import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { RulesData } from '@/types/secretNote';
import { RuleIcon } from '../RuleIcon';
import { COLOR_BG, COLOR_FG } from './colors';

interface Props {
  data: RulesData;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export default function RulesViewer({ data, title, updatedAt }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 행 번호는 섹션을 가로질러 누적된다
  let runningNum = 0;

  return (
    <div className="max-w-2xl mx-auto">
      {/* 헤더 */}
      <div className="mb-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          {data.tag ? (
            <span className="text-xs font-bold tracking-wider uppercase px-2.5 py-1 rounded bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              {data.tag}
            </span>
          ) : <span />}
          {data.version && (
            <span className="text-xs text-gray-400 dark:text-slate-500 font-medium tracking-wider">
              {data.version}
            </span>
          )}
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-blue-900 dark:text-blue-300 tracking-tight leading-tight">
          {data.heading || title}
        </h1>
        {data.subtitle && (
          <p className="mt-2 text-sm text-gray-500 dark:text-slate-400 leading-relaxed whitespace-pre-line">
            {data.subtitle}
          </p>
        )}
      </div>

      {/* 섹션들 */}
      {data.sections.map((section, sIdx) => (
        <div key={sIdx}>
          <div className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mt-7 mb-3">
            {section.label}
          </div>
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
            {section.items.length === 0 ? (
              <div className="px-4 py-4 text-xs text-gray-400 dark:text-slate-500 text-center">
                (내용 없음)
              </div>
            ) : section.items.map((item, iIdx) => {
              runningNum += 1;
              const num = runningNum;
              const key = `${sIdx}-${iIdx}`;
              const hasBody = Boolean(item.body?.trim());
              const isOpen = expanded.has(key);
              return (
                <div key={iIdx} className="border-b last:border-b-0 border-gray-100 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={hasBody ? () => toggle(key) : undefined}
                    disabled={!hasBody}
                    aria-expanded={hasBody ? isOpen : undefined}
                    className={`w-full text-left flex items-start gap-3.5 px-4 py-3.5 transition-colors ${
                      hasBody
                        ? 'cursor-pointer hover:bg-blue-50/30 dark:hover:bg-slate-700/50'
                        : 'cursor-default'
                    }`}
                  >
                    <div className={`w-8 h-8 min-w-8 rounded-lg flex items-center justify-center text-base ${COLOR_BG[item.color]} ${COLOR_FG[item.color]} mt-0.5`}>
                      <RuleIcon value={item.icon} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm md:text-base font-semibold text-gray-800 dark:text-slate-200 leading-snug">
                        {item.title}
                      </div>
                      {item.sub && (
                        <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 leading-relaxed whitespace-pre-line">
                          {item.sub}
                        </div>
                      )}
                    </div>
                    {hasBody && (
                      <ChevronDown
                        className={`w-4 h-4 text-gray-400 dark:text-slate-500 mt-1.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      />
                    )}
                    <div className="text-[11px] font-bold text-gray-400 dark:text-slate-500 pt-1 min-w-4.5 text-right tabular-nums">
                      {String(num).padStart(2, '0')}
                    </div>
                  </button>
                  {hasBody && isOpen && (
                    <div className="pl-15.5 pr-4 pb-4 text-sm text-gray-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                      {item.body}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* 배너 */}
      {data.banner && (
        <>
          <div className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mt-7 mb-3">
            중요 안내
          </div>
          <div className="flex items-start gap-3 bg-purple-50 dark:bg-purple-900/40 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
            <div className="text-2xl text-purple-700 dark:text-purple-300 shrink-0">
              <RuleIcon value={data.banner.icon} className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-bold text-purple-700 dark:text-purple-300">
                {data.banner.title}
              </div>
              <div className="text-xs text-gray-600 dark:text-slate-400 mt-1 leading-relaxed whitespace-pre-line">
                {data.banner.body}
              </div>
            </div>
          </div>
        </>
      )}

      {/* 푸터 */}
      {data.footer && (
        <div className="mt-7 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed whitespace-pre-line">
            {data.footer}
          </p>
        </div>
      )}

      {/* 메타 */}
      <div className="mt-6 text-xs text-gray-400 dark:text-slate-500 text-right">
        최종 수정 {new Date(updatedAt).toLocaleDateString('ko-KR')}
      </div>
    </div>
  );
}
