import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import type { StudentDetail } from '@/types/student';
import { StudentRepository } from '@/repositories/studentRepository';
import { skillIconUrl, weaponImageUrl } from '@/lib/schaledbImage';
import {
  formatAttackType,
  formatArmorType,
  formatSchool,
  formatRoleType,
  formatPosition,
  formatRarity,
  formatTerrain,
  formatStat,
} from '@/utils/format';

const ATTACK_COLOR: Record<string, string> = {
  Explosive: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
  Piercing: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
  Mystic: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
  Sonic: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300',
};

const TERRAIN_COLOR: Record<string, string> = {
  SS: 'text-yellow-500 dark:text-yellow-400 font-extrabold',
  S: 'text-orange-500 dark:text-orange-400 font-bold',
  A: 'text-red-500 dark:text-red-400 font-bold',
  B: 'text-blue-500 dark:text-blue-400',
  C: 'text-gray-500 dark:text-slate-400',
  D: 'text-gray-400 dark:text-slate-500',
};

const SKILL_TYPE_LABEL: Record<string, { label: string; color: string }> = {
  EX: { label: 'EX', color: 'bg-red-500 text-white' },
  Normal: { label: 'Normal', color: 'bg-blue-500 text-white' },
  Passive: { label: 'Passive', color: 'bg-yellow-500 text-white' },
  Sub: { label: 'Sub', color: 'bg-green-500 text-white' },
};

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStudent() {
      try {
        if (!id) return;
        const data = await StudentRepository.getStudentById(Number(id));
        setStudent(data);
      } catch (error) {
        console.error('Failed to fetch student:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchStudent();
  }, [id]);

  if (loading) {
    return <div className="text-center py-12 text-gray-400 dark:text-slate-400">데이터를 불러오는 중...</div>;
  }

  if (!student) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 dark:text-slate-400 mb-4">학생 정보를 찾을 수 없습니다.</p>
        <Link to="/students" className="text-blue-600 dark:text-blue-400 hover:underline">목록으로 돌아가기</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link to="/students" className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-4 inline-block">
        ← 목록으로
      </Link>

      {/* 헤더: 이미지 + 기본 정보 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden mb-4">
        <div className="flex flex-col md:flex-row">
          {/* 초상화 */}
          <div className="w-full md:w-64 h-64 md:h-auto bg-gray-100 dark:bg-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
            <img
              src={student.imageUrl}
              alt={student.name}
              className="h-full object-cover"
              loading="lazy"
            />
          </div>

          {/* 기본 정보 */}
          <div className="p-4 md:p-6 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-extrabold text-gray-900 dark:text-slate-100">{student.name}</h1>
              <span className="text-yellow-500 dark:text-yellow-400 text-sm">{formatRarity(student.rarity)}</span>
              {student.isLimited && (
                <span className="text-xs px-1.5 py-0.5 bg-pink-100 dark:bg-pink-900/50 text-pink-600 dark:text-pink-400 rounded font-medium">한정</span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
              {student.familyName} {student.personalName}
            </p>

            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm mb-4">
              <InfoRow label="학교" value={formatSchool(student.school)} />
              <InfoRow label="클럽" value={student.club} />
              <InfoRow label="역할" value={student.role === 'Striker' ? '스트라이커' : '스페셜'} />
              <InfoRow label="역할군" value={formatRoleType(student.tacticRole)} />
              <InfoRow label="포지션" value={formatPosition(student.position)} />
              <InfoRow label="무기" value={student.weaponType} />
            </div>

            <div className="flex gap-2">
              <span className={`text-xs px-2 py-1 rounded font-medium ${ATTACK_COLOR[student.attackType] ?? 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400'}`}>
                {formatAttackType(student.attackType)}
              </span>
              <span className="text-xs px-2 py-1 rounded font-medium bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300">
                {formatArmorType(student.armorType)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 프로필 */}
      <Section title="프로필">
        <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed mb-4">{student.profile}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
          <InfoRow label="학년" value={student.schoolYear} />
          <InfoRow label="나이" value={student.characterAge} />
          <InfoRow label="생일" value={student.birthday} />
          <InfoRow label="신장" value={student.height} />
          <InfoRow label="취미" value={student.hobby} />
          <InfoRow label="일러스트" value={student.illustrator} />
          <InfoRow label="원화" value={student.designer} />
        </div>
      </Section>

      {/* 전투 스탯 */}
      <Section title="전투 스탯">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StatBar label="HP" value={student.stats.hp} max={60000} />
          <StatBar label="공격력" value={student.stats.attack} max={6000} />
          <StatBar label="방어력" value={student.stats.defense} max={1000} />
          <StatBar label="치유력" value={student.stats.healPower} max={8000} />
          <StatBar label="명중" value={student.stats.accuracy} max={2000} />
          <StatBar label="회피" value={student.stats.evasion} max={2000} />
          <StatBar label="치명" value={student.stats.critical} max={1000} />
          <StatBar label="치명 데미지" value={student.stats.criticalDamage} max={30000} suffix="%" />
          <StatBar label="안정성" value={student.stats.stability} max={3000} />
          <StatBar label="사거리" value={student.stats.range} max={1000} />
        </div>
      </Section>

      {/* 지형 적응도 */}
      <Section title="지형 적응도">
        <div className="flex gap-6">
          <TerrainBadge label="시가지" value={student.terrain.street} />
          <TerrainBadge label="야외" value={student.terrain.outdoor} />
          <TerrainBadge label="실내" value={student.terrain.indoor} />
        </div>
      </Section>

      {/* 스킬 */}
      <Section title="스킬">
        <div className="flex flex-col gap-3">
          {student.skills.map((skill, idx) => {
            const typeInfo = SKILL_TYPE_LABEL[skill.type] ?? { label: skill.type, color: 'bg-gray-500 text-white' };
            return (
              <div key={idx} className="flex gap-3 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                {skill.icon && (
                  <img
                    src={skillIconUrl(skill.icon)}
                    alt={skill.name}
                    className="w-12 h-12 rounded-lg shrink-0 bg-gray-200 dark:bg-slate-600"
                    loading="lazy"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${typeInfo.color}`}>
                      {typeInfo.label}
                    </span>
                    <span className="font-bold text-sm text-gray-800 dark:text-slate-200 truncate">{skill.name}</span>
                    {skill.type === 'EX' && skill.cost && (
                      <span className="text-xs text-gray-400 dark:text-slate-400">코스트 {skill.cost[0]}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 dark:text-slate-400 leading-relaxed">{skill.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* 무기 */}
      {student.weapon.name && (
        <Section title="고유 무기">
          <div className="flex gap-4 items-center">
            <img
              src={weaponImageUrl(student.weapon.imageId)}
              alt={student.weapon.name}
              className="w-24 h-24 object-contain bg-gray-100 dark:bg-slate-700 rounded-lg p-2"
              loading="lazy"
            />
            <div>
              <h4 className="font-bold text-gray-800 dark:text-slate-200 mb-1">{student.weapon.name}</h4>
              <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">{student.weapon.weaponType}</p>
              <p className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed">{student.weapon.description}</p>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

// --- 유틸 컴포넌트 ---

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4 md:p-6 mb-4">
      <h2 className="text-lg font-bold text-gray-800 dark:text-slate-200 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500 dark:text-slate-400">{label}</span>
      <span className="text-gray-800 dark:text-slate-200 text-right">{value || '-'}</span>
    </div>
  );
}

function StatBar({ label, value, max, suffix }: { label: string; value: number; max: number; suffix?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600 dark:text-slate-400">{label}</span>
        <span className="font-medium text-gray-800 dark:text-slate-200">
          {suffix ? `${(value / 100).toFixed(0)}${suffix}` : formatStat(value)}
        </span>
      </div>
      <div className="h-2 bg-gray-200 dark:bg-slate-600 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TerrainBadge({ label, value }: { label: string; value: number }) {
  const grade = formatTerrain(value);
  const color = TERRAIN_COLOR[grade] ?? 'text-gray-500 dark:text-slate-400';
  return (
    <div className="text-center">
      <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">{label}</p>
      <p className={`text-2xl ${color}`}>{grade}</p>
    </div>
  );
}
