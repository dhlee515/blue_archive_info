import { Navigate } from 'react-router';
import { useAuthStore } from '@/stores/authStore';

interface Props {
  children: React.ReactNode;
}

/** 관리자 전용 가드 */
export default function AdminRoute({ children }: Props) {
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) {
    return <div className="text-center py-12 text-gray-400">확인 중...</div>;
  }

  if (user?.role !== 'admin') {
    return <Navigate to="/guide" replace />;
  }

  return <>{children}</>;
}

/** 부관리자 이상 가드 (editor + admin) */
export function EditorRoute({ children }: Props) {
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) {
    return <div className="text-center py-12 text-gray-400">확인 중...</div>;
  }

  if (user?.role !== 'admin' && user?.role !== 'editor') {
    return <Navigate to="/guide" replace />;
  }

  return <>{children}</>;
}
