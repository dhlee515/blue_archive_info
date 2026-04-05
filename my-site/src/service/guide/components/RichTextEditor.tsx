import { useState, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import TextAlign from '@tiptap/extension-text-align';
import Youtube from '@tiptap/extension-youtube';
import '@/styles/editor.css';

interface Props {
  content: string;
  onChange: (html: string) => void;
  onImageUpload?: (file: File) => Promise<string>;
}

type UrlInputType = 'link' | 'image' | 'youtube' | null;

export default function RichTextEditor({ content, onChange, onImageUpload }: Props) {
  const [urlInput, setUrlInput] = useState<UrlInputType>(null);
  const [urlValue, setUrlValue] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showImageChoice, setShowImageChoice] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ref로 최신 함수 참조 유지 (editorProps 클로저 문제 해결)
  const onImageUploadRef = useRef(onImageUpload);
  onImageUploadRef.current = onImageUpload;

  const handleFileUploadRef = useRef(async (_file: File) => {});

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          HTMLAttributes: {
            target: '_blank',
            rel: 'noopener noreferrer',
          },
        },
      }),
      Image,
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Youtube.configure({ inline: false }),
    ],
    content,
    editorProps: {
      attributes: {
        class: 'tiptap-editor',
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved || !onImageUploadRef.current) return false;
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;

        const file = files[0];
        if (!file.type.startsWith('image/')) return false;

        event.preventDefault();
        handleFileUploadRef.current(file);
        return true;
      },
      handlePaste: (_view, event) => {
        if (!onImageUploadRef.current) return false;
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              event.preventDefault();
              handleFileUploadRef.current(file);
              return true;
            }
          }
        }
        return false;
      },
      handleClick: (_view, _pos, event) => {
        if ((event.target as HTMLElement).closest('a')) {
          event.preventDefault();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // editorRef로 최신 editor 인스턴스 유지
  const editorRef = useRef(editor);
  editorRef.current = editor;

  // handleDrop/handlePaste에서 editor를 ref로 참조하도록 재설정
  const handleFileUploadWithEditor = useCallback(async (file: File) => {
    if (!editorRef.current || !onImageUploadRef.current) return;

    setIsUploading(true);
    try {
      const url = await onImageUploadRef.current(file);
      editorRef.current.chain().focus().setImage({ src: url }).run();
    } catch (error) {
      console.error('Image upload failed:', error);
      alert(error instanceof Error ? error.message : '이미지 업로드에 실패했습니다.');
    } finally {
      setIsUploading(false);
    }
  }, []);

  handleFileUploadRef.current = handleFileUploadWithEditor;

  const openUrlInput = useCallback((type: UrlInputType) => {
    setUrlValue('');
    setUrlInput(type);
  }, []);

  const submitUrl = useCallback(() => {
    if (!editor || !urlValue.trim()) {
      setUrlInput(null);
      return;
    }

    const url = urlValue.trim();

    if (urlInput === 'link') {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url, target: '_blank' }).run();
    } else if (urlInput === 'image') {
      editor.chain().focus().setImage({ src: url }).run();
    } else if (urlInput === 'youtube') {
      editor.commands.setYoutubeVideo({ src: url });
    }

    setUrlInput(null);
    setUrlValue('');
  }, [editor, urlInput, urlValue]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUploadWithEditor(file);
    e.target.value = '';
  }, [handleFileUploadWithEditor]);

  if (!editor) return null;

  const btn = (active: boolean) =>
    `px-2 py-1 rounded text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${
      active ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-600'
    }`;

  const urlLabels: Record<string, string> = {
    link: '링크 URL',
    image: '이미지 URL',
    youtube: 'YouTube URL',
  };

  return (
    <div className="border border-gray-300 dark:border-slate-600 rounded-lg overflow-hidden">
      {/* 툴바 */}
      <div className="flex flex-nowrap md:flex-wrap gap-1 p-2 bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-700 overflow-x-auto">
        {/* 텍스트 서식 */}
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))}>
          <strong>B</strong>
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))}>
          <em>I</em>
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btn(editor.isActive('underline'))}>
          <span className="underline">U</span>
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={btn(editor.isActive('strike'))}>
          <span className="line-through">S</span>
        </button>

        <span className="w-px bg-gray-300 dark:bg-slate-600 mx-1" />

        {/* 제목 */}
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={btn(editor.isActive('heading', { level: 1 }))}>
          H1
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive('heading', { level: 2 }))}>
          H2
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btn(editor.isActive('heading', { level: 3 }))}>
          H3
        </button>

        <span className="w-px bg-gray-300 dark:bg-slate-600 mx-1" />

        {/* 글자 색상 */}
        <input
          type="color"
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          className="w-8 h-8 rounded cursor-pointer border border-gray-300 dark:border-slate-600"
          title="글자 색상"
        />
        <button type="button" onClick={() => editor.chain().focus().unsetColor().run()} className={btn(false)}>
          기본색
        </button>

        <span className="w-px bg-gray-300 dark:bg-slate-600 mx-1" />

        {/* 정렬 */}
        <button type="button" onClick={() => editor.chain().focus().setTextAlign('left').run()} className={btn(editor.isActive({ textAlign: 'left' }))}>
          좌
        </button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign('center').run()} className={btn(editor.isActive({ textAlign: 'center' }))}>
          중
        </button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign('right').run()} className={btn(editor.isActive({ textAlign: 'right' }))}>
          우
        </button>

        <span className="w-px bg-gray-300 dark:bg-slate-600 mx-1" />

        {/* 목록 */}
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive('bulletList'))}>
          ● 목록
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive('orderedList'))}>
          1. 목록
        </button>

        <span className="w-px bg-gray-300 dark:bg-slate-600 mx-1" />

        {/* 삽입 */}
        <button type="button" onClick={() => openUrlInput('link')} className={btn(editor.isActive('link'))}>
          링크
        </button>
        <button
          type="button"
          onClick={() => onImageUpload ? setShowImageChoice((v) => !v) : openUrlInput('image')}
          className={btn(false)}
          disabled={isUploading}
        >
          {isUploading ? '업로드 중...' : '이미지'}
        </button>
        <button type="button" onClick={() => openUrlInput('youtube')} className={btn(false)}>
          YouTube
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btn(editor.isActive('blockquote'))}>
          인용
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={btn(editor.isActive('codeBlock'))}>
          코드
        </button>
        <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btn(false)}>
          구분선
        </button>

        <span className="w-px bg-gray-300 dark:bg-slate-600 mx-1" />

        {/* Undo/Redo */}
        <button type="button" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className={`${btn(false)} disabled:opacity-30`}>
          ↩
        </button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className={`${btn(false)} disabled:opacity-30`}>
          ↪
        </button>
      </div>

      {/* 이미지 삽입 방식 선택 바 */}
      {showImageChoice && (
        <div className="flex gap-2 p-2 bg-green-50 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => { openUrlInput('image'); setShowImageChoice(false); }}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
          >
            URL 입력
          </button>
          <button
            type="button"
            onClick={() => { fileInputRef.current?.click(); setShowImageChoice(false); }}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
          >
            파일 업로드
          </button>
          <button
            type="button"
            onClick={() => setShowImageChoice(false)}
            className="px-3 py-1.5 bg-gray-200 dark:bg-slate-600 text-gray-600 dark:text-slate-400 text-sm font-medium rounded hover:bg-gray-300 dark:hover:bg-slate-500 transition-colors"
          >
            취소
          </button>
        </div>
      )}

      {/* URL 입력 바 */}
      {urlInput && (
        <div className="flex gap-2 p-2 bg-blue-50 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-700">
          <input
            type="text"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitUrl(); if (e.key === 'Escape') setUrlInput(null); }}
            placeholder={urlLabels[urlInput] + '을 입력하세요'}
            className="flex-1 p-1.5 border border-gray-300 dark:border-slate-600 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
            autoFocus
          />
          <button type="button" onClick={submitUrl} className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors">
            확인
          </button>
          <button type="button" onClick={() => setUrlInput(null)} className="px-3 py-1.5 bg-gray-200 dark:bg-slate-600 text-gray-600 dark:text-slate-400 text-sm font-medium rounded hover:bg-gray-300 dark:hover:bg-slate-500 transition-colors">
            취소
          </button>
        </div>
      )}

      {/* 에디터 영역 */}
      <div className="relative">
        <EditorContent editor={editor} />
        {isUploading && (
          <div className="absolute inset-0 bg-white/60 dark:bg-slate-800/60 flex items-center justify-center z-10">
            <span className="text-sm text-gray-500 dark:text-slate-400 font-medium">
              이미지 업로드 중...
            </span>
          </div>
        )}
      </div>

      {/* 숨겨진 파일 입력 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
