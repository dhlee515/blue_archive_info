import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { fetchSchaleDB } from '@/lib/schaledbCache';
import type { SchaleDBConfig, SchaleDBEquipment, SchaleDBItem, SchaleDBStudent } from '@/types/schaledb';
import type { InventoryMap, PlannerStudent, PlannerTargets } from '@/types/planner';
import { aggregateAllWithBond, computeDeficit } from '../utils/cultivationCalculator';
import { enrichInventoryWithSyntheticTotals } from '../utils/expConversion';
import { getPlannerRepo } from '../utils/plannerRepoFactory';
import StudentCard from '../components/StudentCard';
import DeficitPanel from '../components/DeficitPanel';

const DEFAULT_TARGETS: PlannerTargets = {
  level: { current: 1, target: 1 },
};

type StudentsMap = Record<string, SchaleDBStudent>;
type ItemsMap = Record<string, SchaleDBItem>;
type EquipmentMap = Record<string, SchaleDBEquipment>;

export default function PlannerStudentDetailPage() {
  const { plannerStudentId } = useParams<{ plannerStudentId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const repo = useMemo(() => getPlannerRepo(user?.id ?? null), [user?.id]);

  const [studentsData, setStudentsData] = useState<StudentsMap>({});
  const [itemsData, setItemsData] = useState<ItemsMap>({});
  const [equipmentData, setEquipmentData] = useState<EquipmentMap>({});
  const [inventory, setInventory] = useState<InventoryMap>({});
  const [commonFavorTags, setCommonFavorTags] = useState<readonly string[]>([]);
  const [plannerStudent, setPlannerStudent] = useState<PlannerStudent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 초기화 시 StudentCard 내부 state(useState 초기값) 를 새로 마운트해 갱신.
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    if (!plannerStudentId) return;
    let mounted = true;
    (async () => {
      try {
        const [sd, items, equipment, config, list, inv] = await Promise.all([
          fetchSchaleDB<StudentsMap>('students'),
          fetchSchaleDB<ItemsMap>('items'),
          fetchSchaleDB<EquipmentMap>('equipment'),
          fetchSchaleDB<SchaleDBConfig>('config'),
          repo.getStudents(),
          repo.getInventory(),
        ]);
        if (!mounted) return;
        setStudentsData(sd);
        setItemsData(items);
        setEquipmentData(equipment);
        setCommonFavorTags(config.CommonFavorItemTags ?? []);
        setInventory(inv);
        const found = list.find((p) => p.id === plannerStudentId) ?? null;
        setPlannerStudent(found);
        if (!found) setError('해당 학생을 플래너에서 찾을 수 없습니다.');
      } catch (e) {
        console.error(e);
        if (mounted) setError('데이터를 불러오지 못했습니다.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [plannerStudentId, repo]);

  const handleSaveTargets = useCallback(
    async (id: string, targets: PlannerTargets) => {
      setPlannerStudent((prev) => (prev && prev.id === id ? { ...prev, targets } : prev));
      await repo.updateStudent(id, { targets });
    },
    [repo],
  );

  const handleRemove = async () => {
    if (!plannerStudent) return;
    if (!confirm('플래너에서 이 학생을 제거하시겠습니까?')) return;
    try {
      await repo.removeStudent(plannerStudent.id);
      navigate('/planner/cultivation');
    } catch (e) {
      console.error(e);
      alert('학생 제거에 실패했습니다.');
    }
  };

  const handleReset = async () => {
    if (!plannerStudent) return;
    if (!confirm('이 학생의 모든 목표를 초기 상태로 되돌리시겠습니까?')) return;
    try {
      await repo.updateStudent(plannerStudent.id, { targets: DEFAULT_TARGETS });
      setPlannerStudent({ ...plannerStudent, targets: DEFAULT_TARGETS });
      setResetKey((k) => k + 1);
    } catch (e) {
      console.error(e);
      alert('초기화에 실패했습니다.');
    }
  };

  // 이 학생 단일의 필요 재료 (인연 권장 포함) → 공유 인벤토리와 비교한 부족분.
  const student = plannerStudent ? studentsData[String(plannerStudent.studentId)] ?? null : null;
  const aggregate = useMemo(() => {
    if (!plannerStudent) return null;
    return aggregateAllWithBond(
      [plannerStudent],
      studentsData,
      equipmentData,
      itemsData,
      inventory,
      commonFavorTags,
    );
  }, [plannerStudent, studentsData, equipmentData, itemsData, inventory, commonFavorTags]);

  const deficitReport = useMemo(() => {
    if (!aggregate) return null;
    return computeDeficit(aggregate.required, enrichInventoryWithSyntheticTotals(inventory));
  }, [aggregate, inventory]);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-4 flex items-center justify-between">
        <Link
          to="/planner/cultivation"
          className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          <ArrowLeft size={16} />
          플래너로 돌아가기
        </Link>
        {plannerStudent && (
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 text-xs font-bold text-gray-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 px-2 py-1 rounded-md border border-gray-300 dark:border-slate-600 hover:border-red-400 dark:hover:border-red-500"
          >
            <RotateCcw size={14} />
            초기화
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 dark:text-slate-500">불러오는 중...</div>
      ) : error || !plannerStudent ? (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-4 rounded-lg">
          {error ?? '학생 정보를 찾을 수 없습니다.'}
        </div>
      ) : (
        <>
          <StudentCard
            key={resetKey}
            plannerStudent={plannerStudent}
            student={student}
            onSaveTargets={handleSaveTargets}
            onRemove={handleRemove}
          />

          {student && <BondInfoPanel student={student} />}

          {deficitReport && aggregate && plannerStudent && (
            <div className="mt-6">
              <DeficitPanel
                report={deficitReport}
                itemsData={itemsData}
                equipmentData={equipmentData}
                breakdown={aggregate.breakdown}
                bondPlans={aggregate.bondPlans}
                plannerStudents={[plannerStudent]}
                studentsData={studentsData}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

const FAVOR_STAT_LABEL: Record<string, string> = {
  MaxHP: '체력',
  AttackPower: '공격력',
  DefensePower: '방어력',
  HealPower: '치유력',
  AccuracyPoint: '명중',
  DodgePoint: '회피',
  CriticalPoint: '치명',
  CriticalDamageRate: '치명 데미지',
  StabilityPoint: '안정성',
  Range: '사거리',
};

/** 인연 보너스 메타 정보 패널 — 정확한 수치는 v2 로 미루고 학생의 favor 스탯 종류 + 메모리얼 로비만 표시. */
function BondInfoPanel({ student }: { student: SchaleDBStudent }) {
  const statTypes = student.FavorStatType ?? [];
  const lobbyRank = student.MemoryLobby?.[0] ?? 0;
  if (statTypes.length === 0 && lobbyRank <= 0) return null;

  return (
    <div className="mt-4 bg-pink-50/40 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800/60 rounded-xl p-3 md:p-4">
      <h4 className="text-sm font-bold text-pink-800 dark:text-pink-300 mb-2">인연 보너스</h4>
      {statTypes.length > 0 && (
        <p className="text-xs text-pink-900 dark:text-pink-200">
          보너스 스탯:{' '}
          <span className="font-semibold">
            {statTypes.map((s) => FAVOR_STAT_LABEL[s] ?? s).join(' / ')}
          </span>
          <span className="text-pink-700 dark:text-pink-400 ml-1.5">
            (특정 인연랭크 구간 도달 시 영구 증가)
          </span>
        </p>
      )}
      {lobbyRank > 0 && (
        <p className="text-xs text-pink-900 dark:text-pink-200 mt-1">
          메모리얼 로비 해금 인연랭크: <span className="font-semibold">{lobbyRank}</span>
        </p>
      )}
    </div>
  );
}
