import type { Student } from '@/types/student';

interface Props {
  student: Student;
}

export default function StudentCard({ student }: Props) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden hover:shadow-md transition-shadow">
      {/* image placeholder or actual url if valid */}
      <div className="h-40 bg-gray-100 dark:bg-slate-700 flex items-center justify-center p-4">
        {student.imageUrl ? (
          <img src={student.imageUrl} alt={student.name} className="max-h-full object-contain" />
        ) : (
          <span className="text-gray-400 dark:text-slate-400 text-sm">No Image</span>
        )}
      </div>
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-bold text-lg text-gray-800 dark:text-slate-200">{student.name}</h3>
          <span className="text-sm px-2 py-1 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-full font-medium">
            ★{student.rarity}
          </span>
        </div>
        <p className="text-sm text-gray-500 dark:text-slate-300 mb-2">{student.school}</p>
        <div className="flex gap-2 text-xs">
          <span className="px-2 py-1 bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded border border-red-100 dark:border-red-800">
            공격: {student.attackType}
          </span>
          <span className="px-2 py-1 bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded border border-amber-100 dark:border-amber-800">
            방어: {student.armorType}
          </span>
        </div>
      </div>
    </div>
  );
}
