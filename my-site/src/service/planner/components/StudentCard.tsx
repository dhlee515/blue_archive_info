import { useEffect, useRef, useState } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import type { SchaleDBStudent } from '@/types/schaledb';
import type { PlannerStudent, PlannerTargets, GearRange, WeaponRange, LevelRange, EquipmentTiers } from '@/types/planner';
import { studentIconUrl } from '@/lib/schaledbImage';
import { WEAPON_PART_SERIES, getBonusSeriesIdsFor } from '../utils/expConversion';
import LevelTargetInput from './LevelTargetInput';
import GearTargetInput from './GearTargetInput';
import WeaponTargetInput from './WeaponTargetInput';
import EquipmentTargetInput from './EquipmentTargetInput';

const DEFAULT_GEAR: GearRange = { currentTier: 0, targetTier: 0 };
const DEFAULT_WEAPON: WeaponRange = { currentLevel: 0, targetLevel: 0 };

type SaveStatus = 'idle' | 'saving' | 'saved';

interface Props {
  plannerStudent: PlannerStudent;
  student: SchaleDBStudent | null;
  /** 목표치 저장 콜백. 부모가 optimistic update + DB 저장을 수행합니다. */
  onSaveTargets: (id: string, targets: PlannerTargets) => Promise<void>;
  onRemove: () => void;
}

export default function StudentCard({ plannerStudent, student, onSaveTargets, onRemove }: Props) {
  const [targets, setTargets] = useState<PlannerTargets>(plannerStudent.targets);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const savedRef = useRef<PlannerTargets>(plannerStudent.targets);

  // 디바운스 저장 (500ms)
  useEffect(() => {
    if (targets === savedRef.current) return;

    setStatus('saving');
    const timer = setTimeout(async () => {
      try {
        await onSaveTargets(plannerStudent.id, targets);
        savedRef.current = targets;
        setStatus('saved');
      } catch (e) {
        console.error('플래너 저장 실패:', e);
        setStatus('idle');
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [targets, onSaveTargets, plannerStudent.id]);

  // "저장됨" 표시 자동 소멸
  useEffect(() => {
    if (status !== 'saved') return;
    const timer = setTimeout(() => setStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  const handleLevelChange = (level: LevelRange) => {
    setTargets((t) => ({ ...t, level }));
  };
  const handleGearChange = (gear: GearRange) => {
    setTargets((t) => ({ ...t, gear }));
  };
  const handleWeaponChange = (weapon: WeaponRange) => {
    setTargets((t) => ({ ...t, weapon }));
  };
  const handleEquipmentChange = (current: EquipmentTiers, target: EquipmentTiers) => {
    setTargets((t) => ({ ...t, equipment: { current, target } }));
  };

  const gearEnabled = student?.Gear?.TierUpMaterial && student.Gear.TierUpMaterial.length > 0;
  const equipmentSlots = student?.Equipment ?? [];
  const equipmentCurrent = targets.equipment?.current ?? new Array(equipmentSlots.length).fill(1);
  const equipmentTarget = targets.equipment?.target ?? new Array(equipmentSlots.length).fill(1);

  const weaponBonusLabel = (() => {
    const weaponType = student?.WeaponType;
    if (!weaponType) return null;
    const ids = getBonusSeriesIdsFor(weaponType);
    if (ids.length === 0) return null;
    return ids.map((sid) => WEAPON_PART_SERIES[sid].label).join(' / ');
  })();

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4 md:p-5">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        {student && (
          <img
            src={studentIconUrl(plannerStudent.studentId)}
            alt={student.Name}
            className="w-14 h-14 rounded-lg object-cover border border-gray-200 dark:border-slate-600"
          />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-gray-800 dark:text-slate-100 truncate">
            {student?.Name ?? `학생 #${plannerStudent.studentId}`}
          </h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 truncate">
            {student?.School ?? ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SaveBadge status={status} />
          <button
            onClick={onRemove}
            className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
            aria-label="플래너에서 제거"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* 목표치 입력 */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="학생 레벨">
          <LevelTargetInput value={targets.level} onChange={handleLevelChange} />
        </Section>

        {gearEnabled && (
          <Section title="고유장비 (Gear)">
            <GearTargetInput
              value={targets.gear ?? DEFAULT_GEAR}
              onChange={handleGearChange}
            />
          </Section>
        )}

        <Section title="고유무기 레벨">
          {weaponBonusLabel && (
            <div className="text-[11px] text-blue-700 dark:text-blue-400 mb-1.5">
              1.5× 보너스: <span className="font-bold">{weaponBonusLabel}</span>
            </div>
          )}
          <WeaponTargetInput
            value={targets.weapon ?? DEFAULT_WEAPON}
            onChange={handleWeaponChange}
          />
        </Section>

        {equipmentSlots.length > 0 && (
          <Section title="일반 장비">
            <EquipmentTargetInput
              categories={equipmentSlots}
              current={equipmentCurrent}
              target={equipmentTarget}
              onChange={handleEquipmentChange}
            />
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">{title}</h4>
      {children}
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
