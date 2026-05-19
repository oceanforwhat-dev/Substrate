import { memo, useEffect, useRef, type MouseEvent } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { Memo } from '../schema';
import type { CanvasStore } from '../store';

export function deleteMemoById(
  dispatch: CanvasStore['dispatch'],
  memo: Pick<Memo, 'id' | 'isEquipped'>,
): void {
  if (memo.isEquipped) {
    dispatch({ type: 'MEMO_UNEQUIPPED', payload: { memoId: memo.id } });
  }
  dispatch({ type: 'MEMO_DELETED', payload: { id: memo.id } });
}

export const TrashIcon = memo(function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="size-4"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.493.153l.375 6a.75.75 0 101.493.144l-.375-6zm3.84.144a.75.75 0 00-1.493-.144l-.375 6a.75.75 0 001.493.144l.375-6z"
        clipRule="evenodd"
      />
    </svg>
  );
});

interface EquipToggleProps {
  checked: boolean;
  onChange: (equipped: boolean) => void;
  ariaLabel: string;
}

export const EquipToggle = memo(function EquipToggle({
  checked,
  onChange,
  ariaLabel,
}: EquipToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ease-in-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 ${
        checked ? 'bg-emerald-500 dark:bg-emerald-600' : 'bg-stone-300 dark:bg-stone-600'
      }`}
    >
      <span
        className={`pointer-events-none inline-block size-5 translate-y-0.5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
          checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
});

export type DeleteConfirmAnchor = {
  top: number;
  left: number;
};

interface DeleteConfirmPopoverProps {
  anchor: DeleteConfirmAnchor;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteConfirmPopover = memo(function DeleteConfirmPopover({
  anchor,
  onConfirm,
  onCancel,
}: DeleteConfirmPopoverProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onCancel();
      }
    };
    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => window.removeEventListener('pointerdown', handlePointerDown, true);
  }, [onCancel]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t('dashboard.memo.confirmDelete')}
      className="fixed z-[120] w-44 rounded-lg border border-stone-200 bg-white p-3 shadow-lg dark:border-stone-600 dark:bg-stone-800"
      style={{
        top: anchor.top,
        left: anchor.left,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="mb-3 text-xs text-stone-700 dark:text-stone-200">
        {t('dashboard.memo.confirmDelete')}
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-stone-200 px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-700"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-lg bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
        >
          {t('dashboard.memo.bindingConfirm')}
        </button>
      </div>
    </div>
  );
});

export function deleteConfirmAnchorFromEvent(
  event: MouseEvent<HTMLElement>,
): DeleteConfirmAnchor {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    top: rect.bottom + 6,
    left: Math.min(rect.left, window.innerWidth - 200),
  };
}
