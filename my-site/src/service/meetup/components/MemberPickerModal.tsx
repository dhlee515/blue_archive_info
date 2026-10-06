import { useEffect, useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { UserProfile } from '@/types/auth';
import { AuthRepository } from '@/repositories/authRepository';

interface Props {
  /** 이미 장부에 있는 회원 id */
  addedUserIds: Set<string>;
  onClose: () => void;
  /** 선택한 회원 (목록 순서) */
  onAdd: (members: UserProfile[]) => void;
  /** 총무 임명 모드 — 승인 대기 계정 제외, 기존 총무 미리 선택, 1명 이상 필수 */
  treasurers?: boolean;
  /** 처음부터 선택된 회원 id (총무 임명 모드) */
  initialSelected?: string[];
  title?: string;
}

/** 회원 검색 + 여러 명 선택 (삭제된 계정 제외, 승인 대기는 배지). 참가자 추가 / 총무 임명 겸용 */
export default function MemberPickerModal({
  addedUserIds,
  onClose,
  onAdd,
  treasurers = false,
  initialSelected = [],
  title = '회원 추가',
}: Props) {
  const [members, setMembers] = useState<UserProfile[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>(initialSelected);

  useEffect(() => {
    async function fetchData() {
      try {
        const users = await AuthRepository.getAllUsers();
        // 총무는 로그인해서 편집해야 하므로 승인 대기 계정 제외
        const pool = treasurers ? users.filter((u) => u.role !== 'pending') : users;
        setMembers([...pool].sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko')));
      } catch (error) {
        console.error('Failed to fetch members:', error);
        setLoadError(true);
      }
    }
    fetchData();
  }, [treasurers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (members ?? []).filter((m) => !q || m.nickname.toLowerCase().includes(q));
  }, [members, search]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleAdd = () => {
    const picked = (members ?? []).filter((m) => selected.includes(m.id));
    if (picked.length === 0) return;
    onAdd(picked);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 border-b border-gray-200 dark:border-slate-700">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="닉네임으로 검색..."
            className="w-full p-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
            autoFocus
          />
          <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
            {treasurers
              ? '총무는 이 모임의 장부를 편집할 수 있습니다 (여러 명 가능). 승인 대기 계정은 고를 수 없습니다.'
              : '사이트에 가입한 회원만 추가할 수 있습니다. 목록에 없으면 먼저 가입을 안내하세요.'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loadError ? (
            <p className="text-center text-sm text-red-600 dark:text-red-400 py-8">회원 목록을 불러오지 못했습니다.</p>
          ) : members === null ? (
            <p className="text-center text-sm text-gray-400 dark:text-slate-400 py-8">데이터를 불러오는 중...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-gray-400 dark:text-slate-500 py-8">검색 결과가 없습니다.</p>
          ) : (
            <ul className="flex flex-col">
              {filtered.map((m) => {
                const added = addedUserIds.has(m.id);
                const on = selected.includes(m.id);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      disabled={added}
                      onClick={() => toggle(m.id)}
                      aria-pressed={on}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                        added
                          ? 'opacity-40 cursor-not-allowed'
                          : on
                            ? 'bg-teal-50 dark:bg-teal-900/30'
                            : 'hover:bg-gray-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 shrink-0 rounded border flex items-center justify-center ${
                          on || added
                            ? 'bg-teal-600 border-teal-600 text-white'
                            : 'border-gray-300 dark:border-slate-500'
                        }`}
                      >
                        {(on || added) && <Check size={14} />}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-sm text-gray-800 dark:text-slate-100">{m.nickname}</span>
                      {/* 닉네임이 겹치는 회원 구분용 */}
                      <span className="text-[11px] text-gray-400 dark:text-slate-500 tabular-nums shrink-0">
                        가입 {new Date(m.createdAt).toLocaleDateString('ko-KR')}
                      </span>
                      {m.role === 'pending' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 shrink-0">
                          대기
                        </span>
                      )}
                      {added && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-600 text-white shrink-0">추가됨</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 p-4 border-t border-gray-200 dark:border-slate-700">
          <span className="text-sm text-gray-500 dark:text-slate-400">
            {selected.length}명 선택
          </span>
          <button
            type="button"
            onClick={handleAdd}
            disabled={selected.length === 0}
            className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm"
          >
            {treasurers ? `${selected.length}명 지정` : selected.length > 0 ? `${selected.length}명 추가` : '추가'}
          </button>
        </div>
      </div>
    </div>
  );
}
