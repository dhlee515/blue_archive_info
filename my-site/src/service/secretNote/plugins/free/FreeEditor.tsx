import RichTextEditor from '@/service/guide/components/RichTextEditor';
import { uploadGuideImage } from '@/service/guide/utils/uploadGuideImage';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function FreeEditor({ value, onChange }: Props) {
  return <RichTextEditor content={value} onChange={onChange} onImageUpload={uploadGuideImage} />;
}
