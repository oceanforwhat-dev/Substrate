import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db';
import { LOCAL_USER_ID } from '../src/sync';
import { resetSaveStateForTests, useCanvasStore } from '../src/store';

describe('memo architecture smoke', () => {
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
      undoStack: [],
      redoStack: [],
    });
  });

  it('creates, equips, and enforces single equipped memo via dispatch', async () => {
    const { dispatch } = useCanvasStore.getState();
    const memoId1 = crypto.randomUUID();

    dispatch({
      type: 'MEMO_CREATED',
      payload: { memo: { id: memoId1, title: 'First Memo' } },
    });

    expect(useCanvasStore.getState().memos).toHaveLength(1);
    expect(useCanvasStore.getState().memos[0]).toMatchObject({
      id: memoId1,
      title: 'First Memo',
      isEquipped: false,
    });

    await vi.waitFor(async () => {
      const events = await db.events.where('event_type').equals('MEMO_CREATED').toArray();
      expect(events).toHaveLength(1);
    });

    const createdEvents = await db.events.where('event_type').equals('MEMO_CREATED').toArray();
    expect(createdEvents[0]?.event_type).toBe('MEMO_CREATED');
    expect(createdEvents[0]?.user_id).toBe(LOCAL_USER_ID);
    expect(createdEvents[0]?.payload).toMatchObject({
      memo: expect.objectContaining({ id: memoId1, title: 'First Memo' }),
    });

    dispatch({ type: 'MEMO_EQUIPPED', payload: { memoId: memoId1 } });

    expect(useCanvasStore.getState().memos[0]?.isEquipped).toBe(true);

    const memoId2 = crypto.randomUUID();
    dispatch({
      type: 'MEMO_CREATED',
      payload: { memo: { id: memoId2, title: 'Second Memo' } },
    });

    dispatch({ type: 'MEMO_EQUIPPED', payload: { memoId: memoId2 } });

    const { memos } = useCanvasStore.getState();
    const first = memos.find((m) => m.id === memoId1);
    const second = memos.find((m) => m.id === memoId2);

    expect(first?.isEquipped).toBe(false);
    expect(second?.isEquipped).toBe(true);
  });
});
