import 'fake-indexeddb/auto';
import { MarkerType } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { toReactFlowEdges } from '../src/adapters/reactFlowAdapter';
import { db } from '../src/db';
import type { BusinessEdge } from '../src/schema';
import { CommandType, useCanvasStore } from '../src/store';

const flushSync = () => new Promise((resolve) => setTimeout(resolve, 0));

function seedNodes() {
  const { dispatch } = useCanvasStore.getState();
  dispatch({
    type: CommandType.CREATE_NODE,
    payload: { node: { id: 'n1', type: 'component', label: 'A' } },
  });
  dispatch({
    type: CommandType.CREATE_NODE,
    payload: { node: { id: 'n2', type: 'goal', label: 'B' } },
  });
}

describe('Sprint 2 — topology & modifiers', () => {
  beforeEach(async () => {
    await db.close();
    await db.delete();
    await db.open();

    useCanvasStore.setState({
      topicId: 'topic-s2',
      nodes: [],
      edges: [],
      experiences: [],
      undoStack: [],
      redoStack: [],
    });
  });

  it('ADD_EDGE rejects self-loops; allows parallel edges on same pair; emits EDGE_ADDED', async () => {
    seedNodes();
    const { dispatch } = useCanvasStore.getState();

    dispatch({
      type: CommandType.ADD_EDGE,
      payload: {
        edge: { source: 'n1', target: 'n2', edge_type: 'flat' },
      },
    });

    await flushSync();

    expect(useCanvasStore.getState().edges).toHaveLength(1);

    expect(() =>
      dispatch({
        type: CommandType.ADD_EDGE,
        payload: { edge: { source: 'n1', target: 'n1', edge_type: 'flat' } },
      }),
    ).toThrow(/self-loop/);

    dispatch({
      type: CommandType.ADD_EDGE,
      payload: { edge: { source: 'n1', target: 'n2', edge_type: 'flat' } },
    });

    dispatch({
      type: CommandType.ADD_EDGE,
      payload: { edge: { source: 'n1', target: 'n2', edge_type: 'directed_thought' } },
    });

    expect(useCanvasStore.getState().edges).toHaveLength(3);

    const added = await db.events.where('event_type').equals('EDGE_ADDED').toArray();
    expect(added).toHaveLength(3);
    expect(typeof added[0]?.client_timestamp).toBe('number');
  });

  it('REMOVE_EDGE strips edge from experience targets and emits EDGE_REMOVED', async () => {
    seedNodes();
    const { dispatch } = useCanvasStore.getState();

    dispatch({
      type: CommandType.ADD_EDGE,
      payload: { edge: { id: 'e1', source: 'n1', target: 'n2', edge_type: 'flat' } },
    });

    useCanvasStore.setState({
      experiences: [
        {
          id: 'exp1',
          title: 'Lasso',
          content: '',
          targets: [
            { id: 'n1', type: 'node' },
            { id: 'e1', type: 'edge' },
          ],
          resolved: false,
          metadata: { created_at: 1, visual: { x: 0, y: 0, width: 200, height: 120 } },
        },
      ],
    });

    dispatch({ type: CommandType.REMOVE_EDGE, payload: { id: 'e1' } });
    await flushSync();

    expect(useCanvasStore.getState().edges).toHaveLength(0);
    expect(useCanvasStore.getState().experiences[0]?.targets).toEqual([
      { id: 'n1', type: 'node' },
    ]);

    const removed = await db.events.where('event_type').equals('EDGE_REMOVED').toArray();
    expect(removed).toHaveLength(1);
    expect(removed[0]?.payload).toEqual({ id: 'e1' });
  });

  it('modifier attach, update, remove on node and edge', async () => {
    seedNodes();
    const { dispatch } = useCanvasStore.getState();

    dispatch({
      type: CommandType.ADD_EDGE,
      payload: { edge: { id: 'e1', source: 'n1', target: 'n2', edge_type: 'directed_thought' } },
    });

    const modifier = {
      id: 'm1',
      type: 'text' as const,
      content: 'note',
      url: '',
      appliesToTopic: false,
    };

    dispatch({
      type: CommandType.ATTACH_MODIFIER,
      payload: { targetId: 'n1', targetType: 'node', modifier },
    });

    dispatch({
      type: CommandType.ATTACH_MODIFIER,
      payload: {
        targetId: 'e1',
        targetType: 'edge',
        modifier: { ...modifier, id: 'm2', content: 'edge note' },
      },
    });

    dispatch({
      type: CommandType.MODIFIER_UPDATED,
      payload: {
        targetId: 'n1',
        targetType: 'node',
        modifierId: 'm1',
        changes: { content: 'updated note' },
      },
    });

    dispatch({
      type: CommandType.MODIFIER_REMOVED,
      payload: { targetId: 'e1', targetType: 'edge', modifierId: 'm2' },
    });

    await flushSync();

    const node = useCanvasStore.getState().nodes.find((n) => n.id === 'n1');
    const edge = useCanvasStore.getState().edges.find((e) => e.id === 'e1');
    expect(node?.modifiers[0]?.content).toBe('updated note');
    expect(edge?.modifiers).toHaveLength(0);

    const events = await db.events.toArray();
    expect(events.some((e) => e.event_type === 'MODIFIER_ATTACHED')).toBe(true);
    expect(events.some((e) => e.event_type === 'MODIFIER_UPDATED')).toBe(true);
    expect(events.some((e) => e.event_type === 'MODIFIER_REMOVED')).toBe(true);
  });

  it('NODE_MOVED is only emitted for MOVE_NODE', async () => {
    seedNodes();
    const { dispatch } = useCanvasStore.getState();

    dispatch({
      type: CommandType.ADD_EDGE,
      payload: { edge: { source: 'n1', target: 'n2', edge_type: 'flat' } },
    });

    dispatch({
      type: CommandType.MOVE_NODE,
      payload: { id: 'n1', position: { x: 50, y: 60 } },
    });

    await flushSync();

    const moved = await db.events.where('event_type').equals('NODE_MOVED').toArray();
    expect(moved).toHaveLength(1);
    expect(moved[0]?.payload).toEqual({ id: 'n1', position: { x: 50, y: 60 } });
  });
});

