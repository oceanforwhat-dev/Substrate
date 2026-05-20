import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useThresholdWindowDrag } from '../hooks/useThresholdWindowDrag';
import { useI18n } from '../i18n/I18nContext';
import { notifyMemoEquipped } from '../lib/memoTauri';
import type { Memo } from '../schema';
import { useCanvasSelector, useCanvasStore } from '../store';

const FADE_IN_MS = 200;
const FADE_OUT_MS = 150;
const MEMO_SYNC_POLL_MS = 1500;
const MEMO_CROSSFADE_MS = 125;

type SwitchDirection = 'prev' | 'next';

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

function nextFocusedId(
  equippedMemos: Memo[],
  currentFocusedMemoId: string | null,
  direction: SwitchDirection,
): string | null {
  if (equippedMemos.length === 0) return null;
  const idx = equippedMemos.findIndex((m) => m.id === currentFocusedMemoId);
  const currentIdx = idx === -1 ? 0 : idx;
  const delta = direction === 'next' ? 1 : -1;
  const nextIdx = (currentIdx + delta + equippedMemos.length) % equippedMemos.length;
  return equippedMemos[nextIdx].id;
}

export const MemoOverlay = memo(function MemoOverlay() {
  const { t } = useI18n();
  const equippedMemos = useCanvasSelector((s) => s.equippedMemos);
  const currentFocusedMemoId = useCanvasSelector((s) => s.currentFocusedMemoId);
  const dispatch = useCanvasSelector((s) => s.dispatch);
  const [visible, setVisible] = useState(false);
  const [quickCopyMode, setQuickCopyMode] = useState(false);
  const [quickCopyFlash, setQuickCopyFlash] = useState<string | null>(null);
  const [titleMenuOpen, setTitleMenuOpen] = useState(false);
  const titleMenuRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fadeGenRef = useRef(0);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [displayedMemo, setDisplayedMemo] = useState<Memo | null>(null);
  const [bodyOpacity, setBodyOpacity] = useState(1);
  const windowDrag = useThresholdWindowDrag();

  const bodyFadeStyle: CSSProperties = {
    opacity: bodyOpacity,
    transition: `opacity ${MEMO_CROSSFADE_MS}ms ease-out`,
  };

  const focusedMemo = useMemo(() => {
    if (equippedMemos.length === 0) return null;
    if (currentFocusedMemoId) {
      const match = equippedMemos.find((m) => m.id === currentFocusedMemoId);
      if (match) return match;
    }
    return equippedMemos[0];
  }, [equippedMemos, currentFocusedMemoId]);

  const canSwitch = equippedMemos.length > 1;

  const syncFocusedToBackend = useCallback((memo: Memo) => {
    void notifyMemoEquipped(memo);
  }, []);

  const applyFocus = useCallback(
    (memoId: string) => {
      const memo = equippedMemos.find((m) => m.id === memoId);
      if (!memo) return;
      if (currentFocusedMemoId !== memoId) {
        dispatch({ type: 'FOCUSED_MEMO_CHANGED', payload: { memoId } });
      }
      syncFocusedToBackend(memo);
      setTitleMenuOpen(false);
    },
    [currentFocusedMemoId, dispatch, equippedMemos, syncFocusedToBackend],
  );

  const switchMemo = useCallback(
    (direction: SwitchDirection) => {
      if (!canSwitch) return;
      const nextId = nextFocusedId(equippedMemos, currentFocusedMemoId, direction);
      if (!nextId) return;
      applyFocus(nextId);
    },
    [applyFocus, canSwitch, currentFocusedMemoId, equippedMemos],
  );

  const ensureValidFocus = useCallback(() => {
    if (equippedMemos.length === 0) return;
    const stillValid =
      currentFocusedMemoId != null &&
      equippedMemos.some((m) => m.id === currentFocusedMemoId);
    if (!stillValid) {
      applyFocus(equippedMemos[0].id);
    }
  }, [applyFocus, currentFocusedMemoId, equippedMemos]);

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
    void useCanvasStore
      .getState()
      .loadMemos()
      .then(() => {
        const { equippedMemos: loaded, currentFocusedMemoId: focusedId } =
          useCanvasStore.getState();
        if (loaded.length === 0) return;
        const stillValid = focusedId != null && loaded.some((m) => m.id === focusedId);
        if (stillValid) {
          const memo = loaded.find((m) => m.id === focusedId)!;
          syncFocusedToBackend(memo);
        } else {
          const first = loaded[0];
          dispatch({ type: 'FOCUSED_MEMO_CHANGED', payload: { memoId: first.id } });
          syncFocusedToBackend(first);
        }
      })
      .catch(console.error);
  }, [dispatch, syncFocusedToBackend]);

  useEffect(() => {
    ensureValidFocus();
  }, [ensureValidFocus]);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setInterval(() => {
      void useCanvasStore
        .getState()
        .loadMemos()
        .catch(console.error);
    }, MEMO_SYNC_POLL_MS);
    return () => window.clearInterval(timer);
  }, [visible]);

  useEffect(() => {
    if (!focusedMemo) {
      fadeGenRef.current += 1;
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
      setDisplayedMemo(null);
      setBodyOpacity(1);
      return;
    }

    if (!displayedMemo) {
      setDisplayedMemo(focusedMemo);
      setBodyOpacity(1);
      return;
    }

    if (displayedMemo.id === focusedMemo.id) return;

    const gen = ++fadeGenRef.current;
    if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
    setBodyOpacity(0);

    fadeTimerRef.current = window.setTimeout(() => {
      if (fadeGenRef.current !== gen) return;
      setDisplayedMemo(focusedMemo);
      scrollRef.current?.scrollTo(0, 0);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (fadeGenRef.current !== gen) return;
          setBodyOpacity(1);
        });
      });
    }, MEMO_CROSSFADE_MS);

    return () => {
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
    };
  }, [focusedMemo, displayedMemo?.id]);

  useEffect(() => {
    if (!titleMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (titleMenuRef.current?.contains(event.target as Node)) return;
      setTitleMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [titleMenuOpen]);

  useEffect(() => {
    let cancelled = false;

    let unlistenUp: (() => void) | undefined;
    void listen('mmb-up', () => {
      if (!cancelled) {
        setVisible(false);
        setQuickCopyMode(false);
        setTitleMenuOpen(false);
      }
    })
      .then((fn) => {
        unlistenUp = fn;
      })
      .catch(console.error);

    let unlistenSwitch: (() => void) | undefined;
    void listen<{ direction: SwitchDirection }>('switch-memo', (event) => {
      if (cancelled) return;
      const direction = event.payload.direction;
      if (direction === 'prev' || direction === 'next') {
        switchMemo(direction);
      }
    })
      .then((fn) => {
        unlistenSwitch = fn;
      })
      .catch(console.error);

    let unlistenQuickCopyEnter: (() => void) | undefined;
    void listen('quick-copy-mode-enter', () => {
      if (!cancelled) setQuickCopyMode(true);
    })
      .then((fn) => {
        unlistenQuickCopyEnter = fn;
      })
      .catch(console.error);

    let unlistenQuickCopyExit: (() => void) | undefined;
    void listen('quick-copy-mode-exit', () => {
      if (!cancelled) {
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
      if (!cancelled) setQuickCopyFlash(t('overlay.quickCopy.unbound'));
    })
      .then((fn) => {
        unlistenUnbound = fn;
      })
      .catch(console.error);

    let unlistenCopied: (() => void) | undefined;
    void listen('quick-copy-copied-to-clipboard', () => {
      if (!cancelled) setQuickCopyFlash(t('overlay.quickCopy.copiedToClipboard'));
    })
      .then((fn) => {
        unlistenCopied = fn;
      })
      .catch(console.error);

    let unlistenEquipped: (() => void) | undefined;
    void listen('memo-equipped', () => {
      if (cancelled) return;
      void useCanvasStore
        .getState()
        .loadMemos()
        .catch(console.error);
    })
      .then((fn) => {
        unlistenEquipped = fn;
      })
      .catch(console.error);

    let unlistenUnequipped: (() => void) | undefined;
    void listen('memo-unequipped', () => {
      if (cancelled) return;
      void useCanvasStore
        .getState()
        .loadMemos()
        .catch(console.error);
    })
      .then((fn) => {
        unlistenUnequipped = fn;
      })
      .catch(console.error);

    return () => {
      cancelled = true;
      unlistenUp?.();
      unlistenSwitch?.();
      unlistenQuickCopyEnter?.();
      unlistenQuickCopyExit?.();
      unlistenUnbound?.();
      unlistenCopied?.();
      unlistenEquipped?.();
      unlistenUnequipped?.();
    };
  }, [switchMemo, t]);

  useEffect(() => {
    if (!quickCopyFlash) return;
    const timer = window.setTimeout(() => setQuickCopyFlash(null), 200);
    return () => window.clearTimeout(timer);
  }, [quickCopyFlash]);

  const handleClose = () => {
    void invoke('close_memo_overlay').catch(console.error);
  };

  if (!focusedMemo) {
    return (
      <div
        className="h-full w-full cursor-grab"
        style={overlayFadeStyle(visible)}
        onPointerDown={windowDrag.onPointerDown}
        aria-hidden="true"
      />
    );
  }

  const memoForBody = displayedMemo ?? focusedMemo;
  const bindings = sortedBindings(memoForBody);
  const title = memoForBody.title.trim() || t('dashboard.memo.defaultTitle');

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
        <div className="relative flex shrink-0 select-none items-center gap-1 border-b border-stone-600/40 px-2 py-2">
          <button
            type="button"
            data-overlay-no-drag
            disabled={!canSwitch}
            aria-label={t('overlay.nav.prev')}
            onClick={() => switchMemo('prev')}
            className={`shrink-0 rounded p-1 text-sm leading-none transition-colors ${
              canSwitch
                ? 'cursor-pointer text-stone-400/70 hover:text-stone-100'
                : 'cursor-default text-stone-600/40'
            }`}
          >
            ‹
          </button>

          <div
            ref={titleMenuRef}
            className="relative min-w-0 flex-1"
            data-overlay-no-drag
            style={bodyFadeStyle}
          >
            <button
              type="button"
              data-overlay-no-drag
              onClick={() => setTitleMenuOpen((open) => !open)}
              className="w-full truncate rounded px-1 py-0.5 text-left text-xs font-medium text-stone-300 transition-colors hover:bg-stone-700/50 hover:text-stone-100"
            >
              {title}
            </button>
            {titleMenuOpen && (
              <ul
                data-overlay-no-drag
                className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-md border border-stone-600/60 bg-gray-900/95 py-1 shadow-lg"
              >
                {equippedMemos.map((memo) => {
                  const itemTitle = memo.title.trim() || t('dashboard.memo.defaultTitle');
                  const isActive = memo.id === focusedMemo.id;
                  return (
                    <li key={memo.id}>
                      <button
                        type="button"
                        data-overlay-no-drag
                        onClick={() => applyFocus(memo.id)}
                        className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs ${
                          isActive
                            ? 'bg-amber-500/20 font-semibold text-amber-100'
                            : 'text-stone-300 hover:bg-stone-700/60'
                        }`}
                      >
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-stone-700 text-[10px] font-semibold text-stone-200">
                          {memo.equippedOrder}
                        </span>
                        <span className="min-w-0 truncate">{itemTitle}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <button
            type="button"
            data-overlay-no-drag
            disabled={!canSwitch}
            aria-label={t('overlay.nav.next')}
            onClick={() => switchMemo('next')}
            className={`shrink-0 rounded p-1 text-sm leading-none transition-colors ${
              canSwitch
                ? 'cursor-pointer text-stone-400/70 hover:text-stone-100'
                : 'cursor-default text-stone-600/40'
            }`}
          >
            ›
          </button>

          <button
            type="button"
            data-overlay-no-drag
            aria-label={t('common.close')}
            onClick={handleClose}
            className="ml-1 shrink-0 cursor-pointer rounded p-1 text-stone-400 transition-colors hover:bg-stone-700/70 hover:text-stone-100"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
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
          ref={scrollRef}
          data-overlay-scroll
          style={bodyFadeStyle}
          className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-3"
        >
          <div className="w-full max-w-full whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-100">
            {memoForBody.content}
          </div>
        </div>

        {bindings.length > 0 && (
          <ul
            data-overlay-no-drag
            style={bodyFadeStyle}
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
