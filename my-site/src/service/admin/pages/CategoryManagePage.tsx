import CategoryManager from '../components/CategoryManager';
import { CategoryRepository } from '@/repositories/categoryRepository';

export default function CategoryManagePage() {
  return <CategoryManager repository={CategoryRepository} title="카테고리 관리" />;
}
