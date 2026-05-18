import { memo, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useI18n } from '../i18n/I18nContext';

interface TopicNameDialogProps {
  onConfirm: (title: string) => void;
  onCancel: () => void;
}

export const TopicNameDialog = memo(function TopicNameDialog({
  onConfirm,
  onCancel,
}: TopicNameDialogProps) {
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

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/30 p-4 dark:bg-black/50"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="topic-name-dialog-title"
        className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-5 shadow-lg dark:border-stone-600 dark:bg-stone-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="topic-name-dialog-title"
          className="text-base font-semibold text-stone-900 dark:text-stone-100"
        >
          {t('naming.newTopicTitle')}
        </h2>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('naming.topicPlaceholder')}
          className="mt-3 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(value)}
            className="rounded-lg bg-stone-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-900 dark:bg-stone-600 dark:hover:bg-stone-500"
          >
            {t('common.create')}
          </button>
        </div>
      </div>
    </div>
  );
});
