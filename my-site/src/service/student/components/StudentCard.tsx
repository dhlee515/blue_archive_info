import { Link } from 'react-router';
import type { Student } from '@/types/student';
import { formatAttackType, formatArmorType, formatSchool, formatRoleType, formatRarity } from '@/utils/format';

const ATTACK_COLOR: Record<string, string> = {
  Explosive: 'bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-100 dark:border-red-800',
  Piercing: 'bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800',
  Mystic: 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800',
  Sonic: 'bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-100 dark:border-purple-800',
};

const RARITY_COLOR: Record<number, string> = {
  3: 'text-yellow-500 dark:text-yellow-400',
  2: 'text-gray-400 dark:text-slate-400',
  1: 'text-amber-700 dark:text-amber-600',
};

interface Props {
  student: Student;
}

export default function StudentCard({ student }: Props) {
  return (
    <Link to={`/students/${student.schaleId}`} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden hover:shadow-md transition-shadow block">
      {/* 이미지 */}
      <div className="h-44 bg-gray-100 dark:bg-slate-700 flex items-center justify-center overflow-hidden">
        {student.imageUrl ? (
          <img
            src={student.imageUrl}
            alt={student.name}
            className="h-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="text-gray-400 dark:text-slate-400 text-sm">No Image</span>
        )}
      </div>

      <div className="p-3">
        {/* 이름 + 레어리티 */}
        <div className="flex justify-between items-start mb-1.5">
          <h3 className="font-bold text-base text-gray-800 dark:text-slate-200 truncate">{student.name}</h3>
          <span className={`text-xs font-medium whitespace-nowrap ml-1 ${RARITY_COLOR[student.rarity] ?? ''}`}>
            {formatRarity(student.rarity)}
          </span>
        </div>

        {/* 학교 + 역할 */}
        <div className="flex items-center gap-1.5 mb-2 text-xs text-gray-500 dark:text-slate-400">
          <span>{formatSchool(student.school)}</span>
          <span className="text-gray-300 dark:text-slate-600">|</span>
          <span>{student.role === 'Striker' ? '스트라이커' : '스페셜'}</span>
          <span className="text-gray-300 dark:text-slate-600">|</span>
          <span>{formatRoleType(student.tacticRole)}</span>
        </div>

        {/* 공격/방어 속성 */}
        <div className="flex gap-1.5 text-xs">
          <span className={`px-1.5 py-0.5 rounded border ${ATTACK_COLOR[student.attackType] ?? 'bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-600'}`}>
            {formatAttackType(student.attackType)}
          </span>
          <span className="px-1.5 py-0.5 rounded border bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-600">
            {formatArmorType(student.armorType)}
          </span>
        </div>
      </div>
    </Link>
  );
}
