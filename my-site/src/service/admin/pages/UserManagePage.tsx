import { useState, useEffect } from 'react';
import type { UserProfile, UserRole } from '@/types/auth';
import { AuthRepository } from '@/repositories/authRepository';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: '관리자',
  editor: '부관리자',
  user: '사용자',
  pending: '승인 대기',
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-red-50 text-red-700',
  editor: 'bg-blue-50 text-blue-700',
  user: 'bg-green-50 text-green-700',
  pending: 'bg-yellow-50 text-yellow-700',
};

export default function UserManagePage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deactivatedUsers, setDeactivatedUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const [active, deactivated] = await Promise.all([
        AuthRepository.getAllUsers(),
        AuthRepository.getDeactivatedUsers(),
      ]);
      setUsers(active);
      setDeactivatedUsers(deactivated);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleDeactivate = async (userId: string) => {
    if (!confirm('정말 비활성화하시겠습니까?')) return;
    setUpdatingId(userId);
    try {
      await AuthRepository.deactivateUser(userId);
      await fetchUsers();
    } catch (error) {
      console.error('Failed to deactivate user:', error);
      alert('비활성화에 실패했습니다.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleReactivate = async (userId: string) => {
    setUpdatingId(userId);
    try {
      await AuthRepository.reactivateUser(userId);
      await fetchUsers();
    } catch (error) {
      console.error('Failed to reactivate user:', error);
      alert('복원에 실패했습니다.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    setUpdatingId(userId);
    try {
      await AuthRepository.updateUserRole(userId, newRole);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    } catch (error) {
      console.error('Failed to update role:', error);
      alert('역할 변경에 실패했습니다.');
    } finally {
      setUpdatingId(null);
    }
  };

  const pendingUsers = users.filter((u) => u.role === 'pending');
  const activeUsers = users.filter((u) => u.role !== 'pending');

  if (loading) {
    return <div className="text-center py-12 text-gray-400">데이터를 불러오는 중...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl md:text-3xl font-extrabold text-blue-900 mb-4 md:mb-6 tracking-tight">유저 관리</h1>

      {/* 승인 대기 */}
      {pendingUsers.length > 0 && (
        <div className="mb-6 md:mb-8">
          <h2 className="text-base md:text-lg font-bold text-yellow-700 mb-3">
            승인 대기 ({pendingUsers.length}명)
          </h2>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl overflow-hidden">
            <UserList
              users={pendingUsers}
              updatingId={updatingId}
              onRoleChange={handleRoleChange}
              onDeactivate={handleDeactivate}
            />
          </div>
        </div>
      )}

      {/* 활성 유저 */}
      <div className="mb-6 md:mb-8">
        <h2 className="text-base md:text-lg font-bold text-gray-800 mb-3">
          활성 유저 ({activeUsers.length}명)
        </h2>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {activeUsers.length > 0 ? (
            <UserList
              users={activeUsers}
              updatingId={updatingId}
              onRoleChange={handleRoleChange}
              onDeactivate={handleDeactivate}
            />
          ) : (
            <div className="text-center py-8 text-gray-400">활성 유저가 없습니다.</div>
          )}
        </div>
      </div>

      {/* 비활성화된 유저 */}
      {deactivatedUsers.length > 0 && (
        <div>
          <h2 className="text-base md:text-lg font-bold text-gray-400 mb-3">
            비활성화된 유저 ({deactivatedUsers.length}명)
          </h2>
          <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
            {deactivatedUsers.map((user) => (
              <div key={user.id} className="flex items-center justify-between px-3 md:px-4 py-2.5 md:py-3 border-b border-gray-200 last:border-b-0">
                <div>
                  <span className="text-gray-400 text-sm">{user.nickname}</span>
                  <span className="text-gray-400 text-xs ml-2">{ROLE_LABELS[user.role]}</span>
                </div>
                <button
                  onClick={() => handleReactivate(user.id)}
                  disabled={updatingId === user.id}
                  className="px-2 md:px-3 py-1 bg-green-50 hover:bg-green-100 text-green-600 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  복원
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UserList({
  users,
  updatingId,
  onRoleChange,
  onDeactivate,
}: {
  users: UserProfile[];
  updatingId: string | null;
  onRoleChange: (userId: string, role: UserRole) => void;
  onDeactivate: (userId: string) => void;
}) {
  return (
    <div>
      {users.map((user, idx) => (
        <div
          key={user.id}
          className={`px-3 md:px-4 py-2.5 md:py-3 ${idx !== users.length - 1 ? 'border-b border-gray-100' : ''}`}
        >
          {/* 1줄: 닉네임 + 역할 배지 + 가입일 */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-800 text-sm md:text-base">{user.nickname}</span>
            <span className={`px-1.5 md:px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[user.role]}`}>
              {ROLE_LABELS[user.role]}
            </span>
            <span className="text-xs text-gray-400 hidden md:inline">
              {new Date(user.createdAt).toLocaleDateString('ko-KR')}
            </span>
          </div>
          {/* 2줄: 가입일(모바일) + 역할 변경 + 비활성화 */}
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-xs text-gray-400 md:hidden">
              {new Date(user.createdAt).toLocaleDateString('ko-KR')}
            </span>
            <div className="flex-1" />
            <select
              value={user.role}
              onChange={(e) => onRoleChange(user.id, e.target.value as UserRole)}
              disabled={updatingId === user.id}
              className="p-1 md:p-1.5 border border-gray-300 rounded-lg text-xs md:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white disabled:opacity-50"
            >
              <option value="pending">승인 대기</option>
              <option value="user">사용자</option>
              <option value="editor">부관리자</option>
              <option value="admin">관리자</option>
            </select>
            <button
              onClick={() => onDeactivate(user.id)}
              disabled={updatingId === user.id}
              className="px-2 md:px-3 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              비활성화
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
