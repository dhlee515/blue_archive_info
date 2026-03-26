import type { Student } from '@/types/student';

interface Props {
  student: Student;
}

export default function StudentCard({ student }: Props) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
      {/* image placeholder or actual url if valid */}
      <div className="h-40 bg-gray-100 flex items-center justify-center p-4">
        {student.imageUrl ? (
          <img src={student.imageUrl} alt={student.name} className="max-h-full object-contain" />
        ) : (
          <span className="text-gray-400 text-sm">No Image</span>
        )}
      </div>
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-bold text-lg text-gray-800">{student.name}</h3>
          <span className="text-sm px-2 py-1 bg-blue-50 text-blue-600 rounded-full font-medium">
            ★{student.rarity}
          </span>
        </div>
        <p className="text-sm text-gray-500 mb-2">{student.school}</p>
        <div className="flex gap-2 text-xs">
          <span className="px-2 py-1 bg-red-50 text-red-700 rounded border border-red-100">
            공격: {student.attackType}
          </span>
          <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded border border-amber-100">
            방어: {student.armorType}
          </span>
        </div>
      </div>
    </div>
  );
}
