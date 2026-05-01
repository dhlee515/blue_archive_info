import { useState } from 'react';
import weaponStarData from '@/data/weapon_star.json';

// 성급 상수 및 누적 엘레프 수치 (src/data/weapon_star.json)
const STAR_LEVELS = weaponStarData.stars;

// 엘리그마 소모량 계산 함수 (현재 가격 및 잔여 횟수 기반)
function getEligmaCostByTier(
  targetElephAmount: number,
  pricePerEleph: number,
  remainingInTier: number
): number {
  if (targetElephAmount <= 0) return 0;

  let cost = 0;
  let remainingAmount = targetElephAmount;
  let currentPrice = pricePerEleph;
  let currentRemainingTier = remainingInTier;

  while (remainingAmount > 0) {
    if (currentPrice >= 5) {
      // 5개 구간부터는 상한이 없음
      cost += remainingAmount * 5;
      remainingAmount = 0;
    } else {
      if (remainingAmount <= currentRemainingTier) {
        cost += remainingAmount * currentPrice;
        remainingAmount = 0;
      } else {
        cost += currentRemainingTier * currentPrice;
        remainingAmount -= currentRemainingTier;

        currentPrice += 1;
        currentRemainingTier = 20; // 다음 티어의 구매 한도는 항상 20개
      }
    }
  }

  return cost;
}

export default function EligmaCalcPage() {
  const [currentStar, setCurrentStar] = useState<number>(3);
  const [targetStar, setTargetStar] = useState<number>(5);
  const [ownedEleph, setOwnedEleph] = useState<number | ''>(0);

  // 상점 엘리그마 가격 티어 상태
  const [pricePerEleph, setPricePerEleph] = useState<number>(1);
  const [remainingInTier, setRemainingInTier] = useState<number | ''>(20);

  const [result, setResult] = useState<{
    neededEleph: number;
    eligmaCost: number;
  } | null>(null);

  const handleCalculate = () => {
    // 1. 목표치 유효성 검사
    if (currentStar >= targetStar) {
      alert('목표 성급은 현재 성급보다 높아야 합니다.');
      return;
    }

    // 2. 필요 엘레프(조각) 계산
    const currentElephTotal = STAR_LEVELS.find((s) => s.level === currentStar)?.cumulativeEleph || 0;
    const targetElephTotal = STAR_LEVELS.find((s) => s.level === targetStar)?.cumulativeEleph || 0;

    const rawNeededEleph = targetElephTotal - currentElephTotal;
    const elephToBuy = Math.max(0, rawNeededEleph - (Number(ownedEleph) || 0));

    // 3. 엘리그마 소모량 계산
    const eligmaCost = getEligmaCostByTier(elephToBuy, pricePerEleph, Number(remainingInTier) || 0);

    setResult({
      neededEleph: elephToBuy,
      eligmaCost,
    });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-extrabold text-blue-900 dark:text-blue-300 mb-6 tracking-tight">엘리그마 계산기</h1>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden mb-6">
        <div className="p-6 bg-blue-50 dark:bg-blue-900/30 border-b border-gray-200 dark:border-slate-700">
          <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">
            현재 성급과 목표 성급을 지정하고 엘리그마 비용을 계산해보세요.
          </p>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 성급 선택 */}
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">현재 성급</label>
            <select
              value={currentStar}
              onChange={(e) => setCurrentStar(Number(e.target.value))}
              className="w-full p-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
            >
              {STAR_LEVELS.map((s) => (
                <option key={`cur-${s.level}`} value={s.level}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">목표 성급</label>
            <select
              value={targetStar}
              onChange={(e) => setTargetStar(Number(e.target.value))}
              className="w-full p-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
            >
              {STAR_LEVELS.map((s) => (
                <option key={`tgt-${s.level}`} value={s.level} disabled={s.level <= currentStar}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">현재 보유 엘레프(조각)</label>
            <input
              type="number"
              min="0"
              value={ownedEleph}
              onChange={(e) => {
                const val = e.target.value;
                setOwnedEleph(val === '' ? '' : Number(val));
              }}
              className="w-full p-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100"
              placeholder="0"
            />
          </div>

          {/* 빈 공간 맞추기 위한 div */}
          <div className="hidden md:block"></div>

          {/* 엘레프 1개당 가격 선택 */}
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">엘레프 1개당 가격</label>
            <select
              value={pricePerEleph}
              onChange={(e) => {
                const val = Number(e.target.value);
                setPricePerEleph(val);
                if (val !== 5 && Number(remainingInTier) > 20) {
                  setRemainingInTier(20);
                }
              }}
              className="w-full p-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
            >
              {[1, 2, 3, 4, 5].map((p) => (
                <option key={`price-${p}`} value={p}>{p} 엘리그마</option>
              ))}
            </select>
          </div>

          {/* 상점 잔여 구매 횟수 (가격이 5가 아닐 때만 렌더링) */}
          {pricePerEleph < 5 && (
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">해당 가격 잔여 구매 횟수</label>
              <input
                type="number"
                min="0"
                max="20"
                value={remainingInTier}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setRemainingInTier('');
                  } else {
                    let num = Number(val);
                    if (num > 20) num = 20;
                    if (num < 0) num = 0;
                    setRemainingInTier(num);
                  }
                }}
                className="w-full p-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100"
                placeholder="0~20"
              />
              <p className="text-xs text-gray-500 dark:text-slate-300 mt-2">
                현재 가격으로 더 살 수 있는 횟수를 적어주세요 (최대 20개).
              </p>
            </div>
          )}
        </div>

        <div className="p-6 bg-gray-50 dark:bg-slate-900 border-t border-gray-200 dark:border-slate-700">
          <button
            onClick={handleCalculate}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-sm"
          >
            계산하기
          </button>
        </div>
      </div>

      {/* 결과 화면 */}
      {result && (
        <div className="rounded-xl shadow-sm border p-6 transition-all bg-white dark:bg-slate-800 border-blue-200 dark:border-blue-800">
          <h2 className="text-xl font-bold mb-4 text-blue-900 dark:text-blue-300">
            계산 결과
          </h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-gray-50 dark:bg-slate-900 p-4 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm">
              <span className="block text-sm text-gray-500 dark:text-slate-300 mb-1">상점에서 구매할 조각 수</span>
              <span className="text-2xl font-bold text-gray-800 dark:text-slate-200">{result.neededEleph} 개</span>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg border border-blue-200 dark:border-blue-800 shadow-sm">
              <span className="block text-sm text-blue-600 dark:text-blue-400 font-bold mb-1">필요한 총 엘리그마</span>
              <span className="text-2xl font-bold text-blue-700 dark:text-blue-300">{result.eligmaCost} 개</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
