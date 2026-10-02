import { useState, type InputHTMLAttributes } from 'react';

type NativeProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'inputMode' | 'value' | 'defaultValue' | 'onChange' | 'min' | 'max'
>;

interface Props extends NativeProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** 입력을 비운 채 blur 했을 때 확정할 값 (기본 min) */
  emptyValue?: number;
  /** 값이 0 이면 빈칸으로 표시 (placeholder 노출용) */
  zeroAsEmpty?: boolean;
}

/**
 * 0 이상 정수 입력 — type="text" + inputMode="numeric".
 * - 스피너 / 마우스 휠로 값이 바뀌지 않고, 모바일에선 숫자 키패드.
 * - 포커스 시 전체 선택 → 바로 덮어쓰기.
 * - 입력 중에는 draft 문자열을 유지해 빈칸 / min 미만 중간값을 허용 (예: min 30 에서 "4" → "45").
 *   [min, max] 안의 값만 즉시 onChange, max 초과는 max 로 고정, 나머지는 blur 시 보정해 확정.
 */
export default function NumberInput({
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  emptyValue,
  zeroAsEmpty = false,
  onFocus,
  onBlur,
  ...rest
}: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (zeroAsEmpty && value === 0 ? '' : String(value));

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      value={shown}
      onFocus={(e) => {
        e.currentTarget.select();
        onFocus?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/\D/g, '');
        if (raw === '') {
          setDraft('');
          return;
        }
        const n = Number(raw);
        if (n > max) {
          setDraft(String(max));
          onChange(max);
          return;
        }
        setDraft(raw);
        if (n >= min) onChange(n);
      }}
      onBlur={(e) => {
        if (draft !== null) {
          const n = draft === '' ? (emptyValue ?? min) : Math.max(min, Math.min(max, Number(draft)));
          if (n !== value) onChange(n);
        }
        setDraft(null);
        onBlur?.(e);
      }}
    />
  );
}
