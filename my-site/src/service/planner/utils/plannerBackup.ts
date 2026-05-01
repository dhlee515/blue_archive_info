// 육성 플래너 데이터 백업 / 복원 — 단일 JSON 파일.
//
// 형식: { version, exportedAt, students[], inventory{} }
//   - id / userId / createdAt / updatedAt 같은 DB 메타필드는 제외 (import 시 재할당)
//   - version 필드로 향후 스키마 변경에 대비. 모르는 버전이면 거부.

import type { InventoryMap, PlannerTargets } from '@/types/planner';
import type { PlannerRepo } from './plannerRepoFactory';

export const BACKUP_VERSION = 1;

export interface BackupStudent {
  studentId: number;
  targets: PlannerTargets;
  sortOrder: number;
}

export interface PlannerBackup {
  version: number;
  exportedAt: string;
  students: BackupStudent[];
  inventory: InventoryMap;
}

/**
 * 현재 repo 의 데이터를 JSON 파일로 다운로드.
 * 게스트 / 클라우드 모드 모두 동일 동작.
 */
export async function exportBackup(repo: PlannerRepo): Promise<void> {
  const [students, inventory] = await Promise.all([repo.getStudents(), repo.getInventory()]);

  const backup: PlannerBackup = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    students: students.map((s) => ({
      studentId: s.studentId,
      targets: s.targets,
      sortOrder: s.sortOrder,
    })),
    inventory,
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);

  const a = document.createElement('a');
  a.href = url;
  a.download = `planner-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 텍스트 → 검증된 백업 객체. 실패 시 사용자 친화적 메시지로 throw.
 */
export function parseBackup(text: string): PlannerBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('파일을 JSON 으로 읽을 수 없습니다.');
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new Error('파일 구조가 올바르지 않습니다.');
  }
  const data = raw as Record<string, unknown>;

  if (data.version !== BACKUP_VERSION) {
    throw new Error(`지원하지 않는 백업 버전입니다 (v${String(data.version)}, 현재 v${BACKUP_VERSION}).`);
  }
  if (!Array.isArray(data.students)) {
    throw new Error('students 필드가 배열이 아닙니다.');
  }
  if (typeof data.inventory !== 'object' || data.inventory === null) {
    throw new Error('inventory 필드가 객체가 아닙니다.');
  }

  // 학생별 검증 + 정규화
  const seenIds = new Set<number>();
  const students: BackupStudent[] = [];
  for (const item of data.students as unknown[]) {
    if (typeof item !== 'object' || item === null) {
      throw new Error('students 배열에 유효하지 않은 항목이 있습니다.');
    }
    const s = item as Record<string, unknown>;
    if (typeof s.studentId !== 'number') {
      throw new Error('학생 항목의 studentId 가 숫자가 아닙니다.');
    }
    if (seenIds.has(s.studentId)) {
      throw new Error(`중복된 학생 id 가 있습니다: ${s.studentId}`);
    }
    seenIds.add(s.studentId);

    const targets = s.targets as PlannerTargets | undefined;
    if (!targets || typeof targets !== 'object' || !targets.level) {
      throw new Error(`학생 ${s.studentId} 의 targets 가 올바르지 않습니다.`);
    }

    students.push({
      studentId: s.studentId,
      targets,
      sortOrder: typeof s.sortOrder === 'number' ? s.sortOrder : students.length,
    });
  }

  // 인벤토리 정규화 (number 가 아닌 값 제거)
  const inventory: InventoryMap = {};
  for (const [k, v] of Object.entries(data.inventory as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      inventory[k] = Math.floor(v);
    }
  }

  return {
    version: BACKUP_VERSION,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : new Date().toISOString(),
    students,
    inventory,
  };
}

/**
 * 백업 객체를 repo 에 적용. 기존 데이터는 모두 덮어씀.
 */
export async function importBackup(repo: PlannerRepo, backup: PlannerBackup): Promise<void> {
  await repo.replaceStudents(backup.students);
  await repo.updateInventory(backup.inventory);
}
