import { supabase } from '@/lib/supabase';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export async function uploadGuideImage(file: File): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('지원하지 않는 이미지 형식입니다. (JPG, PNG, GIF, WebP만 가능)');
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('이미지 크기는 5MB 이하만 가능합니다.');
  }

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
