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
      <h1 className="text-3xl font-extrabold text-blue-900 mb-6 tracking-tight">유저 관리</h1>

      {/* 승인 대기 */}
      {pendingUsers.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-yellow-700 mb-3">
            승인 대기 ({pendingUsers.length}명)
          </h2>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl overflow-hidden">
            <UserTable
              users={pendingUsers}
              updatingId={updatingId}
              onRoleChange={handleRoleChange}
              onDeactivate={handleDeactivate}
            />
          </div>
        </div>
      )}

      {/* 활성 유저 */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-gray-800 mb-3">
          활성 유저 ({activeUsers.length}명)
        </h2>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {activeUsers.length > 0 ? (
            <UserTable
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
          <h2 className="text-lg font-bold text-gray-400 mb-3">
            비활성화된 유저 ({deactivatedUsers.length}명)
          </h2>
          <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-bold text-gray-500">닉네임</th>
                    <th className="text-left px-4 py-3 font-bold text-gray-500">역할</th>
                    <th className="text-right px-4 py-3 font-bold text-gray-500">복원</th>
                  </tr>
                </thead>
                <tbody>
                  {deactivatedUsers.map((user) => (
                    <tr key={user.id} className="bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-400">{user.nickname}</td>
                      <td className="px-4 py-2.5 text-gray-400">{ROLE_LABELS[user.role]}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => handleReactivate(user.id)}
                          disabled={updatingId === user.id}
                          className="px-3 py-1 bg-green-50 hover:bg-green-100 text-green-600 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                          복원
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UserTable({
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
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-3 font-bold text-gray-600">닉네임</th>
            <th className="text-left px-4 py-3 font-bold text-gray-600">현재 역할</th>
            <th className="text-left px-4 py-3 font-bold text-gray-600">가입일</th>
            <th className="text-right px-4 py-3 font-bold text-gray-600">역할 변경</th>
            <th className="text-right px-4 py-3 font-bold text-gray-600"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((user, idx) => (
            <tr
              key={user.id}
              className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
            >
              <td className="px-4 py-2.5 font-medium text-gray-800">{user.nickname}</td>
              <td className="px-4 py-2.5">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[user.role]}`}>
                  {ROLE_LABELS[user.role]}
                </span>
              </td>
              <td className="px-4 py-2.5 text-gray-500">
                {new Date(user.createdAt).toLocaleDateString('ko-KR')}
              </td>
              <td className="px-4 py-2.5 text-right">
                <select
                  value={user.role}
                  onChange={(e) => onRoleChange(user.id, e.target.value as UserRole)}
                  disabled={updatingId === user.id}
                  className="p-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white disabled:opacity-50"
                >
                  <option value="pending">승인 대기</option>
                  <option value="user">사용자</option>
                  <option value="editor">부관리자</option>
                  <option value="admin">관리자</option>
                </select>
              </td>
              <td className="px-4 py-2.5 text-right">
                <button
                  onClick={() => onDeactivate(user.id)}
                  disabled={updatingId === user.id}
                  className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  비활성화
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
