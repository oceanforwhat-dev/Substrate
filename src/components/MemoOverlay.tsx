import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { memo, useEffect, useState, type CSSProperties } from 'react';
import { useThresholdWindowDrag } from '../hooks/useThresholdWindowDrag';
import { useI18n } from '../i18n/I18nContext';
import { MemoSchema, type Memo } from '../schema';

const FADE_IN_MS = 200;
const FADE_OUT_MS = 150;

function parseEquippedMemo(json: string | null | undefined): Memo | null {
  if (!json) return null;
  try {
    return MemoSchema.parse(JSON.parse(json));
  } catch {
    return null;
  }
}

function sortedBindings(memo: Memo) {
  return [...memo.bindings].sort((a, b) => a.key - b.key);
}

function overlayFadeStyle(visible: boolean): CSSProperties {
  return {
    opacity: visible ? 1 : 0,
    transitionProperty: 'opacity',
    transitionTimingFunction: 'ease-out',
    transitionDuration: `${visible ? FADE_IN_MS : FADE_OUT_MS}ms`,
  };
}

export const MemoOverlay = memo(function MemoOverlay() {
  const { t } = useI18n();
  const [equippedMemo, setEquippedMemo] = useState<Memo | null>(null);
  const [visible, setVisible] = useState(false);
  const [quickCopyMode, setQuickCopyMode] = useState(false);
  const [quickCopyFlash, setQuickCopyFlash] = useState<string | null>(null);
  const windowDrag = useThresholdWindowDrag();

  useEffect(() => {
    document.documentElement.classList.add('overlay-window');
    return () => document.documentElement.classList.remove('overlay-window');
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const apply = (json: string | null | undefined) => {
      if (!cancelled) {
        setEquippedMemo(parseEquippedMemo(json));
      }
    };

    void invoke<string | null>('get_equipped_memo').then(apply).catch(console.error);

    let unlistenDown: (() => void) | undefined;
    void listen<string>('mmb-down', (event) => apply(event.payload))
      .then((fn) => {
        unlistenDown = fn;
      })
      .catch(console.error);

    let unlistenUp: (() => void) | undefined;
    void listen('mmb-up', () => {
      if (!cancelled) {
        setVisible(false);
        setQuickCopyMode(false);
      }
    })
      .then((fn) => {
        unlistenUp = fn;
      })
      .catch(console.error);

    let unlistenQuickCopyEnter: (() => void) | undefined;
    void listen('quick-copy-mode-enter', () => {
      if (!cancelled) {
        console.log('[MemoOverlay] quick-copy-mode-enter');
        setQuickCopyMode(true);
      }
    })
      .then((fn) => {
        unlistenQuickCopyEnter = fn;
      })
      .catch(console.error);

    let unlistenQuickCopyExit: (() => void) | undefined;
    void listen('quick-copy-mode-exit', () => {
      if (!cancelled) {
        console.log('[MemoOverlay] quick-copy-mode-exit');
        setQuickCopyMode(false);
        setQuickCopyFlash(null);
      }
    })
      .then((fn) => {
        unlistenQuickCopyExit = fn;
      })
      .catch(console.error);

    let unlistenUnbound: (() => void) | undefined;
    void listen('quick-copy-unbound', () => {
      if (!cancelled) {
        setQuickCopyFlash(t('overlay.quickCopy.unbound'));
      }
    })
      .then((fn) => {
        unlistenUnbound = fn;
      })
      .catch(console.error);

    let unlistenCopied: (() => void) | undefined;
    void listen('quick-copy-copied-to-clipboard', () => {
      if (!cancelled) {
        setQuickCopyFlash(t('overlay.quickCopy.copiedToClipboard'));
      }
    })
      .then((fn) => {
        unlistenCopied = fn;
      })
      .catch(console.error);

    return () => {
      cancelled = true;
      unlistenDown?.();
      unlistenUp?.();
      unlistenQuickCopyEnter?.();
      unlistenQuickCopyExit?.();
      unlistenUnbound?.();
      unlistenCopied?.();
    };
  }, [t]);

  useEffect(() => {
    if (!quickCopyFlash) return;
    const timer = window.setTimeout(() => setQuickCopyFlash(null), 200);
    return () => window.clearTimeout(timer);
  }, [quickCopyFlash]);

  const handleClose = () => {
    void invoke('close_memo_overlay').catch(console.error);
  };

  if (!equippedMemo) {
    return (
      <div
        className="h-full w-full cursor-grab"
        style={overlayFadeStyle(visible)}
        onPointerDown={windowDrag.onPointerDown}
        aria-hidden="true"
      />
    );
  }

  const bindings = sortedBindings(equippedMemo);
  const title = equippedMemo.title.trim() || t('dashboard.memo.defaultTitle');

  return (
    <div
      className="flex h-full w-full min-w-0 cursor-grab p-2"
      style={overlayFadeStyle(visible)}
      onPointerDown={windowDrag.onPointerDown}
    >
      <div
        className={`flex h-full w-full min-w-0 max-w-full flex-col overflow-hidden rounded-lg bg-gray-900/85 shadow-2xl ring-2 transition-shadow duration-200 ${
          quickCopyMode
            ? 'ring-sky-400/80 shadow-sky-500/20'
            : 'ring-1 ring-stone-700/50'
        }`}
      >
        <div className="flex shrink-0 select-none items-center justify-between gap-2 border-b border-stone-600/40 px-3 py-2">
          <p className="min-w-0 flex-1 truncate text-xs font-medium text-stone-300">
            {title}
          </p>
          <button
            type="button"
            data-overlay-no-drag
            aria-label={t('common.close')}
            onClick={handleClose}
            className="shrink-0 cursor-pointer rounded p-1 text-stone-400 transition-colors hover:bg-stone-700/70 hover:text-stone-100"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M3 3L11 11M11 3L3 11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {quickCopyMode && (
          <p className="shrink-0 select-none border-b border-sky-500/30 bg-sky-950/40 px-3 py-1.5 text-center text-[11px] text-sky-200/90">
            {quickCopyFlash ?? t('overlay.quickCopy.hint')}
          </p>
        )}

        <div
          data-overlay-scroll
          className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-3"
        >
          <div className="w-full max-w-full whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-100">
            {equippedMemo.content}
          </div>
        </div>

        {bindings.length > 0 && (
          <ul
            data-overlay-no-drag
            className={`shrink-0 space-y-1 border-t px-3 py-2 ${
              quickCopyMode
                ? 'border-sky-500/40 bg-sky-950/30'
                : 'border-stone-600/60 bg-stone-900/40'
            }`}
          >
            {bindings.map((binding) => (
              <li
                key={binding.key}
                data-overlay-no-drag
                className={`cursor-pointer truncate text-xs ${
                  quickCopyMode
                    ? 'animate-pulse text-stone-100'
                    : 'text-stone-300'
                }`}
              >
                <span className="font-semibold text-stone-100">[{binding.key}]</span>{' '}
                {binding.label.trim() || binding.text.slice(0, 40)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
});
