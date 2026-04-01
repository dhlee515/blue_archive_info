import { useState, useCallback } from 'react';
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
}

type UrlInputType = 'link' | 'image' | 'youtube' | null;

export default function RichTextEditor({ content, onChange }: Props) {
  const [urlInput, setUrlInput] = useState<UrlInputType>(null);
  const [urlValue, setUrlValue] = useState('');

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

  if (!editor) return null;

  const btn = (active: boolean) =>
    `px-2 py-1 rounded text-sm font-medium transition-colors ${
      active ? 'bg-blue-100 text-blue-700' : 'bg-white text-gray-600 hover:bg-gray-100'
    }`;

  const urlLabels: Record<string, string> = {
    link: '링크 URL',
    image: '이미지 URL',
    youtube: 'YouTube URL',
  };

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      {/* 툴바 */}
      <div className="flex flex-wrap gap-1 p-2 bg-gray-50 border-b border-gray-200">
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

        <span className="w-px bg-gray-300 mx-1" />

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

        <span className="w-px bg-gray-300 mx-1" />

        {/* 글자 색상 */}
        <input
          type="color"
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          className="w-8 h-8 rounded cursor-pointer border border-gray-300"
          title="글자 색상"
        />
        <button type="button" onClick={() => editor.chain().focus().unsetColor().run()} className={btn(false)}>
          기본색
        </button>

        <span className="w-px bg-gray-300 mx-1" />

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

        <span className="w-px bg-gray-300 mx-1" />

        {/* 목록 */}
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive('bulletList'))}>
          ● 목록
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive('orderedList'))}>
          1. 목록
        </button>

        <span className="w-px bg-gray-300 mx-1" />

        {/* 삽입 */}
        <button type="button" onClick={() => openUrlInput('link')} className={btn(editor.isActive('link'))}>
          링크
        </button>
        <button type="button" onClick={() => openUrlInput('image')} className={btn(false)}>
          이미지
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

        <span className="w-px bg-gray-300 mx-1" />

        {/* Undo/Redo */}
        <button type="button" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className={`${btn(false)} disabled:opacity-30`}>
          ↩
        </button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className={`${btn(false)} disabled:opacity-30`}>
          ↪
        </button>
      </div>

      {/* URL 입력 바 */}
      {urlInput && (
        <div className="flex gap-2 p-2 bg-blue-50 border-b border-gray-200">
          <input
            type="text"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitUrl(); if (e.key === 'Escape') setUrlInput(null); }}
            placeholder={urlLabels[urlInput] + '을 입력하세요'}
            className="flex-1 p-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            autoFocus
          />
          <button type="button" onClick={submitUrl} className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors">
            확인
          </button>
          <button type="button" onClick={() => setUrlInput(null)} className="px-3 py-1.5 bg-gray-200 text-gray-600 text-sm font-medium rounded hover:bg-gray-300 transition-colors">
            취소
          </button>
        </div>
      )}

      {/* 에디터 영역 */}
      <EditorContent editor={editor} />
    </div>
  );
}
