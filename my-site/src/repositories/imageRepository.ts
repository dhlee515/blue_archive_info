import { supabase } from '@/lib/supabase';
import { AppError } from '@/utils/AppError';

// 가이드 본문 / 썸네일 / 비밀 노트가 함께 쓰는 Storage 버킷
const BUCKET = 'guide-images';
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export class ImageRepository {
  /** `<input type="file" accept>` 용 */
  static readonly ACCEPT = ALLOWED_TYPES.join(',');

  /**
   * 형식 (JPG/PNG/GIF/WebP) · 크기 (5MB) 검사. 위반 시 VALIDATION AppError.
   * 업로드 전 파일 선택 시점에 즉시 피드백할 때도 사용.
   */
  static validate(file: File): void {
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new AppError('지원하지 않는 이미지 형식입니다. (JPG, PNG, GIF, WebP만 가능)', 'VALIDATION');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new AppError('이미지 크기는 5MB 이하만 가능합니다.', 'VALIDATION');
    }
  }

  /**
   * 이미지를 업로드하고 public URL 을 반환합니다.
   */
  static async upload(file: File): Promise<string> {
    ImageRepository.validate(file);

    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage.from(BUCKET).upload(fileName, file);
    if (error) throw new AppError('이미지 업로드에 실패했습니다.', 'API_ERROR', error);

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
    return data.publicUrl;
  }

  /**
   * public URL 로 이미지를 삭제합니다. 실패해도 무시 (고아 파일만 남음).
   */
  static async deleteByUrl(url: string): Promise<void> {
    const path = url.split(`/${BUCKET}/`).pop();
    if (!path) return;

    await supabase.storage.from(BUCKET).remove([path]);
  }
}
