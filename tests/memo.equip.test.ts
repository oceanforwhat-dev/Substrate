import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db';
import { resetSaveStateForTests, useCanvasStore } from '../src/store';

const FOCUSED_MEMO_APP_STATE_KEY = 'currentFocusedMemoId';

describe('memo multi-equip', () => {
  beforeEach(async () => {
    resetSaveStateForTests();
    await db.close();
    await db.delete();
    await db.open();

    useCanvasStore.setState({
      topicId: '',
      topicTitle: '',
      nodes: [],
      edges: [],
      experiences: [],
      memos: [],
      currentFocusedMemoId: null,
      equippedMemos: [],
      undoStack: [],
      redoStack: [],
    });
  });

  function createMemo(title: string) {
    const id = crypto.randomUUID();
    useCanvasStore.getState().dispatch({
      type: 'MEMO_CREATED',
      payload: { memo: { id, title } },
    });
    return id;
  }

  async function waitForMemoPersistence() {
    await vi.waitFor(async () => {
      const rows = await db.memos.toArray();
      expect(rows.length).toBeGreaterThan(0);
    });
  }

  it('equips multiple memos, focus, unequip, and reorder', async () => {
    const { dispatch } = useCanvasStore.getState();
    const memo1 = createMemo('Memo 1');
    const memo2 = createMemo('Memo 2');
    const memo3 = createMemo('Memo 3');

    await waitForMemoPersistence();

    dispatch({ type: 'MEMO_EQUIPPED', payload: { memoId: memo1 } });
    await vi.waitFor(() => {
      const m = useCanvasStore.getState().memos.find((x) => x.id === memo1);
      expect(m?.equipped).toBe(true);
    });
    expect(useCanvasStore.getState().memos.find((m) => m.id === memo1)).toMatchObject({
      equipped: true,
      equippedOrder: 1,
    });
    expect(useCanvasStore.getState().currentFocusedMemoId).toBe(memo1);

    dispatch({ type: 'MEMO_EQUIPPED', payload: { memoId: memo2 } });
    await vi.waitFor(() => {
      expect(useCanvasStore.getState().memos.find((m) => m.id === memo2)?.equippedOrder).toBe(2);
    });
    expect(useCanvasStore.getState().currentFocusedMemoId).toBe(memo1);

    dispatch({ type: 'MEMO_EQUIPPED', payload: { memoId: memo3 } });
    await vi.waitFor(() => {
      expect(useCanvasStore.getState().memos.find((m) => m.id === memo3)?.equippedOrder).toBe(3);
    });

    const equipped = useCanvasStore.getState().equippedMemos;
    expect(equipped).toHaveLength(3);
    expect(equipped.map((m) => m.id)).toEqual([memo1, memo2, memo3]);

    dispatch({ type: 'FOCUSED_MEMO_CHANGED', payload: { memoId: memo2 } });
    await vi.waitFor(async () => {
      expect(useCanvasStore.getState().currentFocusedMemoId).toBe(memo2);
      const row = await db.app_state.get(FOCUSED_MEMO_APP_STATE_KEY);
      expect(row?.value).toBe(memo2);
    });

    dispatch({ type: 'MEMO_UNEQUIPPED', payload: { memoId: memo2 } });
    await vi.waitFor(() => {
      const m2 = useCanvasStore.getState().memos.find((m) => m.id === memo2);
      expect(m2?.equipped).toBe(false);
      expect(m2?.equippedOrder).toBe(0);
    });

    const focusedAfterUnequip = useCanvasStore.getState().currentFocusedMemoId;
    expect([memo1, memo3]).toContain(focusedAfterUnequip);

    const remaining = useCanvasStore
      .getState()
      .memos.filter((m) => m.equipped)
      .sort((a, b) => a.equippedOrder - b.equippedOrder);
    expect(remaining).toHaveLength(2);
    expect(remaining.map((m) => m.equippedOrder)).toEqual([1, 2]);

    dispatch({ type: 'MEMO_REORDER', payload: { orderedIds: [memo3, memo1] } });
    await vi.waitFor(() => {
      const m1 = useCanvasStore.getState().memos.find((m) => m.id === memo1);
      const m3 = useCanvasStore.getState().memos.find((m) => m.id === memo3);
      expect(m3?.equippedOrder).toBe(1);
      expect(m1?.equippedOrder).toBe(2);
    });

    expect(useCanvasStore.getState().equippedMemos.map((m) => m.id)).toEqual([memo3, memo1]);
  });
});
