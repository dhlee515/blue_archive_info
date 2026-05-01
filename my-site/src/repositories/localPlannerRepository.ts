// 비로그인 사용자용 플래너 저장소.
//
// localStorage 단일 키 'planner.local.v1' 에 학생 + 인벤토리를 함께 보관합니다.
// PlannerRepository 와 동일 인터페이스 (단, userId 인자 없음 — 게스트는 본인 단말 1개).

import type { InventoryMap, PlannerStudent, PlannerTargets } from '@/types/planner';
import { AppError } from '@/utils/AppError';

const STORAGE_KEY = 'planner.local.v1';
const LOCAL_USER_ID = '__local__';

interface LocalState {
  students: PlannerStudent[];
  inventory: InventoryMap;
}

function readState(): LocalState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { students: [], inventory: {} };
    const parsed = JSON.parse(raw);
    return {
      students: Array.isArray(parsed.students) ? parsed.students : [],
      inventory:
        parsed.inventory && typeof parsed.inventory === 'object'
          ? (parsed.inventory as InventoryMap)
          : {},
    };
  } catch {
    return { students: [], inventory: {} };
  }
}

function writeState(state: LocalState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const now = () => new Date().toISOString();

export class LocalPlannerRepository {
  static async getStudents(): Promise<PlannerStudent[]> {
    return [...readState().students].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  static async addStudent(
    studentId: number,
    targets: PlannerTargets,
  ): Promise<PlannerStudent> {
    const state = readState();
    if (state.students.some((s) => s.studentId === studentId)) {
      throw new AppError('이미 플래너에 추가된 학생입니다.', 'API_ERROR');
    }
    const maxOrder =
      state.students.length > 0 ? Math.max(...state.students.map((s) => s.sortOrder)) : -1;
    const t = now();
    const newStudent: PlannerStudent = {
      id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: LOCAL_USER_ID,
      studentId,
      targets,
      sortOrder: maxOrder + 1,
      createdAt: t,
      updatedAt: t,
    };
    state.students.push(newStudent);
    writeState(state);
    return newStudent;
  }

  static async updateStudent(
    id: string,
    patch: { targets?: PlannerTargets; sortOrder?: number },
  ): Promise<void> {
    const state = readState();
    const idx = state.students.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const s = state.students[idx];
    state.students[idx] = {
      ...s,
      ...(patch.targets !== undefined && { targets: patch.targets }),
      ...(patch.sortOrder !== undefined && { sortOrder: patch.sortOrder }),
      updatedAt: now(),
    };
    writeState(state);
  }

  static async removeStudent(id: string): Promise<void> {
    const state = readState();
    state.students = state.students.filter((s) => s.id !== id);
    writeState(state);
  }

  static async reorderStudents(orderedIds: string[]): Promise<void> {
    const state = readState();
    const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
    state.students = state.students.map((s) => ({
      ...s,
      sortOrder: orderMap.get(s.id) ?? s.sortOrder,
    }));
    writeState(state);
  }

  static async getInventory(): Promise<InventoryMap> {
    return readState().inventory;
  }

  static async updateInventory(items: InventoryMap): Promise<void> {
    const state = readState();
    state.inventory = items;
    writeState(state);
  }
}
