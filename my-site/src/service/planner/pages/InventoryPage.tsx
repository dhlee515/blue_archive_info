import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, Loader2, Search } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { fetchSchaleDB } from '@/lib/schaledbCache';
import { PlannerRepository } from '@/repositories/plannerRepository';
import type { SchaleDBEquipment, SchaleDBItem, SchaleDBStudent } from '@/types/schaledb';
import type { InventoryMap } from '@/types/planner';
import { buildInventoryCatalog, type CatalogGroup } from '../utils/inventoryCatalog';
import { getMaterialInfo } from '../utils/materialInfo';
import InventoryItemRow from '../components/InventoryItemRow';

type ItemsMap = Record<string, SchaleDBItem>;
type EquipmentMap = Record<string, SchaleDBEquipment>;
type StudentsMap = Record<string, SchaleDBStudent>;
type SaveStatus = 'idle' | 'saving' | 'saved';

export default function InventoryPage() {
  const user = useAuthStore((s) => s.user);

  const [itemsData, setItemsData] = useState<ItemsMap>({});
  const [equipmentData, setEquipmentData] = useState<EquipmentMap>({});
  const [studentsData, setStudentsData] = useState<StudentsMap>({});
  const [inventory, setInventory] = useState<InventoryMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['synthetic']));
  const [status, setStatus] = useState<SaveStatus>('idle');

  const savedRef = useRef<InventoryMap>({});

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      try {
        const [items, equipment, students, inv] = await Promise.all([
          fetchSchaleDB<ItemsMap>('items'),
          fetchSchaleDB<EquipmentMap>('equipment'),
          fetchSchaleDB<StudentsMap>('students'),
          PlannerRepository.getInventory(user.id),
        ]);
        if (!mounted) return;
        setItemsData(items);
        setEquipmentData(equipment);
        setStudentsData(students);
        setInventory(inv);
        savedRef.current = inv;
      } catch (e) {
        console.error(e);
        if (mounted) setError('인벤토리 데이터를 불러오지 못했습니다.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user]);

  // 디바운스 저장 (500ms)
  useEffect(() => {
    if (!user) return;
    if (inventory === savedRef.current) return;
    setStatus('saving');
    const timer = setTimeout(async () => {
      try {
        await PlannerRepository.updateInventory(user.id, inventory);
        savedRef.current = inventory;
        setStatus('saved');
      } catch (e) {
        console.error('인벤토리 저장 실패:', e);
        setStatus('idle');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [inventory, user]);

  // "저장됨" 자동 소멸
  useEffect(() => {
    if (status !== 'saved') return;
    const timer = setTimeout(() => setStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  const catalog = useMemo(
    () => buildInventoryCatalog(equipmentData, studentsData, itemsData),
    [equipmentData, studentsData, itemsData],
  );

  // 초기 로드 시 defaultOpen 그룹 자동 펼침 (catalog 빌드 후 최초 1회)
  const appliedDefaultRef = useRef(false);
  useEffect(() => {
    if (appliedDefaultRef.current || catalog.length === 0) return;
    appliedDefaultRef.current = true;
    setOpenGroups((prev) => {
      const next = new Set(prev);
      for (const g of catalog) if (g.defaultOpen) next.add(g.id);
      return next;
    });
  }, [catalog]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleChange = useCallback((key: string, value: number) => {
    setInventory((prev) => ({ ...prev, [key]: value }));
  }, []);

  const searchLower = search.trim().toLowerCase();
  const matches = (key: string): boolean => {
    if (!searchLower) return true;
    const info = getMaterialInfo(key, itemsData, equipmentData);
    return info.name.toLowerCase().includes(searchLower);
  };

  const renderGroup = (group: CatalogGroup) => {
    const filteredKeys = group.keys.filter(matches);
    if (searchLower && filteredKeys.length === 0) return null;

    // 검색 중이면 자동 펼침, 아니면 수동 상태 유지
    const isOpen = searchLower ? true : openGroups.has(group.id);

    return (
      <div
        key={group.id}
        className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden"
      >
        <button
          type="button"
          onClick={() => toggleGroup(group.id)}
          className="w-full flex items-center gap-2 p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
          aria-expanded={isOpen}
        >
          <span className="flex-1 text-left">
            <span className="block font-bold text-gray-800 dark:text-slate-100">
              {group.name}
            </span>
            {group.hint && (
              <span className="block text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                {group.hint}
              </span>
            )}
          </span>
          <span className="text-xs text-gray-500 dark:text-slate-400">
            {filteredKeys.length} 개
          </span>
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? '' : '-rotate-90'}`}
          />
        </button>
        {isOpen && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {filteredKeys.map((key) => {
              const info = getMaterialInfo(key, itemsData, equipmentData);
              return (
                <InventoryItemRow
                  key={key}
                  info={info}
                  value={inventory[key] ?? 0}
                  onChange={(v) => handleChange(key, v)}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-blue-900 dark:text-blue-300 tracking-tight">
            재화 인벤토리
          </h1>
          <p className="text-gray-500 dark:text-slate-400 mt-1 text-sm">
            현재 보유한 재화를 입력하세요. 플래너의 부족분 계산에 공유됩니다.
          </p>
        </div>
        <SaveBadge status={status} />
      </div>

      <div className="relative mb-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="아이템 이름으로 검색..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
        />
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-4 rounded-lg mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400 dark:text-slate-500">불러오는 중...</div>
      ) : (
        <div className="space-y-3">
          {catalog.map(renderGroup)}
        </div>
      )}
    </div>
  );
}

function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400">
        <Loader2 size={14} className="animate-spin" />
        저장 중
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
        <Check size={14} />
        저장됨
      </span>
    );
  }
  return null;
}
