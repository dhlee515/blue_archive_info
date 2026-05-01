import type { SchaleDBEquipment, SchaleDBItem } from '@/types/schaledb';
import type { DeficitReport } from '@/types/planner';
import { getMaterialInfo } from '../utils/materialInfo';
import {
  breakdownStudentExp,
  breakdownWeaponExpAsParts,
  type BreakdownItem,
} from '../utils/expConversion';
import { itemIconUrl, equipmentImageUrl } from '@/lib/schaledbImage';
import MaterialCell from './MaterialCell';

interface Props {
  report: DeficitReport;
  itemsData: Record<string, SchaleDBItem>;
  equipmentData: Record<string, SchaleDBEquipment>;
}

const EXP_KEYS = new Set(['student_exp', 'weapon_exp']);

export default function DeficitPanel({ report, itemsData, equipmentData }: Props) {
  const keys = Object.keys(report.required);

  if (keys.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <h2 className="text-xl font-bold text-blue-900 dark:text-blue-300 mb-3">부족 재화</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400">
          계산된 부족 재화가 없습니다.
        </p>
      </div>
    );
  }

  // 부족량 내림차순 정렬 (0 부족은 뒤로). EXP 키는 별도 섹션으로 분리.
  const expKeys = keys.filter((k) => EXP_KEYS.has(k));
  const otherKeys = keys
    .filter((k) => !EXP_KEYS.has(k))
    .sort((a, b) => (report.deficit[b] ?? 0) - (report.deficit[a] ?? 0));

  const deficitCount = keys.filter((k) => (report.deficit[k] ?? 0) > 0).length;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-blue-900 dark:text-blue-300">부족 재화</h2>
        <span className="text-xs text-gray-500 dark:text-slate-400">
          {deficitCount > 0 ? `${deficitCount}개 항목 부족` : '모든 재화 충족 ✓'}
        </span>
      </div>

      {/* EXP 환산 섹션 — 학생/무기 EXP 부족분을 등급별 수량으로 환산 */}
      {expKeys.length > 0 && (
        <div className="space-y-2 mb-4">
          {expKeys.map((key) => {
            const required = report.required[key] ?? 0;
            const owned = report.owned[key] ?? 0;
            const deficit = report.deficit[key] ?? 0;
            if (required === 0) return null;

            const isStudent = key === 'student_exp';
            const breakdown = isStudent
              ? breakdownStudentExp(deficit)
              : breakdownWeaponExpAsParts(deficit);
            const title = isStudent ? '학생 경험치 (활동 보고서 환산)' : '무기 경험치 (부품 등급별 환산)';
            const subtitle = isStudent ? null : '4개 부품 시리즈 모두 EXP 동일 — 보유한 시리즈 사용';

            return (
              <ExpBreakdownRow
                key={key}
                title={title}
                subtitle={subtitle}
                required={required}
                owned={owned}
                deficit={deficit}
                breakdown={breakdown}
              />
            );
          })}
        </div>
      )}

      {/* 나머지 재화 (오파츠/설계도면/엘레프/WB/크레딧 등) */}
      {otherKeys.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {otherKeys.map((key) => {
            const info = getMaterialInfo(key, itemsData, equipmentData);
            const required = report.required[key] ?? 0;
            const owned = report.owned[key] ?? 0;
            const deficit = report.deficit[key] ?? 0;
            const isDeficit = deficit > 0;

            return (
              <MaterialCell
                key={key}
                info={info}
                primary={isDeficit ? deficit : required}
                secondary={{
                  label: isDeficit ? '필요' : '보유',
                  value: isDeficit ? required : owned,
                }}
                deficit={isDeficit}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ExpBreakdownRowProps {
  title: string;
  subtitle: string | null;
  required: number;
  owned: number;
  deficit: number;
  breakdown: BreakdownItem[];
}

function ExpBreakdownRow({ title, subtitle, required, owned, deficit, breakdown }: ExpBreakdownRowProps) {
  const isDeficit = deficit > 0;
  return (
    <div
      className={`p-3 rounded-lg border ${
        isDeficit
          ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
          : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="font-bold text-sm text-gray-800 dark:text-slate-100">{title}</div>
        <div className="text-xs text-gray-500 dark:text-slate-400">
          필요 {required.toLocaleString()} / 보유 {owned.toLocaleString()}
        </div>
      </div>
      {subtitle && (
        <div className="text-[11px] text-gray-500 dark:text-slate-400 mb-2">{subtitle}</div>
      )}
      {isDeficit ? (
        <>
          <div className="text-sm font-bold text-red-700 dark:text-red-300 mb-2">
            {deficit.toLocaleString()} EXP 부족
          </div>
          <div className="flex flex-wrap gap-2">
            {breakdown.map(({ source, count }) => (
              <BreakdownChip key={source.key} source={source} count={count} />
            ))}
          </div>
        </>
      ) : (
        <div className="text-sm font-bold text-gray-700 dark:text-slate-200">충족 ✓</div>
      )}
    </div>
  );
}

function BreakdownChip({ source, count }: BreakdownItem) {
  const isReport = source.key.startsWith('report:');
  const iconUrl = isReport ? itemIconUrl(source.icon) : equipmentImageUrl(source.icon);
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700">
      <img src={iconUrl} alt={source.name} className="w-6 h-6 rounded" />
      <span className="text-xs font-medium text-gray-700 dark:text-slate-300">
        <span className="text-[10px] text-gray-500 dark:text-slate-500 mr-0.5">{source.rarity}</span>
        ×{count.toLocaleString()}
      </span>
    </div>
  );
}
