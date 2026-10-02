import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchSchaleDB } from '@/lib/schaledbCache';
import { isReleasedInGlobal } from '@/lib/schaledb';
import { giftReactionIconUrl, itemIconUrl, studentIconUrl } from '@/lib/schaledbImage';
import type { SchaleDBItemMap, SchaleDBStudentMap } from '@/types/schaledb';
import NumberInput from '@/components/form/NumberInput';
import StudentPickerModal from '@/components/student/StudentPickerModal';
import { getFavorChoiceBoxes, getFavorItems } from '@/service/planner/utils/cultivationCalculator/bondGifts';
import { loadCommonFavorTags } from '@/service/planner/utils/plannerGameData';
import { BOND_MAX_LEVEL } from '@/service/planner/utils/tables/bondExp';
import {
  buildGiftTable,
  choiceBoxValue,
  clampProgress,
  holdingsExp,
  maxBondFromExp,
  rankSpan,
  requiredBondExp,
  suggestShortfall,
  type GiftRow,
} from '../utils/bondCalc';

function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR');
}

type GiftSectionKey = 'SSR' | 'SR';

const GIFT_SECTIONS: { key: GiftSectionKey; title: string }[] = [
  { key: 'SSR', title: '고급 선물' },
  { key: 'SR', title: '일반 선물' },
];

const hideOnError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.visibility = 'hidden';
};

