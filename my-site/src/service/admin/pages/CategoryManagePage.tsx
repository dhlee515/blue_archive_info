import { useState, useEffect } from 'react';
import type { Category } from '@/types/guide';
import { CategoryRepository } from '@/repositories/categoryRepository';

export default function CategoryManagePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  async function fetchCategories() {
    try {
      const data = await CategoryRepository.getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setAdding(true);
    try {
      await CategoryRepository.createCategory(newName.trim());
      setNewName('');
      await fetchCategories();
    } catch (error) {
      console.error('Failed to create category:', error);
      alert('카테고리 추가에 실패했습니다.');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    setDeletingId(id);
    try {
      await CategoryRepository.deleteCategory(id);
      await fetchCategories();
    } catch (error) {
      console.error('Failed to delete category:', error);
      alert('카테고리 삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">데이터를 불러오는 중...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-extrabold text-blue-900 mb-6 tracking-tight">카테고리 관리</h1>

      {/* 추가 폼 */}
      <form onSubmit={handleAdd} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 flex gap-3">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          placeholder="새 카테고리 이름"
          required
        />
        <button
          type="submit"
          disabled={adding}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-2.5 px-5 rounded-lg transition-colors"
        >
          {adding ? '추가 중...' : '추가'}
        </button>
      </form>

      {/* 목록 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {categories.length > 0 ? (
          <ul>
            {categories.map((cat, idx) => (
              <li
                key={cat.id}
                className={`flex items-center justify-between px-4 py-3 ${
                  idx !== categories.length - 1 ? 'border-b border-gray-100' : ''
                }`}
              >
                <span className="font-medium text-gray-800">{cat.name}</span>
                {cat.name !== '전체' && cat.name !== '공지' ? (
                  <button
                    onClick={() => handleDelete(cat.id)}
                    disabled={deletingId === cat.id}
                    className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    삭제
                  </button>
                ) : (
                  <span className="text-xs text-gray-400">기본 카테고리</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-center py-8 text-gray-400">카테고리가 없습니다.</div>
        )}
      </div>
    </div>
  );
}
