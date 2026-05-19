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

export async function syncEquippedMemoFromMemos(memos: Memo[]): Promise<void> {
  if (!isTauriRuntime()) return;
  const equipped = memos.find((m) => m.isEquipped);
  if (equipped) {
    await notifyMemoEquipped(equipped);
  } else {
    await notifyMemoUnequipped();
  }
}
