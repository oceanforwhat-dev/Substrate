import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { toReactFlowCanvasNodes } from '../src/adapters/reactFlowAdapter';
import { db } from '../src/db';
import { CommandType, useCanvasStore } from '../src/store';

const flushSync = () => new Promise((resolve) => setTimeout(resolve, 0));

function seedTwoNodes() {
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

describe('Sprint 2B — experiences', () => {
  beforeEach(async () => {
    await db.close();
    await db.delete();
    await db.open();
    useCanvasStore.setState({
      topicId: 'topic-s2b',
      nodes: [],
      edges: [],
      experiences: [],
      undoStack: [],
      redoStack: [],
    });
  });

  it('CREATE_EXPERIENCE persists targets and emits EXPERIENCE_CREATED', async () => {
    seedTwoNodes();
    const { dispatch } = useCanvasStore.getState();

    dispatch({
      type: CommandType.CREATE_EXPERIENCE,
      payload: {
        experience: {
          title: 'Insight',
          content: 'notes',
          targets: [
            { id: 'n1', type: 'node' },
            { id: 'n2', type: 'node' },
          ],
          metadata: {
            visual: { x: 10, y: 20, width: 300, height: 180 },
          },
        },
      },
    });

    await flushSync();

    const experiences = useCanvasStore.getState().experiences;
    expect(experiences).toHaveLength(1);
    expect(experiences[0]?.title).toBe('Insight');
    expect(experiences[0]?.targets).toHaveLength(2);

    const events = await db.events.where('event_type').equals('EXPERIENCE_CREATED').toArray();
    expect(events).toHaveLength(1);
    expect(typeof events[0]?.client_timestamp).toBe('number');
  });

  it('DELETE_EXPERIENCE removes experience and emits EXPERIENCE_DELETED', async () => {
    seedTwoNodes();
    const { dispatch } = useCanvasStore.getState();

    dispatch({
      type: CommandType.CREATE_EXPERIENCE,
      payload: {
        experience: {
          id: 'exp-1',
          title: 'Gone',
          targets: [{ id: 'n1', type: 'node' }],
          metadata: { visual: { x: 0, y: 0, width: 100, height: 80 } },
        },
      },
    });

    dispatch({ type: CommandType.DELETE_EXPERIENCE, payload: { id: 'exp-1' } });
    await flushSync();

    expect(useCanvasStore.getState().experiences).toHaveLength(0);

    const deleted = await db.events.where('event_type').equals('EXPERIENCE_DELETED').toArray();
    expect(deleted).toHaveLength(1);
    expect(deleted[0]?.payload).toEqual({ id: 'exp-1' });
  });

  it('REMOVE_EDGE strips edge id from experience targets', async () => {
    seedTwoNodes();
    const { dispatch } = useCanvasStore.getState();

    dispatch({
      type: CommandType.ADD_EDGE,
      payload: { edge: { id: 'e1', source: 'n1', target: 'n2', edge_type: 'flat' } },
    });

    dispatch({
      type: CommandType.CREATE_EXPERIENCE,
      payload: {
        experience: {
          id: 'exp-2',
          title: 'Linked',
          targets: [
            { id: 'n1', type: 'node' },
            { id: 'e1', type: 'edge' },
          ],
          metadata: { visual: { x: 0, y: 0, width: 120, height: 90 } },
        },
      },
    });

    dispatch({ type: CommandType.REMOVE_EDGE, payload: { id: 'e1' } });

    const targets = useCanvasStore.getState().experiences[0]?.targets ?? [];
    expect(targets).toEqual([{ id: 'n1', type: 'node' }]);
  });
});

describe('reactFlowAdapter — experience layering', () => {
  it('places experience nodes before business nodes', () => {
    const rf = toReactFlowCanvasNodes(
      [
        {
          id: 'n1',
          type: 'component',
          label: 'A',
          content: '',
          modifiers: [],
          metadata: { created_at: 1, visual: { x: 50, y: 50 } },
        },
      ],
      [
        {
          id: 'exp-1',
          title: 'Layer',
          content: '',
          targets: [],
          resolved: false,
          metadata: { created_at: 1, visual: { x: 0, y: 0, width: 200, height: 100 } },
        },
      ],
    );

    expect(rf[0]?.type).toBe('experienceNode');
    expect(rf[1]?.type).toBe('componentNode');
    expect(rf[0]?.zIndex).toBe(0);
    expect(rf[1]?.zIndex).toBe(1);
  });
});
