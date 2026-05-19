import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';

type PasteBindingPayload = {
  text: string;
  binding_key: number;
};

function isTextField(
  el: Element | null,
): el is HTMLInputElement | HTMLTextAreaElement {
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) {
    return false;
  }
  if (el instanceof HTMLInputElement) {
    const type = el.type;
    if (
      type === 'button' ||
      type === 'submit' ||
      type === 'reset' ||
      type === 'checkbox' ||
      type === 'radio' ||
      type === 'file' ||
      type === 'hidden' ||
      type === 'image'
    ) {
      return false;
    }
  }
  return !el.readOnly && !el.disabled;
}

function setNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const proto =
    element instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertIntoTextField(
  element: HTMLInputElement | HTMLTextAreaElement,
  text: string,
): void {
  const start = element.selectionStart ?? element.value.length;
  const end = element.selectionEnd ?? start;
  const next =
    element.value.slice(0, start) + text + element.value.slice(end);
  setNativeValue(element, next);
  const caret = start + text.length;
  element.setSelectionRange(caret, caret);
}

function insertIntoContentEditable(element: HTMLElement, text: string): boolean {
  element.focus();
  if (document.queryCommandSupported('insertText')) {
    return document.execCommand('insertText', false, text);
  }
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return false;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  range.insertNode(document.createTextNode(text));
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function describeActiveElement(el: Element | null) {
  if (!el) {
    return { tag: 'null', isTextField: false, isContentEditable: false };
  }
  return {
    tag: el.tagName,
    isTextField: isTextField(el),
    isContentEditable: el instanceof HTMLElement && el.isContentEditable,
  };
}

function tryInsertTextAtFocus(text: string): {
  insertionCalled: boolean;
  insertionSucceeded: boolean;
} {
  const active = document.activeElement;
  if (!active) {
    return { insertionCalled: false, insertionSucceeded: false };
  }

  if (isTextField(active)) {
    insertIntoTextField(active, text);
    return { insertionCalled: true, insertionSucceeded: true };
  }

  if (active instanceof HTMLElement && active.isContentEditable) {
    return {
      insertionCalled: true,
      insertionSucceeded: insertIntoContentEditable(active, text),
    };
  }

  return { insertionCalled: false, insertionSucceeded: false };
}

function diagTimestampMs(): number {
  return Date.now();
}

const TOAST_MS = 2000;

export function usePasteBindingText(): string | null {
  const { t } = useI18n();
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const showToast = (message: string) => {
      if (cancelled) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      setToast(message);
      timerRef.current = setTimeout(() => {
        if (!cancelled) {
          setToast(null);
        }
        timerRef.current = null;
      }, TOAST_MS);
    };

    const unlistenPromise = listen<PasteBindingPayload>(
      'paste-binding-text',
      (event) => {
        const { text, binding_key } = event.payload;
        const receivedAt = diagTimestampMs();
        const activeInfo = describeActiveElement(document.activeElement);
        console.info(
          `[self-paste-diag] RECEIVED paste-binding-text binding_key=${binding_key} text_len=${text.length} at ${receivedAt}`,
          { activeElement: activeInfo },
        );

        const { insertionCalled, insertionSucceeded } = tryInsertTextAtFocus(text);
        console.info(
          `[self-paste-diag] insertion binding_key=${binding_key} called=${insertionCalled} succeeded=${insertionSucceeded} at ${diagTimestampMs()}`,
        );

        if (!insertionSucceeded) {
          void navigator.clipboard.writeText(text).catch(() => undefined);
          showToast(t('overlay.quickCopy.copiedToClipboard'));
          console.info(
            `[self-paste-diag] fallback clipboard+toast binding_key=${binding_key} at ${diagTimestampMs()}`,
          );
        }
      },
    );

    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [t]);

  return toast;
}
