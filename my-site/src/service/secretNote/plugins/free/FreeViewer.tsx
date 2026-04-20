import DOMPurify from 'dompurify';
import '@/styles/editor.css';

interface Props {
  data: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export default function FreeViewer({ data, title, createdAt, updatedAt }: Props) {
  return (
    <div className="max-w-3xl mx-auto">
      <article className="bg-white dark:bg-slate-800 rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="p-4 md:p-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs text-gray-400 dark:text-slate-400">
              {new Date(createdAt).toLocaleDateString('ko-KR')}
            </span>
            {updatedAt !== createdAt && (
              <span className="text-xs text-gray-400 dark:text-slate-400">
                (수정: {new Date(updatedAt).toLocaleDateString('ko-KR')})
              </span>
            )}
          </div>

          <h1 className="text-xl md:text-2xl font-extrabold text-gray-900 dark:text-slate-100 mb-4 md:mb-6">{title}</h1>

          <div
            className="tiptap-editor prose max-w-none text-gray-700 dark:text-slate-300"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(data) }}
          />
        </div>
      </article>
    </div>
  );
}
