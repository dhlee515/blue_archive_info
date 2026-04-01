import { useState, useEffect } from 'react';
import type { Category } from '@/types/guide';
import { CategoryRepository } from '@/repositories/categoryRepository';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const PROTECTED = ['전체', '공지'];

function SortableItem({
  cat,
  isLast,
  editingId,
  editingName,
  setEditingId,
  setEditingName,
  savingId,
  deletingId,
  onRename,
  onDelete,
}: {
  cat: Category;
  isLast: boolean;
  editingId: string | null;
  editingName: string;
  setEditingId: (id: string | null) => void;
  setEditingName: (name: string) => void;
  savingId: string | null;
  deletingId: string | null;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isProtected = PROTECTED.includes(cat.name);
  const isEditing = editingId === cat.id;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-4 py-3 bg-white ${!isLast ? 'border-b border-gray-100' : ''}`}
    >
      {/* 드래그 핸들 */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 touch-none"
        title="드래그하여 순서 변경"
      >
        ⠿
      </button>

      {/* 이름 */}
      {isEditing ? (
        <div className="flex-1 flex gap-2">
          <input
            type="text"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onRename(cat.id); if (e.key === 'Escape') setEditingId(null); }}
            className="flex-1 p-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            autoFocus
          />
          <button
            onClick={() => onRename(cat.id)}
            disabled={savingId === cat.id}
            className="px-2 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-50"
          >
            저장
          </button>
          <button
            onClick={() => setEditingId(null)}
            className="px-2 py-1 bg-gray-200 text-gray-600 text-xs font-medium rounded hover:bg-gray-300"
          >
            취소
          </button>
        </div>
      ) : (
        <span className="font-medium text-gray-800 flex-1">{cat.name}</span>
      )}

      {/* 액션 버튼 */}
      {!isEditing && (
        <div className="flex gap-1.5">
          {isProtected ? (
            <span className="text-xs text-gray-400">기본</span>
          ) : (
            <>
              <button
                onClick={() => { setEditingId(cat.id); setEditingName(cat.name); }}
                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium rounded-lg transition-colors"
              >
                수정
              </button>
              <button
                onClick={() => onDelete(cat.id)}
                disabled={deletingId === cat.id}
                className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                삭제
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

export default function CategoryManagePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const a = categories[oldIndex];
    const b = categories[newIndex];

    // 낙관적 UI 업데이트
    const newCategories = [...categories];
    newCategories.splice(oldIndex, 1);
    newCategories.splice(newIndex, 0, a);
    setCategories(newCategories);

    try {
      await CategoryRepository.swapOrder(a.id, a.sortOrder, b.id, b.sortOrder);
      await fetchCategories();
    } catch (error) {
      console.error('Failed to reorder:', error);
      alert('순서 변경에 실패했습니다.');
      await fetchCategories();
    }
  };

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

  const handleRename = async (id: string) => {
    if (!editingName.trim()) return;
    setSavingId(id);
    try {
      await CategoryRepository.updateName(id, editingName.trim());
      setEditingId(null);
      await fetchCategories();
    } catch (error) {
      console.error('Failed to rename category:', error);
      alert('이름 변경에 실패했습니다.');
    } finally {
      setSavingId(null);
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
        <p className="px-4 py-2 text-xs text-gray-400 border-b border-gray-100">
          ⠿ 를 드래그하여 순서를 변경할 수 있습니다
        </p>
        {categories.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <ul>
                {categories.map((cat, idx) => (
                  <SortableItem
                    key={cat.id}
                    cat={cat}
                    isLast={idx === categories.length - 1}
                    editingId={editingId}
                    editingName={editingName}
                    setEditingId={setEditingId}
                    setEditingName={setEditingName}
                    savingId={savingId}
                    deletingId={deletingId}
                    onRename={handleRename}
                    onDelete={handleDelete}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="text-center py-8 text-gray-400">카테고리가 없습니다.</div>
        )}
      </div>
    </div>
  );
}
