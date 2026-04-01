import { useState } from 'react';
import { Link } from 'react-router';
import { useAuthStore } from '@/stores/authStore';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const signUp = useAuthStore((s) => s.signUp);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signUp(email, password, nickname);
      setSuccess(true);
    } catch {
      setError('회원가입에 실패했습니다. 이미 사용 중인 이메일일 수 있습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
          <div className="text-4xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">회원가입 완료</h2>
          <p className="text-gray-500 mb-6">
            관리자의 승인을 기다려주세요.<br />
            승인 후 활동이 가능합니다.
          </p>
          <Link
            to="/login"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
          >
            로그인 페이지로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-12">
      <h1 className="text-3xl font-extrabold text-blue-900 mb-6 tracking-tight">회원가입</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-bold text-gray-700 mb-2">닉네임</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="닉네임을 입력하세요"
            required
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-bold text-gray-700 mb-2">이메일</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="email@example.com"
            required
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-bold text-gray-700 mb-2">비밀번호</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="비밀번호를 입력하세요"
            minLength={6}
            required
          />
          <p className="text-xs text-gray-400 mt-1">6자 이상 입력해주세요.</p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 px-4 rounded-lg transition-colors"
        >
          {loading ? '가입 중...' : '회원가입'}
        </button>

        <p className="text-sm text-gray-500 text-center mt-4">
          이미 계정이 있으신가요?{' '}
          <Link to="/login" className="text-blue-600 hover:underline">로그인</Link>
        </p>
      </form>
    </div>
  );
}
