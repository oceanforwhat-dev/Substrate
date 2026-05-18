import { memo, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useI18n } from '../i18n/I18nContext';

export type ModifierPromptKind = 'text' | 'image';

interface ModifierPromptProps {
  screenX: number;
  screenY: number;
  kind: ModifierPromptKind;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export const ModifierPrompt = memo(function ModifierPrompt({
  screenX,
  screenY,
  kind,
  onConfirm,
  onCancel,
}: ModifierPromptProps) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
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

  const placeholder =
    kind === 'text' ? t('prompt.textModifier') : t('prompt.imageUrl');

  return (
    <>
      <div
        className="fixed inset-0 z-[55]"
        aria-hidden
        onMouseDown={onCancel}
      />
      <div
        className="fixed z-[60] w-64 rounded-lg border border-stone-200 bg-white p-3 shadow-lg dark:border-stone-600 dark:bg-stone-800"
        style={{
          left: screenX,
          top: screenY,
          transform: 'translate(-8px, 8px)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type={kind === 'image' ? 'url' : 'text'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full rounded border border-stone-200 px-2 py-1.5 text-sm text-stone-800 outline-none focus:border-orange-300 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => onConfirm(value)}
            className="flex-1 rounded bg-orange-500 px-2.5 py-1 text-sm font-medium text-white hover:bg-orange-600"
          >
            {t('common.create')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded border border-stone-200 px-2.5 py-1 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </>
  );
});
