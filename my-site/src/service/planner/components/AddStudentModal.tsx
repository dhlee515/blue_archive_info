import type { SchaleDBStudent } from '@/types/schaledb';
import StudentPickerModal from '@/components/student/StudentPickerModal';

interface Props {
  studentsData: Record<string, SchaleDBStudent>;
  /** 이미 플래너에 담긴 학생 id 집합 */
  existingStudentIds: Set<number>;
  onClose: () => void;
  onAdd: (studentId: number) => void;
}

export default function AddStudentModal({ studentsData, existingStudentIds, onClose, onAdd }: Props) {
  return (
    <StudentPickerModal
      studentsData={studentsData}
      title="학생 추가"
      onClose={onClose}
      onSelect={onAdd}
      disabledIds={existingStudentIds}
      disabledLabel="추가됨"
    />
  );
}
