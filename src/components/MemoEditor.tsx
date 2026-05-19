import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { Memo } from '../schema';

import { useCanvasSelector } from '../store';
import {
  DeleteConfirmPopover,
  TrashIcon,
  deleteConfirmAnchorFromEvent,
  type DeleteConfirmAnchor,
} from './MemoSharedUi';

type MemoBinding = Memo['bindings'][number];

const EMPTY_BINDINGS: MemoBinding[] = [];

export interface MemoEditorProps {
  memoId: string | null;
  initialTitle: string;
  initialContent: string;
  initialBindings?: MemoBinding[];
  onSave: (title: string, content: string, bindings: MemoBinding[]) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

const BTN =
  'rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700';

const PRIMARY_BTN =
  'rounded-lg bg-stone-800 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-stone-900 dark:bg-stone-600 dark:hover:bg-stone-500';

const KEY_HIGHLIGHT: Record<number, string> = {
  1: 'bg-amber-200/90 text-amber-950 dark:bg-amber-800/80 dark:text-amber-100',
  2: 'bg-sky-200/90 text-sky-950 dark:bg-sky-800/80 dark:text-sky-100',
  3: 'bg-emerald-200/90 text-emerald-950 dark:bg-emerald-800/80 dark:text-emerald-100',
  4: 'bg-violet-200/90 text-violet-950 dark:bg-violet-800/80 dark:text-violet-100',
  5: 'bg-rose-200/90 text-rose-950 dark:bg-rose-800/80 dark:text-rose-100',
  6: 'bg-teal-200/90 text-teal-950 dark:bg-teal-800/80 dark:text-teal-100',
  7: 'bg-orange-200/90 text-orange-950 dark:bg-orange-800/80 dark:text-orange-100',
  8: 'bg-indigo-200/90 text-indigo-950 dark:bg-indigo-800/80 dark:text-indigo-100',
  9: 'bg-fuchsia-200/90 text-fuchsia-950 dark:bg-fuchsia-800/80 dark:text-fuchsia-100',
};

type BindingPopoverState = {
  text: string;
  anchorRect: DOMRect;
};

type TooltipState = {
  binding: MemoBinding;
  x: number;
  y: number;
};

function renderHighlightedContent(
  content: string,
  bindings: MemoBinding[],
  onBindingClick: (binding: MemoBinding, event: MouseEvent<HTMLElement>) => void,
): ReactNode {
  if (bindings.length === 0) {
    return content.length > 0 ? content : '\u00a0';
  }

  const positioned = bindings
    .map((binding) => ({ binding, start: content.indexOf(binding.text) }))
    .filter((entry) => entry.start >= 0)
    .sort((a, b) => a.start - b.start);

  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const { binding, start } of positioned) {
    const end = start + binding.text.length;
    if (end <= cursor) continue;
    if (start > cursor) {
      nodes.push(<span key={`t-${cursor}`}>{content.slice(cursor, start)}</span>);
    }
    const color = KEY_HIGHLIGHT[binding.key] ?? KEY_HIGHLIGHT[1];
    nodes.push(
      <mark
        key={`b-${binding.key}`}
        data-binding-key={binding.key}
        className={`cursor-pointer rounded px-0.5 ${color}`}
        onClick={(event) => {
          event.stopPropagation();
          onBindingClick(binding, event);
        }}
      >
        {binding.text}
        <span className="ml-0.5 inline-flex size-4 items-center justify-center rounded-full bg-stone-800 text-[9px] font-bold text-white dark:bg-stone-200 dark:text-stone-900">
          {binding.key}
        </span>
      </mark>,
    );
    cursor = end;
  }

  if (cursor < content.length) {
    nodes.push(<span key={`t-${cursor}`}>{content.slice(cursor)}</span>);
  }

  return nodes.length > 0 ? nodes : content || '\u00a0';
}

