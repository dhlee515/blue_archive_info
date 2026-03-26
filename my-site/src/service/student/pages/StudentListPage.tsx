import { useState, useEffect } from 'react';
import type { Student } from '@/types/student';
import { StudentRepository } from '@/repositories/studentRepository';
import StudentCard from '../components/StudentCard';

export default function StudentListPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStudents() {
      try {
        const data = await StudentRepository.getStudents();
        setStudents(data);
      } catch (error) {
        console.error('Failed to fetch students:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchStudents();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-extrabold text-blue-900 tracking-tight">학생 목록</h1>
          <p className="text-gray-500 mt-2">키보토스의 학생 정보를 확인하세요.</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">데이터를 불러오는 중...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {students.map((student) => (
            <StudentCard key={student.id} student={student} />
          ))}
        </div>
      )}
      
      {!loading && students.length === 0 && (
        <div className="text-center py-12 text-gray-400 border border-dashed border-gray-300 rounded-lg">
          표시할 학생 데이터가 없습니다.
        </div>
      )} */}
    </div>
  );
}
