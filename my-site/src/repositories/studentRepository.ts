import type { Student, StudentDetail } from '@/types/student';
import { SchaleDBStudentRepository } from './schaledbStudentRepository';

export class StudentRepository {
  /** 모든 학생 데이터를 가져옵니다 (SchaleDB 연동). */
  static async getStudents(): Promise<Student[]> {
    return SchaleDBStudentRepository.getStudents();
  }

  /** 학생 상세 정보를 가져옵니다. */
  static async getStudentById(schaleId: number): Promise<StudentDetail | null> {
    return SchaleDBStudentRepository.getStudentById(schaleId);
  }
}