export default function BondCalcPage() {
  const [students, setStudents] = useState<SchaleDBStudentMap>({});
  const [items, setItems] = useState<SchaleDBItemMap>({});
  const [commonTags, setCommonTags] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [studentId, setStudentId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [current, setCurrent] = useState(1);
  // 현재 랭크 구간 안에서 쌓은 EXP (누적 아님)
  const [progress, setProgress] = useState(0);
  const [target, setTarget] = useState(BOND_MAX_LEVEL);
  // 보유 선물 / 상자 — 아이템 id → 수량. 학생을 바꿔도 유지 (같은 인벤토리로 비교)
  const [counts, setCounts] = useState<Record<string, number>>({});
  // 섹션별 ×2 · ×1 선물 펼침 여부
  const [expanded, setExpanded] = useState<Record<GiftSectionKey, boolean>>({ SSR: false, SR: false });
  // 모바일 하단 요약 바 — 결과 카드가 화면에 보이면 숨김
  const resultRef = useRef<HTMLDivElement>(null);
  const [resultVisible, setResultVisible] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [s, i, tags] = await Promise.all([
          fetchSchaleDB<SchaleDBStudentMap>('students'),
          fetchSchaleDB<SchaleDBItemMap>('items'),
          loadCommonFavorTags(),
        ]);
        if (!mounted) return;
        setStudents(s);
        setItems(i);
        setCommonTags(tags);
      } catch (e) {
        console.error(e);
        if (mounted) setError('게임 데이터를 불러오지 못했습니다.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const el = resultRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setResultVisible(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading]);

  // NumberInput 은 max 변경 시 값을 재보정하지 않으므로 현재 랭크 변경 시 여기서 맞춘다.
  const handleCurrentChange = (n: number) => {
    setCurrent(n);
    setProgress((p) => clampProgress(n, p));
    setTarget((t) => Math.max(t, n));
  };

  const setCount = (id: number, n: number) => {
    setCounts((prev) => ({ ...prev, [String(id)]: n }));
  };

  const student = studentId != null ? students[String(studentId)] ?? null : null;
  const favorItems = useMemo(() => getFavorItems(items), [items]);
  const boxItems = useMemo(() => getFavorChoiceBoxes(items), [items]);

  const gifts = useMemo(
    () => (student ? buildGiftTable(student, favorItems, commonTags) : []),
    [student, favorItems, commonTags],
  );
  const boxes = useMemo(
    () => (student ? boxItems.map((b) => choiceBoxValue(student, b, items, commonTags)) : []),
    [student, boxItems, items, commonTags],
  );

  const result = useMemo(() => {
    const required = requiredBondExp(current, progress, target);
    const held = holdingsExp(gifts, boxes, counts);
    const remaining = Math.max(0, required - held);
    return {
      required,
      held,
      remaining,
      reach: maxBondFromExp(current, progress, held),
      suggestion: suggestShortfall(remaining, gifts, boxes),
      percent: required <= 0 ? 100 : Math.min(100, Math.floor((held / required) * 100)),
    };
  }, [current, progress, target, gifts, boxes, counts]);

  const span = rankSpan(current);
  const giftsBySection: Record<GiftSectionKey, GiftRow[]> = {
    SSR: gifts.filter((g) => g.item.Rarity === 'SSR'),
    SR: gifts.filter((g) => g.item.Rarity !== 'SSR'),
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400 dark:text-slate-400">데이터를 불러오는 중...</div>;
  }
  if (error) {
    return <div className="text-center py-12 text-red-500 dark:text-red-400">{error}</div>;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-3xl font-extrabold text-blue-900 dark:text-blue-300 mb-2 tracking-tight">
        인연 계산기
      </h1>
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
        학생을 선택하면 목표 인연랭크까지 필요한 EXP와 보유 선물로 도달 가능한 랭크, 부족분에 필요한 선물 수를 계산합니다.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* 입력 영역 */}
        <div className="flex flex-col gap-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4 md:p-5">
            {student ? (
              <div className="flex items-center gap-3">
                <img src={studentIconUrl(student.Id)} alt={student.Name} className="w-14 h-14 rounded object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="text-base font-bold text-gray-800 dark:text-slate-100 truncate">{student.Name}</div>
                  {!isReleasedInGlobal(student) && (
                    <span className="inline-block mt-0.5 text-[10px] bg-amber-500 text-white px-1 py-0.5 rounded">미출시</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="text-sm px-3 py-1.5 rounded-md border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
                >
                  변경
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="w-full h-20 flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 dark:border-slate-600 text-sm font-medium text-gray-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors"
              >
                학생 선택
              </button>
            )}

            <div className="grid grid-cols-3 gap-3 mt-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">현재 랭크</label>
                <NumberInput
                  min={1}
                  max={BOND_MAX_LEVEL}
                  value={current}
                  onChange={handleCurrentChange}
                  className="w-full p-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">
                  진행 EXP <span className="font-normal text-gray-400">/ {span > 0 ? formatNumber(span) : '—'}</span>
                </label>
                <NumberInput
                  min={0}
                  max={Math.max(0, span - 1)}
                  value={progress}
                  onChange={setProgress}
                  disabled={span === 0}
                  className="w-full p-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100 disabled:bg-gray-100 disabled:dark:bg-slate-800 disabled:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">목표 랭크</label>
                <NumberInput
                  min={current}
                  max={BOND_MAX_LEVEL}
                  emptyValue={BOND_MAX_LEVEL}
                  value={target}
                  onChange={setTarget}
                  className="w-full p-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100"
                />
              </div>
            </div>
            <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-2">
              진행 EXP 는 현재 랭크에서 다음 랭크까지 이미 쌓은 EXP 입니다.
            </p>
          </div>

          {student && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
              <div className="p-4 md:p-5 bg-pink-50 dark:bg-pink-900/20 border-b border-gray-200 dark:border-slate-700">
                <h2 className="text-sm font-bold text-pink-800 dark:text-pink-300">보유 선물</h2>
                <p className="text-[11px] text-pink-700/80 dark:text-pink-300/70 mt-0.5">
                  {student.Name} 기준 선호도순 (표정 = 선물 반응, 하트 눈 ×4 → 웃음 ×1). 한정 = 이벤트 지급 (제조 불가)
                </p>
              </div>
              <div className="p-4 md:p-5 flex flex-col gap-5">
                {GIFT_SECTIONS.map(({ key, title }) => {
                  const sectionGifts = giftsBySection[key];
                  const main = sectionGifts.filter((g) => g.mult >= 3);
                  const low = sectionGifts.filter((g) => g.mult <= 2);
                  const showLow = expanded[key];
                  return (
                    <section key={key} className="flex flex-col gap-2">
                      <h3 className="text-xs font-bold text-gray-600 dark:text-slate-300">
                        {title} <span className="font-normal text-gray-400 dark:text-slate-500">({key})</span>
                      </h3>
                      {main.map((g) => (
                        <GiftInputRow key={g.item.Id} gift={g} value={counts[String(g.item.Id)] ?? 0} onChange={(n) => setCount(g.item.Id, n)} />
                      ))}
                      {main.length === 0 && (
                        <p className="text-[11px] text-gray-400 dark:text-slate-500">×3 이상 선물 없음</p>
                      )}
                      {low.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}
                          className="self-start text-xs text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 py-1"
                        >
                          {showLow ? '×2 · ×1 접기' : `×2 · ×1 ${low.length}개 펼치기`}
                        </button>
                      )}
                      {showLow &&
                        low.map((g) => (
                          <GiftInputRow key={g.item.Id} gift={g} value={counts[String(g.item.Id)] ?? 0} onChange={(n) => setCount(g.item.Id, n)} />
                        ))}

                      {/* 선물 선택 상자 = 일반 선물 택1 → 일반 선물 섹션 끝 */}
                      {key === 'SR' &&
                        boxes.map(({ box, best }) => (
                          <div key={box.Id} className="flex items-center gap-2.5 border-t border-gray-100 dark:border-slate-700 pt-3 mt-1">
                            <img src={itemIconUrl(box.Icon)} alt={box.Name} className="w-9 h-9 shrink-0 ml-9" onError={hideOnError} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-gray-800 dark:text-slate-200 truncate">{box.Name}</div>
                              <div className="text-[11px] text-gray-400 dark:text-slate-400 flex items-center gap-1 min-w-0">
                                {best ? (
                                  <>
                                    <span className="shrink-0">→</span>
                                    <img src={giftReactionIconUrl(best.mult)} alt={`×${best.mult}`} className="w-4 h-4 shrink-0" />
                                    <span className="truncate">
                                      {best.item.Name} (×{best.mult}, {best.expPerItem}/개)
                                    </span>
                                  </>
                                ) : (
                                  '교환 가능한 선물 없음'
                                )}
                              </div>
                            </div>
                            <NumberInput
                              value={counts[String(box.Id)] ?? 0}
                              onChange={(n) => setCount(box.Id, n)}
                              zeroAsEmpty
                              placeholder="0"
                              className="w-20 p-1.5 text-sm text-right border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100"
                            />
                          </div>
                        ))}
                    </section>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 결과 영역 */}
        <div
          ref={resultRef}
          className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden md:sticky md:top-4 scroll-mt-20"
        >
          <div className="p-4 md:p-5 bg-blue-50 dark:bg-blue-900/30 border-b border-gray-200 dark:border-slate-700">
            <h2 className="text-sm font-bold text-blue-800 dark:text-blue-300">결과</h2>
          </div>

          <div className="p-4 md:p-5 flex flex-col gap-4">
            {!student ? (
              <div className="text-sm text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-3">
                학생을 선택하면 선물 효율과 부족분이 계산됩니다.
                {result.required > 0 && (
                  <div className="mt-1 tabular-nums">
                    인연 {current} → {target} 필요 EXP: <span className="font-bold">{formatNumber(result.required)}</span>
                  </div>
                )}
              </div>
            ) : (
              <>
                {!isReleasedInGlobal(student) && (
                  <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5">
                    한섭 미출시 학생입니다 (SchaleDB Global 기준).
                  </div>
                )}

                {result.required <= 0 ? (
                  <div className="text-sm text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-3">
                    목표 랭크가 현재 랭크와 같습니다. 이미 목표에 도달했습니다.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <StatBox label={`필요 EXP (인연 ${current} → ${target})`} value={formatNumber(result.required)} />
                      <StatBox label="보유 선물 EXP" value={formatNumber(result.held)} />
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs text-gray-600 dark:text-slate-400 mb-1.5">
                        <span>진행률</span>
                        <span className="tabular-nums font-bold">{result.percent}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-pink-500 transition-all" style={{ width: `${result.percent}%` }} />
                      </div>
                    </div>

                    <div className="border-t border-gray-100 dark:border-slate-700 pt-4">
                      <div className="text-[11px] text-gray-500 dark:text-slate-400 mb-1">보유 선물로 도달 가능 랭크</div>
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-lg font-bold text-pink-600 dark:text-pink-300 tabular-nums">
                          인연 {result.reach.rank}
                        </span>
                        {result.reach.leftover > 0 && (
                          <span className="text-xs text-gray-500 dark:text-slate-400 tabular-nums">
                            {result.reach.rank >= BOND_MAX_LEVEL
                              ? `(최대 랭크, ${formatNumber(result.reach.leftover)} EXP 초과)`
                              : `(+${formatNumber(result.reach.leftover)} EXP)`}
                          </span>
                        )}
                      </div>
                    </div>

                    {result.remaining === 0 ? (
                      <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
                        <div className="text-sm font-bold text-green-700 dark:text-green-300">보유 선물로 목표 도달 가능</div>
                        <div className="text-xs text-green-700/80 dark:text-green-300/80 mt-0.5 tabular-nums">
                          목표 대비 {formatNumber(result.held - result.required)} EXP 여유
                        </div>
                      </div>
                    ) : (
                      <div className="border-t border-gray-100 dark:border-slate-700 pt-4">
                        <div className="text-[11px] text-gray-500 dark:text-slate-400 mb-1">부족 EXP</div>
                        <div className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums mb-3">
                          {formatNumber(result.remaining)}
                        </div>

                        <div className="text-[11px] text-gray-500 dark:text-slate-400 mb-2">부족분 추천 (둘 중 하나로 충당)</div>
                        <div className="flex flex-col gap-2.5">
                          {result.suggestion.ssr && (
                            <SuggestionRow
                              icon={result.suggestion.ssr.gift.item.Icon}
                              title={`${result.suggestion.ssr.gift.item.Name}${
                                result.suggestion.ssr.tiedCount > 0 ? ` 외 ${result.suggestion.ssr.tiedCount}종` : ''
                              }`}
                              grade={result.suggestion.ssr.gift.mult}
                              sub={`고급 선물 · ×${result.suggestion.ssr.gift.mult} · ${result.suggestion.ssr.gift.expPerItem}/개`}
                              count={result.suggestion.ssr.count}
                            />
                          )}
                          {result.suggestion.box && (
                            <SuggestionRow
                              icon={result.suggestion.box.box.Icon}
                              title={result.suggestion.box.box.Name}
                              grade={result.suggestion.box.via.mult}
                              sub={`또는 ${result.suggestion.box.via.item.Name} · ×${result.suggestion.box.via.mult} · ${result.suggestion.box.via.expPerItem}/개`}
                              count={result.suggestion.box.count}
                            />
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-2 leading-relaxed">
                          개수는 올림 처리합니다. 한정 선물 (이벤트 지급) 은 추천에서 제외됩니다.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 모바일 하단 요약 바 — 1단 레이아웃에선 결과가 선물 목록 아래라서 */}
      {student && result.required > 0 && !resultVisible && (
        <button
          type="button"
          onClick={() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="md:hidden fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-white/95 dark:bg-slate-800/95 backdrop-blur border-t border-gray-200 dark:border-slate-700 shadow-[0_-2px_8px_rgba(0,0,0,0.08)] text-left"
        >
          <img src={studentIconUrl(student.Id)} alt={student.Name} className="w-9 h-9 rounded object-cover shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-gray-500 dark:text-slate-400">도달 가능 랭크</div>
            <div className="text-base font-bold text-pink-600 dark:text-pink-300 tabular-nums">
              인연 {result.reach.rank}
              <span className="text-xs font-normal text-gray-400 dark:text-slate-500"> / 목표 {target}</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            {result.remaining > 0 ? (
              <>
                <div className="text-[11px] text-gray-500 dark:text-slate-400">부족 EXP</div>
                <div className="text-base font-bold text-red-600 dark:text-red-400 tabular-nums">
                  {formatNumber(result.remaining)}
                </div>
              </>
            ) : (
              <div className="text-sm font-bold text-green-600 dark:text-green-400">목표 도달 가능</div>
            )}
          </div>
          <span className="text-xs text-blue-600 dark:text-blue-400 shrink-0">결과 ↓</span>
        </button>
      )}

      {pickerOpen && (
        <StudentPickerModal
          studentsData={students}
          title="학생 선택"
          onClose={() => setPickerOpen(false)}
          onSelect={setStudentId}
          selectedId={studentId}
          showUnreleasedBadge
        />
      )}
    </div>
  );
}

function GiftInputRow({ gift, value, onChange }: { gift: GiftRow; value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src={giftReactionIconUrl(gift.mult)}
        alt={`×${gift.mult}`}
        title={`선호도 ×${gift.mult}`}
        className="w-7 h-7 shrink-0"
        onError={hideOnError}
      />
      <img src={itemIconUrl(gift.item.Icon)} alt={gift.item.Name} className="w-9 h-9 shrink-0" onError={hideOnError} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-800 dark:text-slate-200 truncate">{gift.item.Name}</div>
        <div className="text-[11px] text-gray-400 dark:text-slate-400 flex items-center gap-1.5">
          <span className="tabular-nums">×{gift.mult} · {gift.expPerItem}/개</span>
          {gift.limited && (
            <span className="text-[10px] bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300 px-1 rounded">한정</span>
          )}
        </div>
      </div>
      <NumberInput
        value={value}
        onChange={onChange}
        zeroAsEmpty
        placeholder="0"
        className="w-20 p-1.5 text-sm text-right border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100"
      />
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-3">
      <div className="text-[11px] text-gray-500 dark:text-slate-400 mb-1">{label}</div>
      <div className="text-lg font-bold text-gray-800 dark:text-slate-200 tabular-nums">{value}</div>
    </div>
  );
}

function SuggestionRow({
  icon,
  title,
  grade,
  sub,
  count,
}: {
  icon: string;
  title: string;
  grade: GiftRow['mult'];
  sub: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <img src={itemIconUrl(icon)} alt={title} className="w-8 h-8 shrink-0" onError={hideOnError} />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-700 dark:text-slate-300 truncate">{title}</div>
        <div className="text-[11px] text-gray-400 dark:text-slate-500 flex items-center gap-1 min-w-0">
          <img src={giftReactionIconUrl(grade)} alt={`×${grade}`} className="w-4 h-4 shrink-0" onError={hideOnError} />
          <span className="truncate">{sub}</span>
        </div>
      </div>
      <div className="text-sm font-bold text-gray-800 dark:text-slate-200 tabular-nums">× {formatNumber(count)}</div>
    </div>
  );
}
