import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import type { GuideLog } from '@/types/guide';
import { GuideRepository } from '@/repositories/guideRepository';

const ACTION_LABELS: Record<string, string> = {
  create: '생성',
  update: '수정',
  delete: '삭제',
};

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  update: 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  delete: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export default function GuideLogPage() {
  const { id } = useParams<{ id: string }>();
  const [logs, setLogs] = useState<GuideLog[]>([]);
  const [guideTitle, setGuideTitle] = useState('');
  const [isDeleted, setIsDeleted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      try {
        const [logData, guide] = await Promise.all([
          GuideRepository.getLogsByGuideId(id),
          GuideRepository.getGuideById(id).catch(() => null),
        ]);
        setLogs(logData);
        if (guide) {
          setGuideTitle(guide.title);
        } else {
          setIsDeleted(true);
        }
      } catch (error) {
        console.error('Failed to fetch logs:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  if (loading) {
    return <div className="text-center py-12 text-gray-400 dark:text-slate-400">데이터를 불러오는 중...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link to="/guide" className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-4 inline-block">
        ← 정보글 목록으로
      </Link>

      <h1 className="text-3xl font-extrabold text-blue-900 dark:text-blue-300 mb-2 tracking-tight">수정 이력</h1>
      <p className="text-gray-500 dark:text-slate-300 mb-6">
        {isDeleted ? (
          <span className="text-red-500 dark:text-red-400">삭제된 글</span>
        ) : (
          guideTitle
        )}
      </p>

      {logs.length > 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-700">
                <tr>
                  <th className="text-left px-4 py-3 font-bold text-gray-600 dark:text-slate-400">작업</th>
                  <th className="text-left px-4 py-3 font-bold text-gray-600 dark:text-slate-400">작업자</th>
                  <th className="text-left px-4 py-3 font-bold text-gray-600 dark:text-slate-400">일시</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, idx) => (
                  <tr key={log.id} className={idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-gray-50 dark:bg-slate-800/70'}>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${ACTION_COLORS[log.action] ?? ''}`}>
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-slate-200">{log.editorNickname}</td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-slate-300">
                      {new Date(log.createdAt).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400 dark:text-slate-400 border border-dashed border-gray-300 dark:border-slate-600 rounded-lg">
          기록된 로그가 없습니다.
        </div>
      )}
    </div>
  );
}
