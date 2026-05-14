// 비로그인 사용자용 플래너 저장소.
//
// 단일 키 'planner.local.v1' 에 학생 + 인벤토리를 함께 보관합니다.
// 백엔드는 KVStore 추상화를 통해 환경에 맞게 자동 선택됨:
//   - 웹: localStorage
//   - Tauri (데스크탑): @tauri-apps/plugin-store (파일시스템 JSON)

import type { InventoryMap, PlannerStudent, PlannerTargets } from '@/types/planner';
import { AppError } from '@/utils/AppError';
import { kvstore } from '@/lib/kvstore';

const STORAGE_KEY = 'planner.local.v1';
const LOCAL_USER_ID = '__local__';

interface LocalState {
  students: PlannerStudent[];
  inventory: InventoryMap;
}

async function readState(): Promise<LocalState> {
  try {
    const parsed = await kvstore.get<Partial<LocalState>>(STORAGE_KEY);
    if (!parsed) return { students: [], inventory: {} };
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

async function writeState(state: LocalState): Promise<void> {
  await kvstore.set(STORAGE_KEY, state);
}

const now = () => new Date().toISOString();

const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export class LocalPlannerRepository {
  static async getStudents(): Promise<PlannerStudent[]> {
    const state = await readState();
    return [...state.students].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  static async addStudent(
    studentId: number,
    targets: PlannerTargets,
  ): Promise<PlannerStudent> {
    const state = await readState();
    if (state.students.some((s) => s.studentId === studentId)) {
      throw new AppError('이미 플래너에 추가된 학생입니다.', 'API_ERROR');
    }
    const maxOrder =
      state.students.length > 0 ? Math.max(...state.students.map((s) => s.sortOrder)) : -1;
    const t = now();
    const newStudent: PlannerStudent = {
      id: newId(),
      userId: LOCAL_USER_ID,
      studentId,
      targets,
      sortOrder: maxOrder + 1,
      createdAt: t,
      updatedAt: t,
    };
    state.students.push(newStudent);
    await writeState(state);
    return newStudent;
  }

  static async updateStudent(
    id: string,
    patch: { targets?: PlannerTargets; sortOrder?: number },
  ): Promise<void> {
    const state = await readState();
    const idx = state.students.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const s = state.students[idx];
    state.students[idx] = {
      ...s,
      ...(patch.targets !== undefined && { targets: patch.targets }),
      ...(patch.sortOrder !== undefined && { sortOrder: patch.sortOrder }),
      updatedAt: now(),
    };
    await writeState(state);
  }

  static async removeStudent(id: string): Promise<void> {
    const state = await readState();
    state.students = state.students.filter((s) => s.id !== id);
    await writeState(state);
  }

  /**
   * 모든 학생을 삭제하고 새 학생 목록으로 교체합니다 (import 용).
   */
  static async replaceStudents(
    students: Array<{ studentId: number; targets: PlannerTargets; sortOrder: number }>,
  ): Promise<void> {
    const state = await readState();
    const t = now();
    state.students = students.map((s) => ({
      id: newId(),
      userId: LOCAL_USER_ID,
      studentId: s.studentId,
      targets: s.targets,
      sortOrder: s.sortOrder,
      createdAt: t,
      updatedAt: t,
    }));
    await writeState(state);
  }

  static async reorderStudents(orderedIds: string[]): Promise<void> {
    const state = await readState();
    const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
    state.students = state.students.map((s) => ({
      ...s,
      sortOrder: orderMap.get(s.id) ?? s.sortOrder,
    }));
    await writeState(state);
  }

  static async getInventory(): Promise<InventoryMap> {
    return (await readState()).inventory;
  }

  static async updateInventory(items: InventoryMap): Promise<void> {
    const state = await readState();
    state.inventory = items;
    await writeState(state);
  }
}
