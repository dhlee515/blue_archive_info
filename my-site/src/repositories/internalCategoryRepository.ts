import type { Category } from '@/types/guide';
import { supabase } from '@/lib/supabase';

export class InternalCategoryRepository {
  static async getCategories(): Promise<Category[]> {
    const { data, error } = await supabase
      .from('internal_categories')
      .select('*')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;

    return (data ?? []).map(InternalCategoryRepository.toCategory);
  }

  static async createCategory(name: string): Promise<Category> {
    const categories = await InternalCategoryRepository.getCategories();
    const maxOrder = categories.length > 0 ? Math.max(...categories.map((c) => c.sortOrder)) : 0;

    const { data, error } = await supabase
      .from('internal_categories')
      .insert({ name, sort_order: maxOrder + 1 })
      .select()
      .single();

    if (error) throw error;

    return InternalCategoryRepository.toCategory(data);
  }

  static async updateName(id: string, name: string): Promise<void> {
    const { error } = await supabase
      .from('internal_categories')
      .update({ name })
      .eq('id', id);

    if (error) throw error;
  }

  static async reorder(orderedIds: string[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase
        .from('internal_categories')
        .update({ sort_order: i })
        .eq('id', orderedIds[i]);

      if (error) throw error;
    }
  }

  static async deleteCategory(id: string): Promise<void> {
    const { error } = await supabase
      .from('internal_categories')
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
