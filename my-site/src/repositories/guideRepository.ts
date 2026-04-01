import type { Guide, GuideFormData, GuideLog } from '@/types/guide';
import { supabase } from '@/lib/supabase';
import { AppError } from '@/utils/AppError';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function encodeContent(html: string): string {
  const bytes = new TextEncoder().encode(html);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeContent(encoded: string): string {
  try {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return encoded;
  }
}

async function getAccessToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? SUPABASE_KEY;
}

async function restPost(table: string, body: Record<string, unknown>): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_KEY,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `${table} insert 실패`);
  }
}

async function restPatch(table: string, body: Record<string, unknown>, filter: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_KEY,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `${table} update 실패`);
  }
}

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
    if (error) throw error;

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

    if (error || !data) throw new AppError('가이드를 찾을 수 없습니다.', 'NOT_FOUND');

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
      imageUrl = await GuideRepository.uploadImage(formData.imageFile);
    }

    await restPost('guides', {
      title: formData.title,
      category_id: formData.categoryId,
      content: encodeContent(formData.content),
      image_url: imageUrl,
      author_id: userId,
      is_internal: formData.isInternal,
    });

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
        await GuideRepository.deleteImage(existing.imageUrl);
      }
      imageUrl = await GuideRepository.uploadImage(formData.imageFile);
    }

    await restPatch('guides', {
      title: formData.title,
      category_id: formData.categoryId,
      content: encodeContent(formData.content),
      image_url: imageUrl,
      is_internal: formData.isInternal,
    }, `id=eq.${id}`);

    await GuideRepository.insertLog(id, userId, 'update');

    return { id } as Guide;
  }

  /**
   * 가이드를 삭제합니다. (soft delete)
   */
  static async deleteGuide(id: string, userId: string): Promise<void> {
    await restPatch('guides', { deleted_at: new Date().toISOString() }, `id=eq.${id}`);
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

    if (error) throw error;

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
    await restPatch('guides', { deleted_at: null }, `id=eq.${id}`);
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
      await restPost('guide_logs', { guide_id: guideId, editor_id: editorId, action });
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
      isInternal: (row.is_internal as boolean) ?? false,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