describe('reactFlowAdapter — edge curvature & markers', () => {
  const baseEdge = (id: string, edge_type: BusinessEdge['edge_type']): BusinessEdge => ({
    id,
    source: 'a',
    target: 'b',
    edge_type,
    modifiers: [],
    metadata: { paradigm: '', connectedGoalId: '' },
  });

  it('assigns multi-edge curvature and arrow marker for directed_thought', () => {
    const edges = [
      baseEdge('e1', 'directed_thought'),
      baseEdge('e2', 'directed_thought'),
    ];

    const rf = toReactFlowEdges(edges);
    expect(rf[0]!.data!.curvature).toBe(0.3);
    expect(rf[1]!.data!.curvature).toBe(-0.3);
    expect(rf[0]?.markerEnd).toEqual(
      expect.objectContaining({ type: MarkerType.ArrowClosed }),
    );
    expect(rf[0]?.type).toBe('thought');
    expect(rf[0]!.data!.source).toBe('a');
  });

  it('uses zero curvature for a single edge between a pair', () => {
    const rf = toReactFlowEdges([baseEdge('e1', 'flat')]);
    expect(rf[0]!.data!.curvature).toBe(0);
    expect(rf[0]?.markerEnd).toBeUndefined();
  });

  it('assigns three-edge curvature preset', () => {
    const edges = [
      baseEdge('e1', 'flat'),
      baseEdge('e2', 'flat'),
      baseEdge('e3', 'flat'),
    ];
    const rf = toReactFlowEdges(edges);
    expect(rf.map((e) => e.data!.curvature)).toEqual([0, 0.5, -0.5]);
  });
});
