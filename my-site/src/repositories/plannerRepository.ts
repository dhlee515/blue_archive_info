import type { InventoryMap, PlannerStudent, PlannerTargets } from '@/types/planner';
import { supabase } from '@/lib/supabase';
import { AppError } from '@/utils/AppError';

export class PlannerRepository {
  /**
   * 유저의 플래너 학생 목록을 가져옵니다.
   */
  static async getStudents(userId: string): Promise<PlannerStudent[]> {
    const { data, error } = await supabase
      .from('planner_students')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return (data ?? []).map(PlannerRepository.toPlannerStudent);
  }

  /**
   * 플래너에 학생을 추가합니다.
   * (user_id, student_id) 복합 unique 위반 시 AppError 를 던집니다.
   */
  static async addStudent(
    userId: string,
    studentId: number,
    targets: PlannerTargets,
  ): Promise<PlannerStudent> {
    const existing = await PlannerRepository.getStudents(userId);
    const maxOrder = existing.length > 0 ? Math.max(...existing.map((s) => s.sortOrder)) : -1;

    const { data, error } = await supabase
      .from('planner_students')
      .insert({
        user_id: userId,
        student_id: studentId,
        targets,
        sort_order: maxOrder + 1,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new AppError('이미 플래너에 추가된 학생입니다.', 'API_ERROR');
      }
      throw error;
    }

    return PlannerRepository.toPlannerStudent(data);
  }

  /**
   * 플래너 학생의 목표치 / 순서를 갱신합니다.
   * 응답 row 는 받지 않음 — egress 절감용 (caller 가 optimistic update 후 호출).
   */
  static async updateStudent(
    id: string,
    patch: { targets?: PlannerTargets; sortOrder?: number },
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (patch.targets !== undefined) updateData.targets = patch.targets;
    if (patch.sortOrder !== undefined) updateData.sort_order = patch.sortOrder;

    const { error } = await supabase
      .from('planner_students')
      .update(updateData)
      .eq('id', id);

    if (error) throw new AppError('플래너 학생 수정에 실패했습니다.', 'API_ERROR');
  }

  /**
   * 플래너에서 학생을 제거합니다. (하드 삭제)
   */
  static async removeStudent(id: string): Promise<void> {
    const { error } = await supabase
      .from('planner_students')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * 유저의 모든 학생을 삭제하고 새 학생 목록으로 교체합니다.
   * import (백업 복원) 전용 — 기존 row 가 모두 사라지고 id 가 재발급됩니다.
   */
  static async replaceStudents(
    userId: string,
    students: Array<{ studentId: number; targets: PlannerTargets; sortOrder: number }>,
  ): Promise<void> {
    const { error: delError } = await supabase
      .from('planner_students')
      .delete()
      .eq('user_id', userId);
    if (delError) throw delError;

    if (students.length === 0) return;

    const rows = students.map((s) => ({
      user_id: userId,
      student_id: s.studentId,
      targets: s.targets,
      sort_order: s.sortOrder,
    }));
    const { error: insError } = await supabase.from('planner_students').insert(rows);
    if (insError) {
      throw new AppError('학생 데이터 가져오기에 실패했습니다.', 'API_ERROR');
    }
  }

  /**
   * 플래너 학생 순서를 재정렬합니다.
   */
  static async reorderStudents(orderedIds: string[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase
        .from('planner_students')
        .update({ sort_order: i })
        .eq('id', orderedIds[i]);

      if (error) throw error;
    }
  }

  /**
   * 보유 재화 인벤토리를 가져옵니다. row 가 없으면 빈 맵을 반환합니다.
   */
  static async getInventory(userId: string): Promise<InventoryMap> {
    const { data, error } = await supabase
      .from('planner_inventory')
      .select('items')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return {};

    return (data.items as InventoryMap) ?? {};
  }

  /**
   * 보유 재화 인벤토리를 저장합니다. row 가 없으면 생성, 있으면 갱신.
   */
  static async updateInventory(userId: string, items: InventoryMap): Promise<void> {
    const { error } = await supabase
      .from('planner_inventory')
      .upsert({ user_id: userId, items }, { onConflict: 'user_id' });

    if (error) throw error;
  }

  private static toPlannerStudent(row: Record<string, unknown>): PlannerStudent {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      studentId: row.student_id as number,
      targets: (row.targets as PlannerTargets) ?? { level: { current: 1, target: 1 } },
      sortOrder: (row.sort_order as number) ?? 0,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
