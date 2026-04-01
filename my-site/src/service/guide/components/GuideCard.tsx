import { Link } from 'react-router';
import type { Guide, Category } from '@/types/guide';

interface Props {
  guide: Guide;
  categories: Category[];
}

export default function GuideCard({ guide, categories }: Props) {
  const categoryName = categories.find((c) => c.id === guide.categoryId)?.name ?? '';

  return (
    <Link
      to={`/guide/${guide.id}`}
      className="group bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="h-40 bg-gray-100 flex items-center justify-center">
        {guide.imageUrl ? (
          <img src={guide.imageUrl} alt={guide.title} className="w-full h-full object-cover" />
        ) : (
          <span className="text-gray-400 text-sm">이미지 없음</span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          {categoryName && (
            <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">
              {categoryName}
            </span>
          )}
          <span className="text-xs text-gray-400">
            {new Date(guide.createdAt).toLocaleDateString('ko-KR')}
          </span>
        </div>
        <h3 className="font-bold text-lg text-gray-800 group-hover:text-blue-600 transition-colors">
          {guide.title}
        </h3>
        <p className="text-sm text-gray-500 mt-1 line-clamp-2">
          {guide.content}
        </p>
      </div>
    </Link>
  );
}
