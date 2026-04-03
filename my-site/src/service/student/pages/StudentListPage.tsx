import { useState, useEffect, useMemo } from 'react';
import type { Student, AttackType, ArmorType } from '@/types/student';
import { StudentRepository } from '@/repositories/studentRepository';
import { formatAttackType, formatArmorType, formatSchool } from '@/utils/format';
import StudentCard from '../components/StudentCard';

type RoleFilter = 'all' | 'Striker' | 'Special';
type AttackFilter = 'all' | AttackType;
type ArmorFilter = 'all' | ArmorType;

const ATTACK_TYPES: AttackType[] = ['Explosive', 'Piercing', 'Mystic', 'Sonic'];
const ARMOR_TYPES: ArmorType[] = ['LightArmor', 'HeavyArmor', 'Unarmed', 'ElasticArmor'];

export default function StudentListPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [attackFilter, setAttackFilter] = useState<AttackFilter>('all');
  const [armorFilter, setArmorFilter] = useState<ArmorFilter>('all');
  const [schoolFilter, setSchoolFilter] = useState<string>('all');

  useEffect(() => {
    async function fetchStudents() {
      try {
        const data = await StudentRepository.getStudents();
        setStudents(data);
      } catch (error) {
        console.error('Failed to fetch students:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchStudents();
  }, []);

  // 학교 목록 추출
  const schools = useMemo(() => {
    const set = new Set(students.map((s) => s.school));
    return Array.from(set).sort();
  }, [students]);

  // 필터링
  const filtered = useMemo(() => {
    return students.filter((s) => {
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (roleFilter !== 'all' && s.role !== roleFilter) return false;
      if (attackFilter !== 'all' && s.attackType !== attackFilter) return false;
      if (armorFilter !== 'all' && s.armorType !== armorFilter) return false;
      if (schoolFilter !== 'all' && s.school !== schoolFilter) return false;
      return true;
    });
  }, [students, search, roleFilter, attackFilter, armorFilter, schoolFilter]);

  const hasActiveFilter = roleFilter !== 'all' || attackFilter !== 'all' || armorFilter !== 'all' || schoolFilter !== 'all' || search !== '';

  const resetFilters = () => {
    setSearch('');
    setRoleFilter('all');
    setAttackFilter('all');
    setArmorFilter('all');
    setSchoolFilter('all');
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-blue-900 dark:text-blue-300 tracking-tight">학생 목록</h1>
        <p className="text-gray-500 dark:text-slate-400 mt-1 text-sm md:text-base">키보토스의 학생 정보를 확인하세요.</p>
      </div>

      {/* 검색 + 필터 */}
      <div className="flex flex-col gap-3">
        {/* 검색바 */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="학생 이름 검색..."
          className="w-full md:max-w-sm p-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100 text-sm"
        />

        {/* 필터 그룹 */}
        <div className="flex flex-col gap-2">
          {/* 역할 */}
          <FilterRow label="역할">
            <FilterButton active={roleFilter === 'all'} onClick={() => setRoleFilter('all')}>전체</FilterButton>
            <FilterButton active={roleFilter === 'Striker'} onClick={() => setRoleFilter('Striker')}>스트라이커</FilterButton>
            <FilterButton active={roleFilter === 'Special'} onClick={() => setRoleFilter('Special')}>스페셜</FilterButton>
          </FilterRow>

          {/* 공격 속성 */}
          <FilterRow label="공격">
            <FilterButton active={attackFilter === 'all'} onClick={() => setAttackFilter('all')}>전체</FilterButton>
            {ATTACK_TYPES.map((t) => (
              <FilterButton key={t} active={attackFilter === t} onClick={() => setAttackFilter(t)}>
                {formatAttackType(t)}
              </FilterButton>
            ))}
          </FilterRow>

          {/* 방어 속성 */}
          <FilterRow label="방어">
            <FilterButton active={armorFilter === 'all'} onClick={() => setArmorFilter('all')}>전체</FilterButton>
            {ARMOR_TYPES.map((t) => (
              <FilterButton key={t} active={armorFilter === t} onClick={() => setArmorFilter(t)}>
                {formatArmorType(t)}
              </FilterButton>
            ))}
          </FilterRow>

          {/* 학교 */}
          <FilterRow label="학교">
            <FilterButton active={schoolFilter === 'all'} onClick={() => setSchoolFilter('all')}>전체</FilterButton>
            {schools.map((s) => (
              <FilterButton key={s} active={schoolFilter === s} onClick={() => setSchoolFilter(s)}>
                {formatSchool(s)}
              </FilterButton>
            ))}
          </FilterRow>
        </div>

        {/* 결과 수 + 초기화 */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500 dark:text-slate-400">
            {filtered.length}명
            {hasActiveFilter && ` / ${students.length}명`}
          </span>
          {hasActiveFilter && (
            <button
              onClick={resetFilters}
              className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
            >
              필터 초기화
            </button>
          )}
        </div>
      </div>

      {/* 학생 그리드 */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 dark:text-slate-400">데이터를 불러오는 중...</div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
          {filtered.map((student) => (
            <StudentCard key={student.id} student={student} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400 dark:text-slate-400 border border-dashed border-gray-300 dark:border-slate-600 rounded-lg">
          {hasActiveFilter ? '조건에 맞는 학생이 없습니다.' : '표시할 학생 데이터가 없습니다.'}
        </div>
      )}
    </div>
  );
}

// --- 필터 UI 컴포넌트 ---

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-gray-500 dark:text-slate-400 w-8 shrink-0">{label}</span>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {children}
      </div>
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'
      }`}
    >
      {children}
    </button>
  );
}
