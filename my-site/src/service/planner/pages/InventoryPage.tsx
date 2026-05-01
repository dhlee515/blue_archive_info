import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Check, Loader2, Search, X } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { fetchSchaleDB } from '@/lib/schaledbCache';
import type { SchaleDBEquipment, SchaleDBItem, SchaleDBStudent } from '@/types/schaledb';
import type { InventoryMap } from '@/types/planner';
import { buildInventoryCatalog } from '../utils/inventoryCatalog';
import { getMaterialInfo } from '../utils/materialInfo';
import { getPlannerRepo } from '../utils/plannerRepoFactory';
import InventoryItemRow from '../components/InventoryItemRow';

type ItemsMap = Record<string, SchaleDBItem>;
type EquipmentMap = Record<string, SchaleDBEquipment>;
type StudentsMap = Record<string, SchaleDBStudent>;
type SaveStatus = 'idle' | 'saving' | 'saved';

export default function InventoryPage() {
  const user = useAuthStore((s) => s.user);
  const repo = useMemo(() => getPlannerRepo(user?.id ?? null), [user?.id]);
  const isGuest = !user;

  const [itemsData, setItemsData] = useState<ItemsMap>({});
  const [equipmentData, setEquipmentData] = useState<EquipmentMap>({});
  const [studentsData, setStudentsData] = useState<StudentsMap>({});
  const [inventory, setInventory] = useState<InventoryMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<SaveStatus>('idle');

  const savedRef = useRef<InventoryMap>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [items, equipment, students, inv] = await Promise.all([
          fetchSchaleDB<ItemsMap>('items'),
          fetchSchaleDB<EquipmentMap>('equipment'),
          fetchSchaleDB<StudentsMap>('students'),
          repo.getInventory(),
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
  }, [repo]);

  // 디바운스 저장 (1500ms — egress 절감용. 잦은 입력 변경 시 last-write 만 저장)
  useEffect(() => {
    if (inventory === savedRef.current) return;
    setStatus('saving');
    const timer = setTimeout(async () => {
      try {
        await repo.updateInventory(inventory);
        savedRef.current = inventory;
        setStatus('saved');
      } catch (e) {
        console.error('인벤토리 저장 실패:', e);
        setStatus('idle');
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [inventory, repo]);

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

  const toggleCategory = (id: string) => {
    setSelectedGroupIds((prev) => {
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

  // 카테고리 필터 — 비어있으면 전체, 아니면 선택된 그룹만 합집합. 검색 매칭까지 적용해 최종 표시 키 평탄화.
  const visibleKeys = useMemo(() => {
    const groups = selectedGroupIds.size === 0
      ? catalog
      : catalog.filter((g) => selectedGroupIds.has(g.id));
    const seen = new Set<string>();
    const out: string[] = [];
    for (const g of groups) {
      for (const k of g.keys) {
        if (seen.has(k)) continue;
        if (!matches(k)) continue;
        seen.add(k);
        out.push(k);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, selectedGroupIds, search, itemsData, equipmentData]);

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

      {isGuest && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 px-4 py-2 rounded-lg mb-4 text-sm flex items-center justify-between gap-2">
          <span>
            로그인하지 않은 상태입니다. 입력값은 이 브라우저에만 저장됩니다.
          </span>
          <Link
            to="/login"
            className="shrink-0 font-bold text-amber-900 dark:text-amber-200 underline hover:no-underline"
          >
            로그인 →
          </Link>
        </div>
      )}

      {/* 검색 + 카테고리 필터 */}
      <div className="sticky top-16 z-10 bg-gray-50 dark:bg-slate-900 -mx-2 px-2 py-2 mb-4 space-y-2">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="아이템 이름으로 검색"
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100 shadow-sm"
          />
        </div>

        {!loading && catalog.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-500 dark:text-slate-400 mr-1">카테고리:</span>
            {catalog.map((g) => {
              const active = selectedGroupIds.has(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggleCategory(g.id)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                      : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500'
                  }`}
                >
                  {g.name}
                  <span className={`ml-1 ${active ? 'opacity-80' : 'opacity-50'}`}>{g.keys.length}</span>
                </button>
              );
            })}
            {selectedGroupIds.size > 0 && (
              <button
                type="button"
                onClick={() => setSelectedGroupIds(new Set())}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded-full text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <X size={12} /> 필터 해제
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-4 rounded-lg mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400 dark:text-slate-500">불러오는 중...</div>
      ) : visibleKeys.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-500 dark:text-slate-400">
          {searchLower
            ? `"${search}" 에 매칭되는 아이템이 없습니다.`
            : '선택된 카테고리에 표시할 아이템이 없습니다.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {visibleKeys.map((key) => {
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
