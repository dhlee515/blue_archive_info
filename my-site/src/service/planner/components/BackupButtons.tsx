import { useRef, useState, type ChangeEvent } from 'react';
import { Download, Loader2, Upload } from 'lucide-react';
import {
  exportBackup,
  importBackup,
  parseBackup,
  type PlannerBackup,
} from '../utils/plannerBackup';
import type { PlannerRepo } from '../utils/plannerRepoFactory';

interface Props {
  repo: PlannerRepo;
  /** import 성공 직후 호출 — 페이지가 자체 state 를 갱신하도록. async 가능. */
  onAfterImport?: (backup: PlannerBackup) => void | Promise<void>;
  /** 페이지 초기 로딩 등으로 백업 동작을 막아야 할 때 true. */
  disabled?: boolean;
}

export default function BackupButtons({ repo, onAfterImport, disabled = false }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    try {
      await exportBackup(repo);
    } catch (e) {
      console.error(e);
      alert('내보내기 실패: ' + (e instanceof Error ? e.message : '알 수 없는 오류'));
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 가능하도록 초기화
    if (!file) return;

    try {
      const text = await file.text();
      const backup = parseBackup(text);

      const studentsCount = backup.students.length;
      const itemsCount = Object.keys(backup.inventory).length;
      const ok = confirm(
        `백업 파일에서 학생 ${studentsCount}명, 재화 ${itemsCount}종을 가져옵니다.\n` +
          `현재 플래너의 모든 데이터를 덮어씁니다. 계속하시겠습니까?`,
      );
      if (!ok) return;

      setImporting(true);
      await importBackup(repo, backup);
      // 페이지 state 갱신 완료까지 대기 — 그 사이 alert 가 먼저 뜨지 않도록.
      await onAfterImport?.(backup);
      alert('가져오기가 완료되었습니다.');
    } catch (err) {
      console.error(err);
      alert('가져오기 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
    } finally {
      setImporting(false);
    }
  };

  const exportDisabled = disabled || importing;
  const importDisabled = disabled || importing;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-xs font-bold text-gray-500 dark:text-slate-400 mr-1">데이터:</span>
      <button
        type="button"
        onClick={handleExport}
        disabled={exportDisabled}
        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Download size={14} />
        내보내기
      </button>
      <button
        type="button"
        onClick={handleImportClick}
        disabled={importDisabled}
        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        가져오기
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleImportFile}
        className="hidden"
      />
      <span className="text-[11px] text-gray-400 dark:text-slate-500">
        학생 + 인벤토리 전체를 JSON 으로 백업/복원
      </span>
    </div>
  );
}
