import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  toReactFlowCanvasNodes,
  toReactFlowEdges,
} from '../src/adapters/reactFlowAdapter';
import { db } from '../src/db';
import { LOCAL_USER_ID } from '../src/sync';
import { CommandType, resetSaveStateForTests, useCanvasStore } from '../src/store';

describe('architecture smoke', () => {
  beforeEach(async () => {
    resetSaveStateForTests();
    await db.close();
    await db.delete();
    await db.open();

    useCanvasStore.setState({
      topicId: 'topic-smoke-1',
      topicTitle: 'Smoke',
      nodes: [],
      edges: [],
      experiences: [],
      undoStack: [],
      redoStack: [],
    });
  });

  it('dispatch(CREATE_NODE) pushes NODE_CREATED via sync adapter into Dexie events', async () => {
    const { dispatch } = useCanvasStore.getState();

    dispatch({
      type: CommandType.CREATE_NODE,
      payload: {
        node: {
          type: 'component',
          label: 'Smoke',
        },
      },
    });

    await vi.waitFor(() => {
      expect(useCanvasStore.getState().undoStack[0]?.meta?.eventLocalId).toBeDefined();
    });

    const events = await db.events
      .where('topic_id')
      .equals('topic-smoke-1')
      .toArray();

    expect(events).toHaveLength(1);
    expect(events[0]?.event_type).toBe('NODE_CREATED');
    expect(events[0]?.user_id).toBe(LOCAL_USER_ID);
    expect(typeof events[0]?.client_timestamp).toBe('number');
    expect(events[0]?.payload).toMatchObject({
      node: expect.objectContaining({ type: 'component', label: 'Smoke' }),
    });

    const { nodes } = useCanvasStore.getState();
    expect(nodes).toHaveLength(1);
    const payload = events[0]?.payload as { node: { id: string } };
    expect(nodes[0]?.id).toBe(payload.node.id);
  });

  it('dispatch(MOVE_NODE) appends NODE_MOVED and undo restores position', async () => {
    const { dispatch, undo } = useCanvasStore.getState();

    dispatch({
      type: CommandType.CREATE_NODE,
      payload: { node: { type: 'goal', label: 'A' } },
    });

    const nodeId = useCanvasStore.getState().nodes[0]!.id;

    dispatch({
      type: CommandType.MOVE_NODE,
      payload: { id: nodeId, position: { x: 100, y: 200 } },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useCanvasStore.getState().nodes[0]?.metadata.visual).toEqual({ x: 100, y: 200 });

    const moveEvents = await db.events
      .where('event_type')
      .equals('NODE_MOVED')
      .toArray();
    expect(moveEvents).toHaveLength(1);
    expect(moveEvents[0]?.payload).toEqual({ id: nodeId, position: { x: 100, y: 200 } });
    expect(typeof moveEvents[0]?.client_timestamp).toBe('number');

    undo();

    expect(useCanvasStore.getState().nodes[0]?.metadata.visual).toEqual({ x: 0, y: 0 });
    expect(useCanvasStore.getState().redoStack).toHaveLength(1);
  });

  it('undo CREATE_NODE removes node and redoStack clears on new dispatch', async () => {
    const { dispatch, undo } = useCanvasStore.getState();

    dispatch({
      type: CommandType.CREATE_NODE,
      payload: { node: { type: 'component', label: 'B' } },
    });

    await vi.waitFor(() => {
      expect(useCanvasStore.getState().undoStack[0]?.meta?.eventLocalId).toBeTypeOf('number');
    });

    undo();
    await vi.waitFor(() => {
      expect(useCanvasStore.getState().nodes).toHaveLength(0);
    });

    dispatch({
      type: CommandType.CREATE_NODE,
      payload: { node: { type: 'component', label: 'C' } },
    });

    dispatch({
      type: CommandType.CREATE_NODE,
      payload: { node: { type: 'goal', label: 'D' } },
    });

    await vi.waitFor(() => {
      expect(useCanvasStore.getState().redoStack).toHaveLength(0);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

describe('reactFlowAdapter', () => {
  it('maps business entities to React Flow view models with data clones', () => {
    const businessNode = {
      id: 'n1',
      type: 'component' as const,
      label: 'X',
      content: '',
      modifiers: [],
      metadata: { created_at: 1, visual: { x: 10, y: 20 } },
    };
    const rfNode = toReactFlowCanvasNodes([businessNode], [])[0]!;
    expect(rfNode.type).toBe('componentNode');
    expect(rfNode.position).toEqual({ x: 10, y: 20 });
    expect(rfNode.data).toEqual(businessNode);
    expect(rfNode.data).not.toBe(businessNode);

    const businessEdge = {
      id: 'e1',
      source: 'n1',
      target: 'n2',
      edge_type: 'directed_thought' as const,
      modifiers: [],
      metadata: { paradigm: '', connectedGoalId: '' },
    };
    const rfEdge = toReactFlowEdges([businessEdge])[0]!;
    expect(rfEdge.type).toBe('thought');
    expect(rfEdge.data?.curvature).toBe(0);
    expect(rfEdge.markerEnd).toBeDefined();
    expect(rfEdge.data?.id).toBe(businessEdge.id);
    expect(rfEdge.data).not.toBe(businessEdge);

    const experience = {
      id: 'x1',
      title: 'Exp',
      content: '',
      targets: [],
      resolved: false,
      metadata: { created_at: 1, visual: { x: 5, y: 6, width: 120, height: 80 } },
    };
    const rfExp = toReactFlowCanvasNodes([], [experience])[0]!;
    expect(rfExp.type).toBe('experienceNode');
    expect(rfExp.data).toEqual(experience);
    expect(rfExp.data).not.toBe(experience);
  });
});
