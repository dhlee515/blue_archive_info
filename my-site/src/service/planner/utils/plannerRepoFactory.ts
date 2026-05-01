// 로그인 여부에 따라 Supabase / localStorage 구현을 골라주는 팩토리.
// 페이지에서는 동일한 인터페이스(userId 없는 메서드)로 호출.

import type { InventoryMap, PlannerStudent, PlannerTargets } from '@/types/planner';
import { PlannerRepository } from '@/repositories/plannerRepository';
import { LocalPlannerRepository } from '@/repositories/localPlannerRepository';

export interface PlannerRepo {
  getStudents(): Promise<PlannerStudent[]>;
  addStudent(studentId: number, targets: PlannerTargets): Promise<PlannerStudent>;
  updateStudent(
    id: string,
    patch: { targets?: PlannerTargets; sortOrder?: number },
  ): Promise<void>;
  removeStudent(id: string): Promise<void>;
  reorderStudents(orderedIds: string[]): Promise<void>;
  /** 모든 학생을 삭제하고 새 목록으로 교체 (import 용). */
  replaceStudents(
    students: Array<{ studentId: number; targets: PlannerTargets; sortOrder: number }>,
  ): Promise<void>;
  getInventory(): Promise<InventoryMap>;
  updateInventory(items: InventoryMap): Promise<void>;
}

export function getPlannerRepo(userId: string | null | undefined): PlannerRepo {
  if (userId) {
    return {
      getStudents: () => PlannerRepository.getStudents(userId),
      addStudent: (sid, t) => PlannerRepository.addStudent(userId, sid, t),
      updateStudent: (id, patch) => PlannerRepository.updateStudent(id, patch),
      removeStudent: (id) => PlannerRepository.removeStudent(id),
      reorderStudents: (ids) => PlannerRepository.reorderStudents(ids),
      replaceStudents: (students) => PlannerRepository.replaceStudents(userId, students),
      getInventory: () => PlannerRepository.getInventory(userId),
      updateInventory: (items) => PlannerRepository.updateInventory(userId, items),
    };
  }
  return {
    getStudents: () => LocalPlannerRepository.getStudents(),
    addStudent: (sid, t) => LocalPlannerRepository.addStudent(sid, t),
    updateStudent: (id, patch) => LocalPlannerRepository.updateStudent(id, patch),
    removeStudent: (id) => LocalPlannerRepository.removeStudent(id),
    reorderStudents: (ids) => LocalPlannerRepository.reorderStudents(ids),
    replaceStudents: (students) => LocalPlannerRepository.replaceStudents(students),
    getInventory: () => LocalPlannerRepository.getInventory(),
    updateInventory: (items) => LocalPlannerRepository.updateInventory(items),
  };
}
