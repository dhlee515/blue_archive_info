import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Plus, Wallet } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { fetchSchaleDB } from '@/lib/schaledbCache';
import { PlannerRepository } from '@/repositories/plannerRepository';
import type { SchaleDBEquipment, SchaleDBItem, SchaleDBStudent } from '@/types/schaledb';
import type { InventoryMap, PlannerStudent, PlannerTargets } from '@/types/planner';
import { aggregateAll, computeDeficit } from '../utils/cultivationCalculator';
import { enrichInventoryWithSyntheticTotals } from '../utils/expConversion';
import StudentCard from '../components/StudentCard';
import AddStudentModal from '../components/AddStudentModal';
import DeficitPanel from '../components/DeficitPanel';

type StudentsMap = Record<string, SchaleDBStudent>;
type ItemsMap = Record<string, SchaleDBItem>;
type EquipmentMap = Record<string, SchaleDBEquipment>;

const DEFAULT_TARGETS: PlannerTargets = {
  level: { current: 1, target: 1 },
};

export default function CultivationPlannerPage() {
  const user = useAuthStore((s) => s.user);

  const [plannerStudents, setPlannerStudents] = useState<PlannerStudent[]>([]);
  const [studentsData, setStudentsData] = useState<StudentsMap>({});
  const [itemsData, setItemsData] = useState<ItemsMap>({});
  const [equipmentData, setEquipmentData] = useState<EquipmentMap>({});
  const [inventory, setInventory] = useState<InventoryMap>({});
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let mounted = true;
    (async () => {
      try {
        const [sd, items, equipment, ps, inv] = await Promise.all([
          fetchSchaleDB<StudentsMap>('students'),
          fetchSchaleDB<ItemsMap>('items'),
          fetchSchaleDB<EquipmentMap>('equipment'),
          PlannerRepository.getStudents(user.id),
          PlannerRepository.getInventory(user.id),
        ]);
        if (!mounted) return;
        setStudentsData(sd);
        setItemsData(items);
        setEquipmentData(equipment);
        setPlannerStudents(ps);
        setInventory(inv);
      } catch (e) {
        console.error(e);
        if (mounted) setError('플래너 데이터를 불러오지 못했습니다.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [user]);

  const handleAdd = async (studentId: number) => {
    if (!user) return;
    try {
      const added = await PlannerRepository.addStudent(user.id, studentId, DEFAULT_TARGETS);
      setPlannerStudents((prev) => [...prev, added]);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : '학생 추가에 실패했습니다.');
    }
  };

  const handleSaveTargets = useCallback(
    async (id: string, targets: PlannerTargets) => {
      setPlannerStudents((prev) => prev.map((s) => (s.id === id ? { ...s, targets } : s)));
      await PlannerRepository.updateStudent(id, { targets });
    },
    [],
  );

  const handleRemove = async (id: string) => {
    if (!confirm('플래너에서 이 학생을 제거하시겠습니까?')) return;
    try {
      await PlannerRepository.removeStudent(id);
      setPlannerStudents((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      console.error(e);
      alert('학생 제거에 실패했습니다.');
    }
  };

  // 필요 재료 집계
  const required = useMemo(
    () => aggregateAll(plannerStudents, studentsData, equipmentData),
    [plannerStudents, studentsData, equipmentData],
  );

  const deficitReport = useMemo(
    () => computeDeficit(required, enrichInventoryWithSyntheticTotals(inventory)),
    [required, inventory],
  );

  const existingStudentIds = new Set(plannerStudents.map((p) => p.studentId));

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-blue-900 dark:text-blue-300 tracking-tight">
            육성 플래너
          </h1>
          <p className="text-gray-500 dark:text-slate-400 mt-1 text-sm">
            여러 학생의 육성 목표를 설정하고 필요한 재화를 한눈에 확인하세요.
          </p>
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
          disabled={loading}
          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg transition-colors shadow-sm"
        >
          <Plus size={18} />
          학생 추가
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-4 rounded-lg mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400 dark:text-slate-500">불러오는 중...</div>
      ) : plannerStudents.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-12 text-center">
          <p className="text-gray-500 dark:text-slate-400 mb-4">
            아직 플래너에 추가된 학생이 없습니다.
          </p>
          <button
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
          >
            <Plus size={18} />
            첫 학생 추가하기
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 mb-6">
            {plannerStudents.map((ps) => (
              <StudentCard
                key={ps.id}
                plannerStudent={ps}
                student={studentsData[String(ps.studentId)] ?? null}
                onSaveTargets={handleSaveTargets}
                onRemove={() => handleRemove(ps.id)}
              />
            ))}
          </div>

          <div className="flex justify-end mb-3">
            <Link
              to="/planner/inventory"
              className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              <Wallet size={16} />
              재화 인벤토리 편집 →
            </Link>
          </div>

          <DeficitPanel
            report={deficitReport}
            itemsData={itemsData}
            equipmentData={equipmentData}
          />
        </>
      )}

      {isAddOpen && (
        <AddStudentModal
          studentsData={studentsData}
          existingStudentIds={existingStudentIds}
          onClose={() => setIsAddOpen(false)}
          onAdd={handleAdd}
        />
      )}
    </div>
  );
}