export const MemoEditor = memo(function MemoEditor({
  memoId,
  initialTitle,
  initialContent,
  initialBindings = [],
  onSave,
  onCancel,
  onDelete,
}: MemoEditorProps) {
  const { t } = useI18n();
  const dispatch = useCanvasSelector((s) => s.dispatch);
  const storeBindings = useCanvasSelector((s) => {
    if (!memoId) return EMPTY_BINDINGS;
    return s.memos.find((m) => m.id === memoId)?.bindings ?? EMPTY_BINDINGS;
  });

  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [localBindings, setLocalBindings] = useState<MemoBinding[]>(initialBindings);
  const [bindingMode, setBindingMode] = useState(false);
  const [bindingPopover, setBindingPopover] = useState<BindingPopoverState | null>(null);
  const [popoverLabel, setPopoverLabel] = useState('');
  const [popoverKey, setPopoverKey] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [deleteConfirmAnchor, setDeleteConfirmAnchor] = useState<DeleteConfirmAnchor | null>(
    null,
  );

  const titleRef = useRef<HTMLInputElement>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const backdropPointerDownRef = useRef(false);

  const bindings = memoId ? storeBindings : localBindings;

  const availableKeys = useMemo(() => {
    const used = new Set(bindings.map((b) => b.key));
    return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((key) => !used.has(key));
  }, [bindings]);

  useEffect(() => {
    setTitle(initialTitle);
    setContent(initialContent);
    setLocalBindings(initialBindings);
    setBindingMode(false);
    setBindingPopover(null);
    setTooltip(null);
    titleRef.current?.focus();
  }, [memoId, initialTitle, initialContent, initialBindings]);

  useEffect(() => {
    if (!flashMessage) return;
    const timer = window.setTimeout(() => setFlashMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [flashMessage]);

  useEffect(() => {
    if (bindingPopover && availableKeys.length > 0 && popoverKey == null) {
      setPopoverKey(availableKeys[0]!);
    }
  }, [availableKeys, bindingPopover, popoverKey]);

  const showFlash = useCallback((message: string) => {
    setFlashMessage(message);
  }, []);

  const applyBinding = useCallback(
    (binding: MemoBinding) => {
      if (memoId) {
        dispatch({
          type: 'MEMO_BINDING_SET',
          payload: { memoId, binding },
        });
      } else {
        setLocalBindings((prev) => [...prev.filter((b) => b.key !== binding.key), binding]);
      }
    },
    [dispatch, memoId],
  );

  const removeBinding = useCallback(
    (key: number) => {
      const next = bindings.filter((b) => b.key !== key);
      if (memoId) {
        dispatch({
          type: 'MEMO_UPDATED',
          payload: { id: memoId, changes: { bindings: next } },
        });
      } else {
        setLocalBindings(next);
      }
      setTooltip(null);
    },
    [bindings, dispatch, memoId],
  );

  const handleBindingClick = useCallback((binding: MemoBinding, event: MouseEvent<HTMLElement>) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({
      binding,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  }, []);

  const openBindingPopoverFromSelection = useCallback(() => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() ?? '';
    if (!selectedText) {
      showFlash(t('dashboard.memo.selectTextFirst'));
      return;
    }
    if (bindings.length >= 9) {
      showFlash(t('dashboard.memo.maxBindings'));
      return;
    }
    if (availableKeys.length === 0) {
      showFlash(t('dashboard.memo.maxBindings'));
      return;
    }

    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const anchorRect = range?.getBoundingClientRect();
    if (!anchorRect || (anchorRect.width === 0 && anchorRect.height === 0)) {
      showFlash(t('dashboard.memo.selectTextFirst'));
      return;
    }

    setPopoverLabel('');
    setPopoverKey(availableKeys[0] ?? null);
    setBindingPopover({ text: selectedText, anchorRect });
    selection?.removeAllRanges();
  }, [availableKeys.length, bindings.length, showFlash, t]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (bindingPopover) {
          setBindingPopover(null);
          return;
        }
        if (bindingMode) {
          setBindingMode(false);
          return;
        }
        onCancel();
        return;
      }

      if (!bindingMode || bindingPopover) return;
      if (event.key !== 'Enter') return;
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }

      const area = contentAreaRef.current;
      const selection = window.getSelection();
      if (!area || !selection || selection.isCollapsed) return;
      const anchor = selection.anchorNode;
      if (!anchor || !area.contains(anchor)) return;

      event.preventDefault();
      openBindingPopoverFromSelection();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [bindingMode, bindingPopover, onCancel, openBindingPopoverFromSelection]);

  const handleSave = useCallback(() => {
    const trimmedTitle = title.trim();
    const resolvedTitle = trimmedTitle || t('dashboard.memo.defaultTitle');
    onSave(resolvedTitle, content, bindings);
  }, [bindings, content, onSave, t, title]);

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter' && !event.shiftKey && !bindingMode) {
      event.preventDefault();
      handleSave();
    }
  };

  const confirmBindingPopover = () => {
    if (popoverKey == null || !bindingPopover) return;
    const label = popoverLabel.trim() || bindingPopover.text;
    applyBinding({
      key: popoverKey,
      label,
      text: bindingPopover.text,
    });
    setBindingPopover(null);
    setPopoverLabel('');
    setPopoverKey(null);
  };

  const cancelBindingPopover = () => {
    setBindingPopover(null);
    setPopoverLabel('');
    setPopoverKey(null);
    window.getSelection()?.removeAllRanges();
  };

  const hasHighlights = bindings.length > 0;

  const handleBackdropPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    backdropPointerDownRef.current = event.target === event.currentTarget;
  };

  const handleBackdropPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (
      backdropPointerDownRef.current &&
      event.target === event.currentTarget
    ) {
      onCancel();
    }
    backdropPointerDownRef.current = false;
  };

  const handleBackdropPointerCancel = () => {
    backdropPointerDownRef.current = false;
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4 dark:bg-black/60"
      onPointerDown={handleBackdropPointerDown}
      onPointerUp={handleBackdropPointerUp}
      onPointerCancel={handleBackdropPointerCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="memo-editor-title"
        className="flex h-[min(calc(100vh-2rem),max(500px,75vh))] w-[min(100%,max(600px,66.666vw))] max-h-[calc(100vh-2rem)] flex-col rounded-xl border border-stone-200 bg-white shadow-xl dark:border-stone-600 dark:bg-stone-800"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setTooltip(null);
        }}
      >
        <div className="shrink-0 border-b border-stone-200 px-5 py-4 dark:border-stone-700">
          <input
            ref={titleRef}
            id="memo-editor-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            placeholder={t('dashboard.memo.titlePlaceholder')}
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-900 outline-none focus:border-stone-500 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
          />
        </div>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-5 py-4">
          {bindingMode && (
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-900 dark:bg-orange-950 dark:text-orange-200">
                {t('dashboard.memo.bindingModeActive')}
              </span>
              <span className="text-xs text-stone-500 dark:text-stone-400">
                {t('dashboard.memo.bindingModeHint')}
              </span>
            </div>
          )}

          {flashMessage && (
            <p className="mb-2 text-xs font-medium text-orange-700 dark:text-orange-300">
              {flashMessage}
            </p>
          )}

          {bindingMode ? (
            <div
              ref={contentAreaRef}
              className={`min-h-0 flex-1 select-text whitespace-pre-wrap overflow-y-auto rounded-lg border-2 bg-white px-3 py-2 text-sm leading-relaxed text-stone-900 dark:bg-stone-900 dark:text-stone-100 ${
                bindingMode
                  ? 'border-orange-400 ring-2 ring-orange-200 dark:border-orange-500 dark:ring-orange-900/40'
                  : 'border-stone-300 dark:border-stone-600'
              }`}
            >
              {renderHighlightedContent(content, bindings, handleBindingClick)}
            </div>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
              {hasHighlights && (
                <div className="max-h-32 shrink-0 select-text overflow-y-auto whitespace-pre-wrap rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm leading-relaxed text-stone-900 dark:border-stone-600 dark:bg-stone-900/50 dark:text-stone-100">
                  {renderHighlightedContent(content, bindings, handleBindingClick)}
                </div>
              )}
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-0 min-w-0 w-full flex-1 resize-none whitespace-pre-wrap break-words rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm leading-relaxed text-stone-900 outline-none focus:border-stone-500 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
              />
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-stone-200 px-5 py-4 dark:border-stone-700">
          <div className="flex flex-wrap gap-2">
            {bindingMode ? (
              <button
                type="button"
                onClick={() => setBindingMode(false)}
                className={PRIMARY_BTN}
              >
                {t('dashboard.memo.finishBinding')}
              </button>
            ) : (
              <button type="button" onClick={() => setBindingMode(true)} className={BTN}>
                {t('dashboard.memo.makeBindable')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onDelete && memoId && (
              <button
                type="button"
                aria-label={t('dashboard.memo.deleteMemo')}
                onClick={(e) =>
                  setDeleteConfirmAnchor(deleteConfirmAnchorFromEvent(e))
                }
                className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <TrashIcon />
              </button>
            )}
            <button type="button" onClick={onCancel} className={BTN}>
              {t('common.cancel')}
            </button>
            <button type="button" onClick={handleSave} className={PRIMARY_BTN}>
              {t('common.save')}
            </button>
          </div>
        </div>

        {deleteConfirmAnchor && onDelete && (
          <DeleteConfirmPopover
            anchor={deleteConfirmAnchor}
            onConfirm={() => {
              setDeleteConfirmAnchor(null);
              onDelete();
            }}
            onCancel={() => setDeleteConfirmAnchor(null)}
          />
        )}

        {bindingPopover && (
          <div
            role="dialog"
            aria-label={t('dashboard.memo.bindingPopoverTitle')}
            className="fixed z-[110] w-64 rounded-lg border border-stone-200 bg-white p-3 shadow-lg dark:border-stone-600 dark:bg-stone-800"
            style={{
              top: Math.min(bindingPopover.anchorRect.bottom + 8, window.innerHeight - 200),
              left: Math.min(
                bindingPopover.anchorRect.left,
                window.innerWidth - 280,
              ),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 line-clamp-2 text-xs text-stone-500 dark:text-stone-400">
              “{bindingPopover.text}”
            </p>
            <label className="mb-2 block text-xs font-medium text-stone-600 dark:text-stone-300">
              {t('dashboard.memo.bindingLabel')}
              <input
                type="text"
                value={popoverLabel}
                onChange={(e) => setPopoverLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    confirmBindingPopover();
                  }
                }}
                placeholder={bindingPopover.text}
                className="mt-1 w-full rounded border border-stone-300 bg-white px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
              />
            </label>
            <label className="mb-3 block text-xs font-medium text-stone-600 dark:text-stone-300">
              {t('dashboard.memo.bindingKey')}
              <select
                value={popoverKey ?? ''}
                onChange={(e) => setPopoverKey(Number(e.target.value))}
                className="mt-1 w-full rounded border border-stone-300 bg-white px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((key) => {
                  const used = bindings.some((b) => b.key === key);
                  return (
                    <option key={key} value={key} disabled={used} className={used ? 'text-stone-400' : ''}>
                      {key}
                      {used ? ` (${t('dashboard.memo.keyTaken')})` : ''}
                    </option>
                  );
                })}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={cancelBindingPopover} className={BTN}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={confirmBindingPopover}
                disabled={popoverKey == null || bindings.some((b) => b.key === popoverKey)}
                className={PRIMARY_BTN}
              >
                {t('dashboard.memo.bindingConfirm')}
              </button>
            </div>
          </div>
        )}

        {tooltip && (
          <div
            className="fixed z-[110] -translate-x-1/2 -translate-y-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-stone-600 dark:bg-stone-800"
            style={{ left: tooltip.x, top: tooltip.y - 8 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold text-stone-800 dark:text-stone-100">
                [{tooltip.binding.key}] {tooltip.binding.label}
              </span>
              <button
                type="button"
                aria-label={t('dashboard.memo.deleteBinding')}
                onClick={() => removeBinding(tooltip.binding.key)}
                className="rounded p-0.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
