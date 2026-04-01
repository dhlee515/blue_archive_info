import type { Category } from '@/types/guide';
import { supabase } from '@/lib/supabase';

export class CategoryRepository {
  /**
   * 전체 카테고리 목록을 가져옵니다.
   */
  static async getCategories(): Promise<Category[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;

    return (data ?? []).map(CategoryRepository.toCategory);
  }

  /**
   * 카테고리를 추가합니다. (관리자용)
   */
  static async createCategory(name: string): Promise<Category> {
    // 마지막 순서 + 1
    const categories = await CategoryRepository.getCategories();
    const maxOrder = categories.length > 0 ? Math.max(...categories.map((c) => c.sortOrder)) : 0;

    const { data, error } = await supabase
      .from('categories')
      .insert({ name, sort_order: maxOrder + 1 })
      .select()
      .single();

    if (error) throw error;

    return CategoryRepository.toCategory(data);
  }

  /**
   * 카테고리 이름을 수정합니다. (관리자용)
   */
  static async updateName(id: string, name: string): Promise<void> {
    const { error } = await supabase
      .from('categories')
      .update({ name })
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * 카테고리 순서를 변경합니다. (관리자용)
   */
  static async swapOrder(idA: string, orderA: number, idB: string, orderB: number): Promise<void> {
    const { error: err1 } = await supabase
      .from('categories')
      .update({ sort_order: orderB })
      .eq('id', idA);

    if (err1) throw err1;

    const { error: err2 } = await supabase
      .from('categories')
      .update({ sort_order: orderA })
      .eq('id', idB);

    if (err2) throw err2;
  }

  /**
   * 카테고리를 삭제합니다. (관리자용, soft delete)
   */
  static async deleteCategory(id: string): Promise<void> {
    const { error } = await supabase
      .from('categories')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  private static toCategory(row: Record<string, unknown>): Category {
    return {
      id: row.id as string,
      name: row.name as string,
      sortOrder: (row.sort_order as number) ?? 0,
      createdAt: row.created_at as string,
    };
  }
}
