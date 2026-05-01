import { useEffect, useRef, useState } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import type { SchaleDBStudent } from '@/types/schaledb';
import type { PlannerStudent, PlannerTargets, GearRange, WeaponRange, WeaponStarRange, LevelRange, EquipmentTiers, SkillsRange, PotentialsRange } from '@/types/planner';
import { studentIconUrl } from '@/lib/schaledbImage';
import { WEAPON_PART_SERIES, getBonusSeriesIdsFor } from '../utils/expConversion';
import { getWeaponMaxLevelForStar, getWeaponMinLevelForStar } from '../utils/tables/weaponLevel';
import LevelTargetInput from './LevelTargetInput';
import GearTargetInput from './GearTargetInput';
import WeaponTargetInput from './WeaponTargetInput';
import WeaponStarInput from './WeaponStarInput';
import EquipmentTargetInput from './EquipmentTargetInput';
import SkillTargetInput from './SkillTargetInput';
import PotentialTargetInput from './PotentialTargetInput';

const DEFAULT_GEAR: GearRange = { currentTier: 0, targetTier: 0 };
const DEFAULT_WEAPON: WeaponRange = { currentLevel: 0, targetLevel: 0 };
const DEFAULT_WEAPON_STAR: WeaponStarRange = { current: 1, target: 1 };
const DEFAULT_SKILLS: SkillsRange = {
  ex: { current: 1, target: 1 },
  normal: { current: 1, target: 1 },
  passive: { current: 1, target: 1 },
  sub: { current: 1, target: 1 },
};
const DEFAULT_POTENTIALS: PotentialsRange = {
  hp: { current: 0, target: 0 },
  attack: { current: 0, target: 0 },
  crit: { current: 0, target: 0 },
};

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

  // 디바운스 저장 (1500ms — egress 절감용. 슬라이더 드래그 같은 잦은 변경 시 last-write 만 저장)
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
    }, 1500);

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
  const handleWeaponStarChange = (weaponStar: WeaponStarRange) => {
    setTargets((t) => {
      // 새 성급의 [min, max] 범위로 무기 레벨을 자동 보정.
      // 예: 목표 단계를 "전무 2성" 으로 올리면 목표 무기 레벨이 30 미만이면 30 으로 끌어올림.
      const newCurrentMin = getWeaponMinLevelForStar(weaponStar.current);
      const newCurrentMax = getWeaponMaxLevelForStar(weaponStar.current);
      const newTargetMin = getWeaponMinLevelForStar(weaponStar.target);
      const newTargetMax = getWeaponMaxLevelForStar(weaponStar.target);
      const prevWeapon = t.weapon ?? DEFAULT_WEAPON;
      const clampedWeapon: WeaponRange = {
        currentLevel: Math.max(newCurrentMin, Math.min(prevWeapon.currentLevel, newCurrentMax)),
        targetLevel: Math.max(newTargetMin, Math.min(prevWeapon.targetLevel, newTargetMax)),
      };
      return { ...t, weaponStar, weapon: clampedWeapon };
    });
  };
  const handleEquipmentChange = (current: EquipmentTiers, target: EquipmentTiers) => {
    setTargets((t) => ({ ...t, equipment: { current, target } }));
  };
  const handleSkillsChange = (skills: SkillsRange) => {
    setTargets((t) => ({ ...t, skills }));
  };
  const handlePotentialsChange = (potentials: PotentialsRange) => {
    setTargets((t) => ({ ...t, potentials }));
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
          <Section title="애장품">
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
            weaponStar={targets.weaponStar ?? DEFAULT_WEAPON_STAR}
            onChange={handleWeaponChange}
          />
        </Section>

        <Section title="고유무기 성급 (학생 + 전무)">
          <WeaponStarInput
            value={targets.weaponStar ?? DEFAULT_WEAPON_STAR}
            onChange={handleWeaponStarChange}
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

        <div className="md:col-span-2">
          <Section title="스킬 (EX 1~5 / 기본·강화·서브 1~10)">
            <SkillTargetInput
              value={targets.skills ?? DEFAULT_SKILLS}
              onChange={handleSkillsChange}
            />
          </Section>
        </div>

        <div className="md:col-span-2">
          <Section title="잠재력 강화 (체력 / 공격 / 치명, 0~25)">
            <PotentialTargetInput
              value={targets.potentials ?? DEFAULT_POTENTIALS}
              onChange={handlePotentialsChange}
            />
          </Section>
        </div>
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
