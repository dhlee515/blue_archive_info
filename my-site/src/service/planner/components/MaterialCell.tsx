import type { MaterialInfo } from '../utils/materialInfo';

interface Props {
  info: MaterialInfo;
  /** 주 수치 (필요량 또는 부족량) */
  primary: number;
  /** 보조 수치 (보유량 등) — 작게 표시 */
  secondary?: { label: string; value: number };
  /** 부족 상태 강조 */
  deficit?: boolean;
}

export default function MaterialCell({ info, primary, secondary, deficit }: Props) {
  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-lg border ${
        deficit
          ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
          : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900'
      }`}
    >
      {info.iconUrl ? (
        <img
          src={info.iconUrl}
          alt={info.name}
          className="w-10 h-10 rounded object-cover shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded bg-gray-200 dark:bg-slate-700 flex items-center justify-center text-[10px] text-gray-500 dark:text-slate-400 shrink-0">
          {info.isSynthetic ? '₩' : '?'}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-gray-700 dark:text-slate-300 truncate">
          {info.name}
        </div>
        <div className={`text-sm font-bold ${deficit ? 'text-red-700 dark:text-red-300' : 'text-gray-900 dark:text-slate-100'}`}>
          {primary.toLocaleString()}
        </div>
        {secondary && (
          <div className="text-[10px] text-gray-500 dark:text-slate-400">
            {secondary.label}: {secondary.value.toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
