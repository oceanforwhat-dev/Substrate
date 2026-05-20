import { emit } from '@tauri-apps/api/event';
import type { Memo } from '../schema';

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function notifyMemoEquipped(memo: Memo): Promise<void> {
  if (!isTauriRuntime()) return;
  await emit('memo-equipped', JSON.stringify(memo));
}

export async function notifyMemoUnequipped(): Promise<void> {
  if (!isTauriRuntime()) return;
  await emit('memo-unequipped', null);
}

export async function syncEquippedMemoFromMemos(
  memos: Memo[],
  currentFocusedMemoId: string | null = null,
): Promise<void> {
  if (!isTauriRuntime()) return;
  const focused =
    (currentFocusedMemoId
      ? memos.find((m) => m.id === currentFocusedMemoId)
      : undefined) ??
    memos
      .filter((m) => m.equipped)
      .sort((a, b) => a.equippedOrder - b.equippedOrder)[0];
  if (focused?.equipped) {
    await notifyMemoEquipped(focused);
  } else {
    await notifyMemoUnequipped();
  }
}
