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
      .order('created_at', { ascending: true });

    if (error) throw error;

    return (data ?? []).map(CategoryRepository.toCategory);
  }

  /**
   * 카테고리를 추가합니다. (관리자용)
   */
  static async createCategory(name: string): Promise<Category> {
    const { data, error } = await supabase
      .from('categories')
      .insert({ name })
      .select()
      .single();

    if (error) throw error;

    return CategoryRepository.toCategory(data);
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
      createdAt: row.created_at as string,
    };
  }
}
