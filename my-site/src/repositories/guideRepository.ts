import type { Guide, GuideFormData, GuideLog } from '@/types/guide';
import { supabase } from '@/lib/supabase';
import { AppError } from '@/utils/AppError';
import { encodeContent, decodeContent } from '@/utils/contentCodec';
import { restInsert, restUpdate } from '@/lib/supabaseRest';
import { ImageRepository } from '@/repositories/imageRepository';

export class GuideRepository {
  /**
   * 가이드 목록을 가져옵니다.
   */
  static async getGuides(categoryId?: string, isInternal: boolean = false): Promise<Guide[]> {
    let query = supabase
      .from('guides')
      .select('*')
      .is('deleted_at', null)
      .eq('is_internal', isInternal)
      .order('created_at', { ascending: false });

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query;
    if (error) throw new AppError('가이드 목록을 불러오지 못했습니다.', 'API_ERROR', error);

    const rows = data ?? [];
    const authorIds = [...new Set(rows.map((r) => r.author_id as string))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, nickname, role')
      .in('id', authorIds);

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    return rows.map((row) => {
      const profile = profileMap.get(row.author_id as string);
      return GuideRepository.toGuide({ ...row, profiles: profile ?? null });
    });
  }

  /**
   * 특정 가이드를 가져옵니다.
   */
  static async getGuideById(id: string): Promise<Guide> {
    const { data, error } = await supabase
      .from('guides')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) throw new AppError('가이드를 찾을 수 없습니다.', 'NOT_FOUND', error);

    const { data: profile } = await supabase
      .from('profiles')
      .select('nickname, role')
      .eq('id', data.author_id)
      .single();

    return GuideRepository.toGuide({ ...data, profiles: profile });
  }

  /**
   * 새 가이드를 작성합니다.
   */
  static async createGuide(formData: GuideFormData, userId: string): Promise<Guide> {
    let imageUrl: string | null = null;
    if (formData.imageFile) {
      imageUrl = await ImageRepository.upload(formData.imageFile);
    }

    await restInsert('guides', {
      title: formData.title,
      category_id: formData.categoryId,
      content: encodeContent(formData.content),
      image_url: imageUrl,
      author_id: userId,
      is_internal: formData.isInternal,
    }, '가이드 작성에 실패했습니다.');

    // insert 후 방금 생성된 글의 id 조회
    const { data: latest } = await supabase
      .from('guides')
      .select('id')
      .eq('author_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const guideId = (latest?.id as string) ?? '';
    if (guideId) await GuideRepository.insertLog(guideId, userId, 'create');

    return { id: guideId } as Guide;
  }

  /**
   * 가이드를 수정합니다.
   */
  static async updateGuide(id: string, formData: GuideFormData, userId: string): Promise<Guide> {
    const existing = await GuideRepository.getGuideById(id);

    let imageUrl = existing.imageUrl;
    if (formData.imageFile) {
      if (existing.imageUrl) {
        await ImageRepository.deleteByUrl(existing.imageUrl);
      }
      imageUrl = await ImageRepository.upload(formData.imageFile);
    } else if (formData.removeImage && existing.imageUrl) {
      await ImageRepository.deleteByUrl(existing.imageUrl);
      imageUrl = null;
    }

    await restUpdate('guides', {
      title: formData.title,
      category_id: formData.categoryId,
      content: encodeContent(formData.content),
      image_url: imageUrl,
      is_internal: formData.isInternal,
    }, `id=eq.${id}`, '가이드 수정에 실패했습니다.');

    await GuideRepository.insertLog(id, userId, 'update');

    return { id } as Guide;
  }

  /**
   * 가이드를 삭제합니다. (soft delete)
   */
  static async deleteGuide(id: string, userId: string): Promise<void> {
    await restUpdate('guides', { deleted_at: new Date().toISOString() }, `id=eq.${id}`, '가이드 삭제에 실패했습니다.');
    await GuideRepository.insertLog(id, userId, 'delete');
  }

  /**
   * 삭제된 글 목록을 가져옵니다. (관리자용)
   */
  static async getDeletedGuides(): Promise<Guide[]> {
    const { data, error } = await supabase
      .from('guides')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (error) throw new AppError('삭제된 가이드 목록을 불러오지 못했습니다.', 'API_ERROR', error);

    const rows = data ?? [];
    const authorIds = [...new Set(rows.map((r) => r.author_id as string))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, nickname, role')
      .in('id', authorIds);

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    return rows.map((row) => {
      const profile = profileMap.get(row.author_id as string);
      return GuideRepository.toGuide({ ...row, profiles: profile ?? null });
    });
  }

  /**
   * 삭제된 글을 복원합니다. (관리자용)
   */
  static async restoreGuide(id: string, userId: string): Promise<void> {
    await restUpdate('guides', { deleted_at: null }, `id=eq.${id}`, '가이드 복원에 실패했습니다.');
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

    if (error) throw new AppError('가이드 로그를 불러오지 못했습니다.', 'API_ERROR', error);

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
      await restInsert('guide_logs', { guide_id: guideId, editor_id: editorId, action }, '가이드 로그 기록에 실패했습니다.');
    } catch (e) {
      console.error('Failed to insert log:', e);
    }
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
      isInternal: (row.is_internal as boolean) ?? false,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
