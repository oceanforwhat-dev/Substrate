import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sanitizeFileName, titleFromFileName } from '../src/lib/topicFile';
import { buildTopicSnapshot } from '../src/lib/snapshot';
import { parseTopicCanvas } from '../src/lib/validate';
import { db } from '../src/db';
import { CommandType, getTopicCanvasForExport, importTopicCanvas, resetSaveStateForTests, useCanvasStore } from '../src/store';

describe('topic file import/export', () => {
  beforeEach(async () => {
    resetSaveStateForTests();
    await db.close();
    await db.delete();
    await db.open();
    useCanvasStore.setState({
      topicId: 'export-topic',
      topicTitle: 'My Topic',
      nodes: [],
      edges: [],
      experiences: [],
      undoStack: [],
      redoStack: [],
    });
  });

  afterEach(async () => {
    await db.close();
  });

  it('sanitizes file names', () => {
    expect(sanitizeFileName('Goals: Q1')).toBe('Goals Q1');
    expect(titleFromFileName('Goals Q1.substrate')).toBe('Goals Q1');
  });

  it('round-trips TopicCanvas through import', async () => {
    const { dispatch } = useCanvasStore.getState();
    dispatch({
      type: CommandType.CREATE_NODE,
      payload: {
        node: {
          type: 'component',
          label: 'Exported',
          metadata: { visual: { x: 5, y: 10 } },
        },
      },
    });

    await new Promise((r) => setTimeout(r, 0));

    const exported = getTopicCanvasForExport();
    const importedId = await importTopicCanvas(exported, 'Imported Copy');

    const state = useCanvasStore.getState();
    expect(state.topicId).toBe(importedId);
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0]?.label).toBe('Exported');
    expect(state.nodes[0]?.metadata.visual).toEqual({ x: 5, y: 10 });

    const snapshot = await db.snapshots.get(importedId);
    expect(parseTopicCanvas(snapshot?.canvas_snapshot).nodes[0]?.label).toBe('Exported');
    expect(buildTopicSnapshot).toBeDefined();
  });
});
