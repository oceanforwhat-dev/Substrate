import { memo, useEffect, useRef, useState, type KeyboardEvent } from 'react';

interface InlineNamePromptProps {
  screenX: number;
  screenY: number;
  initialValue?: string;
  placeholder: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export const InlineNamePrompt = memo(function InlineNamePrompt({
  screenX,
  screenY,
  initialValue = '',
  placeholder,
  onConfirm,
  onCancel,
}: InlineNamePromptProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      onConfirm(value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      className="fixed z-[60] w-52 rounded-lg border border-orange-200 bg-white p-2 shadow-lg dark:border-orange-700 dark:bg-stone-800"
      style={{
        left: screenX,
        top: screenY,
        transform: 'translate(-50%, -50%)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full rounded border border-stone-200 px-2 py-1 text-sm text-stone-800 outline-none focus:border-orange-300 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
      />
    </div>
  );
});
