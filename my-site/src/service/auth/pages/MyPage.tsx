import { useState } from 'react';
import { Navigate } from 'react-router';
import { useAuthStore } from '@/stores/authStore';
import { AuthRepository } from '@/repositories/authRepository';

const ROLE_LABELS: Record<string, string> = {
  admin: '관리자',
  editor: '부관리자',
  user: '사용자',
  pending: '승인 대기',
};

export default function MyPage() {
  const user = useAuthStore((s) => s.user);
  const initialize = useAuthStore((s) => s.initialize);

  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [nicknameMsg, setNicknameMsg] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState('');

  if (!user) return <Navigate to="/login" replace />;

  const handleNicknameChange = async () => {
    if (!nickname.trim()) return;
    setNicknameSaving(true);
    setNicknameMsg('');
    try {
      await AuthRepository.updateNickname(user.id, nickname.trim());
      await initialize();
      setNicknameMsg('닉네임이 변경되었습니다.');
    } catch {
      setNicknameMsg('닉네임 변경에 실패했습니다.');
    } finally {
      setNicknameSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    setPasswordMsg('');
    if (newPassword.length < 6) {
      setPasswordMsg('새 비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg('새 비밀번호가 일치하지 않습니다.');
      return;
    }
    setPasswordSaving(true);
    try {
      await AuthRepository.updatePassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMsg('비밀번호가 변경되었습니다.');
    } catch {
      setPasswordMsg('비밀번호 변경에 실패했습니다.');
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-3xl font-extrabold text-blue-900 dark:text-blue-300 mb-6 tracking-tight">마이페이지</h1>

      {/* 프로필 정보 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-800 dark:text-slate-200 mb-4">프로필 정보</h2>
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-slate-300">이메일</span>
            <span className="text-gray-800 dark:text-slate-200">{user.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-slate-300">역할</span>
            <span className="text-gray-800 dark:text-slate-200">{ROLE_LABELS[user.role] ?? user.role}</span>
          </div>
        </div>
      </div>

      {/* 닉네임 변경 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-800 dark:text-slate-200 mb-4">닉네임 변경</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="flex-1 p-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100"
          />
          <button
            onClick={handleNicknameChange}
            disabled={nicknameSaving || !nickname.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-800 text-white font-bold py-2.5 px-5 rounded-lg transition-colors"
          >
            {nicknameSaving ? '저장 중...' : '변경'}
          </button>
        </div>
        {nicknameMsg && (
          <p className={`text-sm mt-2 ${nicknameMsg.includes('실패') ? 'text-red-500 dark:text-red-400' : 'text-green-500 dark:text-green-400'}`}>
            {nicknameMsg}
          </p>
        )}
      </div>

      {/* 비밀번호 변경 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <h2 className="text-lg font-bold text-gray-800 dark:text-slate-200 mb-4">비밀번호 변경</h2>
        <div className="flex flex-col gap-3">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="새 비밀번호 (6자 이상)"
            className="p-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="새 비밀번호 확인"
            className="p-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-slate-700 dark:text-slate-100"
          />
          <button
            onClick={handlePasswordChange}
            disabled={passwordSaving || !newPassword}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-800 text-white font-bold py-2.5 px-4 rounded-lg transition-colors"
          >
            {passwordSaving ? '변경 중...' : '비밀번호 변경'}
          </button>
        </div>
        {passwordMsg && (
          <p className={`text-sm mt-2 ${passwordMsg.includes('실패') || passwordMsg.includes('일치') || passwordMsg.includes('이상') ? 'text-red-500 dark:text-red-400' : 'text-green-500 dark:text-green-400'}`}>
            {passwordMsg}
          </p>
        )}
      </div>
    </div>
  );
}
