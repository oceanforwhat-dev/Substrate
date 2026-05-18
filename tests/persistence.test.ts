import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db';
import { CommandType, loadTopic, resetSaveStateForTests, saveTopic, useCanvasStore } from '../src/store';

describe('local persistence', () => {
  beforeEach(async () => {
    resetSaveStateForTests();
    await db.close();
    await db.delete();
    await db.open();
    useCanvasStore.setState({
      topicId: 'topic-persist-1',
      topicTitle: 'Persist',
      nodes: [],
      edges: [],
      experiences: [],
      undoStack: [],
      redoStack: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saveTopic + loadTopic restores canvas and undo stacks after refresh', async () => {
    const { dispatch, undo } = useCanvasStore.getState();

    dispatch({
      type: CommandType.CREATE_NODE,
      payload: { node: { type: 'component', label: 'A', metadata: { visual: { x: 10, y: 20 } } } },
    });

    await vi.waitFor(() => {
      expect(useCanvasStore.getState().undoStack[0]?.meta?.eventLocalId).toBeDefined();
    });

    const nodeId = useCanvasStore.getState().nodes[0]!.id;

    dispatch({
      type: CommandType.MOVE_NODE,
      payload: { id: nodeId, position: { x: 99, y: 88 } },
    });

    await vi.waitFor(() => {
      expect(useCanvasStore.getState().undoStack).toHaveLength(2);
      expect(useCanvasStore.getState().nodes[0]?.metadata.visual).toEqual({ x: 99, y: 88 });
    });

    undo();
    await vi.waitFor(() => {
      expect(useCanvasStore.getState().nodes[0]?.metadata.visual).toEqual({ x: 10, y: 20 });
      expect(useCanvasStore.getState().redoStack).toHaveLength(1);
    });

    await saveTopic();

    const snapshot = await db.snapshots.get('topic-persist-1');
    expect(snapshot?.canvas_snapshot.top_nodes).toEqual(['A']);
    expect(snapshot?.saved_at).toBeTypeOf('number');

    useCanvasStore.setState({
      nodes: [],
      edges: [],
      experiences: [],
      undoStack: [],
      redoStack: [],
    });

    await loadTopic('topic-persist-1');

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0]?.label).toBe('A');
    expect(state.nodes[0]?.metadata.visual).toEqual({ x: 10, y: 20 });
    expect(state.undoStack).toHaveLength(1);
    expect(state.redoStack).toHaveLength(1);
    expect(state.redoStack[0]?.type).toBe(CommandType.MOVE_NODE);
    expect(state.topicTitle).toBe('Persist');
  });
});
