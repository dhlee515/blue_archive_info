import type { MaterialInfo } from '../utils/materialInfo';

interface Props {
  info: MaterialInfo;
  value: number;
  onChange: (value: number) => void;
}

export default function InventoryItemRow({ info, value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
      {info.iconUrl ? (
        <img src={info.iconUrl} alt={info.name} className="w-10 h-10 rounded object-cover shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded bg-gray-200 dark:bg-slate-700 flex items-center justify-center text-[10px] text-gray-500 dark:text-slate-400 shrink-0">
          {info.isSynthetic ? '₩' : '?'}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-gray-700 dark:text-slate-300 truncate mb-1">
          {info.name}
        </div>
        <input
          type="number"
          min={0}
          value={value === 0 ? '' : value}
          placeholder="0"
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          onFocus={(e) => e.target.select()}
          className="w-full p-1 text-sm border border-gray-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100"
        />
      </div>
    </div>
  );
}
