import { memo, useCallback, useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';

interface TagsEditorDialogProps {
  topicTitle: string;
  initialTags: string[];
  onSave: (tags: string[]) => void;
  onCancel: () => void;
}

export const TagsEditorDialog = memo(function TagsEditorDialog({
  topicTitle,
  initialTags,
  onSave,
  onCancel,
}: TagsEditorDialogProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(initialTags.join(', '));

  useEffect(() => {
    setDraft(initialTags.join(', '));
  }, [initialTags]);

  const commit = useCallback(() => {
    const tags = draft
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    onSave([...new Set(tags)]);
  }, [draft, onSave]);

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/30 p-4 dark:bg-black/50"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-lg dark:border-stone-600 dark:bg-stone-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
          {t('dashboard.tagsTitle')}
        </h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{topicTitle}</p>
        <label className="mt-4 block text-xs font-medium text-stone-600 dark:text-stone-300">
          {t('dashboard.tagsHint')}
        </label>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
            if (e.key === 'Escape') onCancel();
          }}
          className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
          autoFocus
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={commit}
            className="rounded-lg bg-stone-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-900 dark:bg-stone-600"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
});
