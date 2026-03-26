import type { Student } from '@/types/student';
import studentsData from '@/data/character.json';

export class StudentRepository {
  /**
   * 모든 학생 데이터를 가져옵니다.
   */
  static async getStudents(): Promise<Student[]> {
    return studentsData as Student[];
  }
}
