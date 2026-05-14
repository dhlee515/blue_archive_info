// 로컬 ↔ 클라우드 명시적 동기화 유틸.
// 자동 머지 안 함 — last-write-wins 로 사용자가 어느 쪽이 권위적인지 직접 선택.

import { LocalPlannerRepository } from '@/repositories/localPlannerRepository';
import { PlannerRepository } from '@/repositories/plannerRepository';

export interface SyncCounts {
  students: number;
  inventory: number;
}

/** 클라우드 → 로컬: 클라우드의 학생/재화로 로컬을 덮어쓴다. */
export async function pullFromCloud(userId: string): Promise<SyncCounts> {
  const [cloudStudents, cloudInventory] = await Promise.all([
    PlannerRepository.getStudents(userId),
    PlannerRepository.getInventory(userId),
  ]);
  await LocalPlannerRepository.replaceStudents(
    cloudStudents.map((s) => ({
      studentId: s.studentId,
      targets: s.targets,
      sortOrder: s.sortOrder,
    })),
  );
  await LocalPlannerRepository.updateInventory(cloudInventory);
  return {
    students: cloudStudents.length,
    inventory: Object.keys(cloudInventory).length,
  };
}

/** 로컬 → 클라우드: 로컬의 학생/재화로 클라우드를 덮어쓴다. */
export async function pushToCloud(userId: string): Promise<SyncCounts> {
  const [localStudents, localInventory] = await Promise.all([
    LocalPlannerRepository.getStudents(),
    LocalPlannerRepository.getInventory(),
  ]);
  await PlannerRepository.replaceStudents(
    userId,
    localStudents.map((s) => ({
      studentId: s.studentId,
      targets: s.targets,
      sortOrder: s.sortOrder,
    })),
  );
  await PlannerRepository.updateInventory(userId, localInventory);
  return {
    students: localStudents.length,
    inventory: Object.keys(localInventory).length,
  };
}

/** 로컬 데이터 전부 비우기. */
export async function clearLocal(): Promise<void> {
  await LocalPlannerRepository.replaceStudents([]);
  await LocalPlannerRepository.updateInventory({});
}

/** 현재 로컬 보유 항목 개수 (배너/다이얼로그 표시용). */
export async function getLocalCounts(): Promise<SyncCounts> {
  const [students, inventory] = await Promise.all([
    LocalPlannerRepository.getStudents(),
    LocalPlannerRepository.getInventory(),
  ]);
  return {
    students: students.length,
    inventory: Object.keys(inventory).length,
  };
}

/** 현재 클라우드 보유 항목 개수 (다이얼로그 표시용). */
export async function getCloudCounts(userId: string): Promise<SyncCounts> {
  const [students, inventory] = await Promise.all([
    PlannerRepository.getStudents(userId),
    PlannerRepository.getInventory(userId),
  ]);
  return {
    students: students.length,
    inventory: Object.keys(inventory).length,
  };
}
