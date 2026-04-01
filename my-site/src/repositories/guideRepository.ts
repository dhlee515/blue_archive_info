import type { Guide, GuideFormData, GuideLog } from '@/types/guide';
import { supabase } from '@/lib/supabase';
import { AppError } from '@/utils/AppError';

function encodeContent(html: string): string {
  return btoa(unescape(encodeURIComponent(html)));
}

function decodeContent(encoded: string): string {
  try {
    return decodeURIComponent(escape(atob(encoded)));
  } catch {
    return encoded;
  }
}

export class GuideRepository {
  /**
   * 가이드 목록을 가져옵니다. 카테고리 필터 선택 가능.
   */
  static async getGuides(categoryId?: string): Promise<Guide[]> {
    let query = supabase
      .from('guides')
      .select('*, profiles(nickname, role)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map(GuideRepository.toGuide);
  }

  /**
   * 특정 가이드를 가져옵니다.
   */
  static async getGuideById(id: string): Promise<Guide> {
    const { data, error } = await supabase
      .from('guides')
      .select('*, profiles(nickname, role)')
      .eq('id', id)
      .single();

    if (error || !data) throw new AppError('가이드를 찾을 수 없습니다.', 'NOT_FOUND');

    return GuideRepository.toGuide(data);
  }

  /**
   * 새 가이드를 작성합니다.
   */
  static async createGuide(formData: GuideFormData, userId: string): Promise<Guide> {
    let imageUrl: string | null = null;
    if (formData.imageFile) {
      imageUrl = await GuideRepository.uploadImage(formData.imageFile);
    }

    const { error } = await supabase
      .from('guides')
      .insert({
        title: formData.title,
        category_id: formData.categoryId,
        content: encodeContent(formData.content),
        image_url: imageUrl,
        author_id: userId,
      });

    if (error) throw error;

    // insert 후 방금 생성된 글을 조회
    const { data: latest } = await supabase
      .from('guides')
      .select('id')
      .eq('author_id', userId)
      .eq('title', formData.title)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const guideId = (latest?.id as string) ?? '';
    if (guideId) await GuideRepository.insertLog(guideId, userId, 'create');

    return guideId ? GuideRepository.getGuideById(guideId) : ({} as Guide);
  }

  /**
   * 가이드를 수정합니다.
   */
  static async updateGuide(id: string, formData: GuideFormData, userId: string): Promise<Guide> {
    const existing = await GuideRepository.getGuideById(id);

    let imageUrl = existing.imageUrl;
    if (formData.imageFile) {
      if (existing.imageUrl) {
        await GuideRepository.deleteImage(existing.imageUrl);
      }
      imageUrl = await GuideRepository.uploadImage(formData.imageFile);
    }

    const { error } = await supabase
      .from('guides')
      .update({
        title: formData.title,
        category_id: formData.categoryId,
        content: encodeContent(formData.content),
        image_url: imageUrl,
      })
      .eq('id', id);

    if (error) throw error;

    await GuideRepository.insertLog(id, userId, 'update');

    return GuideRepository.getGuideById(id);
  }

  /**
   * 가이드를 삭제합니다. (soft delete)
   */
  static async deleteGuide(id: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('guides')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    await GuideRepository.insertLog(id, userId, 'delete');
  }

  /**
   * 삭제된 글 목록을 가져옵니다. (관리자용)
   */
  static async getDeletedGuides(): Promise<Guide[]> {
    const { data, error } = await supabase
      .from('guides')
      .select('*, profiles(nickname, role)')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map(GuideRepository.toGuide);
  }

  /**
   * 삭제된 글을 복원합니다. (관리자용)
   */
  static async restoreGuide(id: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('guides')
      .update({ deleted_at: null })
      .eq('id', id);

    if (error) throw error;

    await GuideRepository.insertLog(id, userId, 'restore');
  }

  /**
   * 특정 글의 로그 목록을 가져옵니다.
   */
  static async getLogsByGuideId(guideId: string): Promise<GuideLog[]> {
    const { data, error } = await supabase
      .from('guide_logs')
      .select('*, profiles(nickname)')
      .eq('guide_id', guideId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map((row) => {
      const profiles = row.profiles as { nickname: string } | null;
      return {
        id: row.id as string,
        guideId: row.guide_id as string,
        editorId: row.editor_id as string,
        editorNickname: profiles?.nickname ?? '',
        action: row.action as 'create' | 'update' | 'delete',
        createdAt: row.created_at as string,
      };
    });
  }

  private static async insertLog(guideId: string, editorId: string, action: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('guide_logs')
        .insert({ guide_id: guideId, editor_id: editorId, action });
      if (error) console.error('Failed to insert log:', error);
    } catch (e) {
      console.error('Failed to insert log:', e);
    }
  }

  private static async uploadImage(file: File): Promise<string> {
    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage
      .from('guide-images')
      .upload(fileName, file);

    if (error) throw error;

    const { data } = supabase.storage
      .from('guide-images')
      .getPublicUrl(fileName);

    return data.publicUrl;
  }

  private static async deleteImage(url: string): Promise<void> {
    const path = url.split('/guide-images/').pop();
    if (!path) return;

    await supabase.storage
      .from('guide-images')
      .remove([path]);
  }

  private static toGuide(row: Record<string, unknown>): Guide {
    const profiles = row.profiles as { nickname: string; role: string } | null;
    return {
      id: row.id as string,
      title: row.title as string,
      categoryId: row.category_id as string,
      content: decodeContent(row.content as string),
      imageUrl: (row.image_url as string) || null,
      authorId: row.author_id as string,
      authorNickname: profiles?.nickname ?? '',
      authorRole: profiles?.role ?? '',
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
