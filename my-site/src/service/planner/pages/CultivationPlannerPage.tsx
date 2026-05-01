import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Plus, Wallet, X } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuthStore } from '@/stores/authStore';
import { fetchSchaleDB } from '@/lib/schaledbCache';
import { studentIconUrl } from '@/lib/schaledbImage';
import type { SchaleDBEquipment, SchaleDBItem, SchaleDBStudent } from '@/types/schaledb';
import type { InventoryMap, PlannerStudent, PlannerTargets } from '@/types/planner';
import { aggregateAll, computeDeficit } from '../utils/cultivationCalculator';
import { enrichInventoryWithSyntheticTotals } from '../utils/expConversion';
import { getPlannerRepo } from '../utils/plannerRepoFactory';
import AddStudentModal from '../components/AddStudentModal';
import BackupButtons from '../components/BackupButtons';
import DeficitPanel from '../components/DeficitPanel';

type StudentsMap = Record<string, SchaleDBStudent>;
type ItemsMap = Record<string, SchaleDBItem>;
type EquipmentMap = Record<string, SchaleDBEquipment>;

const DEFAULT_TARGETS: PlannerTargets = {
  level: { current: 1, target: 1 },
};

export default function CultivationPlannerPage() {
  const user = useAuthStore((s) => s.user);
  const repo = useMemo(() => getPlannerRepo(user?.id ?? null), [user?.id]);
  const isGuest = !user;

  const [plannerStudents, setPlannerStudents] = useState<PlannerStudent[]>([]);
  const [studentsData, setStudentsData] = useState<StudentsMap>({});
  const [itemsData, setItemsData] = useState<ItemsMap>({});
  const [equipmentData, setEquipmentData] = useState<EquipmentMap>({});
  const [inventory, setInventory] = useState<InventoryMap>({});
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [sd, items, equipment, ps, inv] = await Promise.all([
          fetchSchaleDB<StudentsMap>('students'),
          fetchSchaleDB<ItemsMap>('items'),
          fetchSchaleDB<EquipmentMap>('equipment'),
          repo.getStudents(),
          repo.getInventory(),
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
  }, [repo]);

  const handleAdd = async (studentId: number) => {
    try {
      const added = await repo.addStudent(studentId, DEFAULT_TARGETS);
      setPlannerStudents((prev) => [...prev, added]);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : '학생 추가에 실패했습니다.');
    }
  };

  const handleRemove = async (id: string, name: string) => {
    if (!confirm(`${name} 을(를) 플래너에서 제거하시겠습니까?`)) return;
    try {
      await repo.removeStudent(id);
      setPlannerStudents((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      console.error(e);
      alert('학생 제거에 실패했습니다.');
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = plannerStudents.findIndex((s) => s.id === active.id);
    const newIndex = plannerStudents.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(plannerStudents, oldIndex, newIndex);
    setPlannerStudents(reordered);

    try {
      await repo.reorderStudents(reordered.map((s) => s.id));
    } catch (e) {
      console.error(e);
      // 실패 시 원복은 안 함 — 사용자가 다시 드래그하면 보정됨
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

      {isGuest && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 px-4 py-2 rounded-lg mb-4 text-sm flex items-center justify-between gap-2">
          <span>
            로그인하지 않은 상태입니다. 데이터는 이 브라우저에만 저장되며 다른 기기에서는 보이지 않습니다.
          </span>
          <Link
            to="/login"
            className="shrink-0 font-bold text-amber-900 dark:text-amber-200 underline hover:no-underline"
          >
            로그인 →
          </Link>
        </div>
      )}

      <div className="mb-4">
        <BackupButtons
          repo={repo}
          disabled={loading}
          onAfterImport={async (backup) => {
            // 학생 row 는 새 id 로 발급되므로 다시 fetch.
            const fresh = await repo.getStudents();
            setPlannerStudents(fresh);
            setInventory(backup.inventory);
          }}
        />
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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={plannerStudents.map((s) => s.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 mb-6">
                {plannerStudents.map((ps) => {
                  const student = studentsData[String(ps.studentId)] ?? null;
                  const name = student?.Name ?? `학생 #${ps.studentId}`;
                  return (
                    <SortableStudentIcon
                      key={ps.id}
                      id={ps.id}
                      studentId={ps.studentId}
                      name={name}
                      onRemove={() => handleRemove(ps.id, name)}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>

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

interface SortableStudentIconProps {
  id: string;
  studentId: number;
  name: string;
  onRemove: () => void;
}

function SortableStudentIcon({ id, studentId, name, onRemove }: SortableStudentIconProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group touch-none">
      <Link
        to={`/planner/cultivation/${id}`}
        {...attributes}
        {...listeners}
        className="block bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-2 shadow-sm hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all cursor-grab active:cursor-grabbing"
      >
        <img
          src={studentIconUrl(studentId)}
          alt={name}
          className="w-full aspect-square rounded object-cover pointer-events-none"
          draggable={false}
        />
        <div className="mt-1.5 text-xs text-center text-gray-700 dark:text-slate-300 truncate font-bold">
          {name}
        </div>
      </Link>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute top-1 right-1 p-0.5 rounded-full bg-white/90 dark:bg-slate-900/90 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/40 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 transition-opacity shadow"
        aria-label={`${name} 제거`}
      >
        <X size={14} />
      </button>
    </div>
  );
}
