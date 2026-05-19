import { invoke } from '@tauri-apps/api/core';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

const DRAG_THRESHOLD_PX = 5;

type DragSession = {
  pointerId: number;
  startScreenX: number;
  startScreenY: number;
  startWinX: number;
  startWinY: number;
  /** OS display scale: physical px per CSS px (e.g. 1.25 at 125% HiDPI). */
  scaleFactor: number;
  active: boolean;
};

function isScrollbarPointer(e: ReactPointerEvent, scrollEl: HTMLElement): boolean {
  const scrollbarWidth = scrollEl.offsetWidth - scrollEl.clientWidth;
  if (scrollbarWidth <= 0) return false;
  const rect = scrollEl.getBoundingClientRect();
  return e.clientX >= rect.right - scrollbarWidth - 1;
}

export function useThresholdWindowDrag() {
  const sessionRef = useRef<DragSession | null>(null);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    if (target.closest('[data-overlay-no-drag]')) return;

    const scrollEl = target.closest('[data-overlay-scroll]');
    if (scrollEl instanceof HTMLElement && isScrollbarPointer(e, scrollEl)) {
      return;
    }

    void (async () => {
      const win = getCurrentWebviewWindow();
      const [pos, scaleFactor] = await Promise.all([
        win.outerPosition(),
        win.scaleFactor(),
      ]);
      sessionRef.current = {
        pointerId: e.pointerId,
        startScreenX: e.screenX,
        startScreenY: e.screenY,
        startWinX: pos.x,
        startWinY: pos.y,
        scaleFactor,
        active: false,
      };
    })();
  }, []);

  useEffect(() => {
    const clearDragChrome = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    const onPointerMove = (e: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || e.pointerId !== session.pointerId) return;

      const dx = e.screenX - session.startScreenX;
      const dy = e.screenY - session.startScreenY;

      if (!session.active) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        session.active = true;
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      }

      const scale = session.scaleFactor;
      void getCurrentWebviewWindow().setPosition(
        new PhysicalPosition(
          Math.round(session.startWinX + dx * scale),
          Math.round(session.startWinY + dy * scale),
        ),
      );
    };

    const endSession = (e: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      const wasDragging = session.active;
      sessionRef.current = null;
      clearDragChrome();
      if (wasDragging) {
        void invoke('clamp_memo_overlay_position').catch(console.error);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endSession);
    window.addEventListener('pointercancel', endSession);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endSession);
      window.removeEventListener('pointercancel', endSession);
      clearDragChrome();
    };
  }, []);

  return { onPointerDown };
};
