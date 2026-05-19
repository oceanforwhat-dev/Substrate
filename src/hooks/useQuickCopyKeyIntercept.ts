import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef } from 'react';
import { isTauriRuntime } from '../lib/memoTauri';

type QuickCopyActivePayload = {
  active: boolean;
};

function keyToDigit(key: string, code: string): number | null {
  if (key.length === 1 && key >= '1' && key <= '9') {
    return key.charCodeAt(0) - 0x30;
  }
  const numpadMatch = /^Numpad([1-9])$/.exec(code);
  if (numpadMatch) {
    return Number(numpadMatch[1]);
  }
  const digitMatch = /^Digit([1-9])$/.exec(code);
  if (digitMatch) {
    return Number(digitMatch[1]);
  }
  return null;
}

export function useQuickCopyKeyIntercept(): void {
  const isQuickCopyActiveRef = useRef(false);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let cancelled = false;

    const unlistenActivePromise = listen<QuickCopyActivePayload>(
      'quick-copy-active',
      (event) => {
        if (!cancelled) {
          isQuickCopyActiveRef.current = event.payload.active;
        }
      },
    );

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isQuickCopyActiveRef.current) {
        return;
      }
      const digit = keyToDigit(event.key, event.code);
      if (digit === null) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      void invoke('notify_quick_copy_key', { key: digit }).catch(console.error);
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      void unlistenActivePromise.then((unlisten) => unlisten());
    };
  }, []);
}
