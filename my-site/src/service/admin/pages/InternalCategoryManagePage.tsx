import CategoryManager from '../components/CategoryManager';
import { InternalCategoryRepository } from '@/repositories/internalCategoryRepository';

export default function InternalCategoryManagePage() {
  return <CategoryManager repository={InternalCategoryRepository} title="내부 공지 카테고리 관리" />;
}
