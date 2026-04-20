import type { NoteType, SecretNote, SecretNoteFormData } from '@/types/secretNote';
import { supabase } from '@/lib/supabase';
import { AppError } from '@/utils/AppError';
import { getPlugin } from '@/service/secretNote/plugins/registry';

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

export class SecretNoteRepository {
  /**
   * 슬러그로 비밀 노트를 가져옵니다. (anon 허용, RPC 경유)
   */
  static async getNoteBySlug(slug: string): Promise<SecretNote | null> {
    const { data, error } = await supabase.rpc('get_secret_note_by_slug', { p_slug: slug });
    if (error) throw error;

    const row = (data ?? [])[0];
    if (!row) return null;

    return SecretNoteRepository.toNote(row);
  }

  /**
   * 비밀 노트 목록을 가져옵니다. (admin 전용)
   */
  static async getNotes(): Promise<SecretNote[]> {
    const { data, error } = await supabase
      .from('secret_notes')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map(SecretNoteRepository.toNote);
  }

  /**
   * 특정 비밀 노트를 가져옵니다. (편집 화면용, admin 전용)
   */
  static async getNoteById(id: string): Promise<SecretNote> {
    const { data, error } = await supabase
      .from('secret_notes')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) throw new AppError('비밀 노트를 찾을 수 없습니다.', 'NOT_FOUND');

    return SecretNoteRepository.toNote(data);
  }

  /**
   * 새 비밀 노트를 작성합니다. (admin 전용)
   * 플러그인이 pluginData → (content, structuredData) 로 직렬화합니다.
   * customSlug 가 비어있으면 DB 트리거가 자동으로 12자 랜덤 슬러그를 채웁니다.
   */
  static async createNote(formData: SecretNoteFormData, userId: string): Promise<SecretNote> {
    const plugin = getPlugin(formData.noteType);
    const { content, structuredData } = plugin.serialize(formData.pluginData);

    const insertData: Record<string, unknown> = {
      title: formData.title,
      note_type: formData.noteType,
      content: encodeContent(content),
      structured_data: structuredData,
      author_id: userId,
    };
    if (formData.customSlug && formData.customSlug.trim()) {
      insertData.slug = formData.customSlug.trim();
    }

    const { data, error } = await supabase
      .from('secret_notes')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    return SecretNoteRepository.toNote(data);
  }

  /**
   * 비밀 노트를 수정합니다. (admin 전용)
   */
  static async updateNote(id: string, formData: SecretNoteFormData, _userId: string): Promise<SecretNote> {
    const plugin = getPlugin(formData.noteType);
    const { content, structuredData } = plugin.serialize(formData.pluginData);

    const updateData: Record<string, unknown> = {
      title: formData.title,
      note_type: formData.noteType,
      content: encodeContent(content),
      structured_data: structuredData,
    };
    if (formData.customSlug && formData.customSlug.trim()) {
      updateData.slug = formData.customSlug.trim();
    }

    const { data, error } = await supabase
      .from('secret_notes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return SecretNoteRepository.toNote(data);
  }

  /**
   * 비밀 노트를 삭제합니다. (soft delete, admin 전용)
   */
  static async deleteNote(id: string): Promise<void> {
    const { error } = await supabase
      .from('secret_notes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * 삭제된 비밀 노트 목록을 가져옵니다. (admin 전용)
   */
  static async getDeletedNotes(): Promise<SecretNote[]> {
    const { data, error } = await supabase
      .from('secret_notes')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map(SecretNoteRepository.toNote);
  }

  /**
   * 삭제된 비밀 노트를 복원합니다. (admin 전용)
   */
  static async restoreNote(id: string): Promise<void> {
    const { error } = await supabase
      .from('secret_notes')
      .update({ deleted_at: null })
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * 슬러그를 재발급합니다. 기존 URL 이 즉시 무효화됩니다.
   * slug 를 null 로 업데이트하면 DB 트리거가 새 슬러그를 채웁니다.
   */
  static async regenerateSlug(id: string): Promise<string> {
    const { data, error } = await supabase
      .from('secret_notes')
      .update({ slug: null })
      .eq('id', id)
      .select('slug')
      .single();

    if (error || !data) throw new AppError('슬러그 재발급에 실패했습니다.', 'API_ERROR');

    return data.slug as string;
  }

  private static toNote(row: Record<string, unknown>): SecretNote {
    return {
      id: row.id as string,
      slug: row.slug as string,
      title: row.title as string,
      noteType: (row.note_type as NoteType) ?? 'free',
      content: decodeContent((row.content as string) ?? ''),
      structuredData: (row.structured_data as unknown) ?? null,
      authorId: (row.author_id as string) || undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
