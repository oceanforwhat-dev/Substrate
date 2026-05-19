import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { db } from './db';
import type { EventType, SystemEvent } from './events';
import { buildTopicSnapshot, computeInverse, parseTopicCanvas, replayEvents } from './lib';
import {
  BusinessEdgeSchema,
  BusinessNodeSchema,
  ExperienceSchema,
  MemoSchema,
  ModifierSchema,
  type BusinessEdge,
  type BusinessNode,
  type Experience,
  type Memo,
  type Modifier,
  type TopicCanvas,
} from './schema';
import {
  CommandType,
  type Command,
  type CommandTypeName,
  type ModifierTargetType,
} from './commands';
import { notifyMemoEquipped } from './lib/memoTauri';
import { LOCAL_USER_ID, localSync, syncAdapter } from './sync';

export { CommandType, type Command, type CommandTypeName, type ModifierTargetType };

const MEMO_EVENT_TYPES = new Set<string>([
  'MEMO_CREATED',
  'MEMO_UPDATED',
  'MEMO_DELETED',
  'MEMO_BINDING_SET',
  'MEMO_EQUIPPED',
  'MEMO_UNEQUIPPED',
]);

const MEMO_TOPIC_ID = '';

export interface CanvasStore {
  topicId: string;
  topicTitle: string;
  nodes: BusinessNode[];
  edges: BusinessEdge[];
  experiences: Experience[];
  memos: Memo[];
  undoStack: Command[];
  redoStack: Command[];
  dispatch: (command: Command) => void;
  undo: () => void;
  redo: () => void;
  saveTopic: () => Promise<void>;
  loadTopic: (topicId: string) => Promise<void>;
  loadMemos: () => Promise<void>;
}

let postLoadFitView: (() => void) | null = null;

export function registerPostLoadFitView(callback: (() => void) | null): void {
  postLoadFitView = callback;
}

export function useCanvasSelector<T>(selector: (state: CanvasStore) => T): T {
  return useStore(useCanvasStore, selector);
}

const MAX_UNDO_DEPTH = 50;
const SAVE_DEBOUNCE_MS = 2000;

let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const AUTOSAVE_COMMAND_TYPES = new Set<CommandTypeName>([
  CommandType.CREATE_NODE,
  CommandType.UPDATE_NODE,
  CommandType.DELETE_NODE,
  CommandType.ADD_EDGE,
  CommandType.REMOVE_EDGE,
  CommandType.ATTACH_MODIFIER,
  CommandType.MODIFIER_REMOVED,
  CommandType.CREATE_EXPERIENCE,
  CommandType.DELETE_EXPERIENCE,
]);

async function pushMemoEvent(
  eventType: EventType,
  payload: Record<string, unknown>,
): Promise<number> {
  const event: SystemEvent = {
    topic_id: MEMO_TOPIC_ID,
    user_id: LOCAL_USER_ID,
    event_type: eventType,
    payload,
    client_timestamp: Date.now(),
  };

  await syncAdapter.push(event);
  if (event.id == null) {
    throw new Error(`pushMemoEvent: syncAdapter did not assign event id for ${eventType}`);
  }

  return event.id;
}

async function pushEvent(
  topicId: string,
  eventType: EventType,
  payload: Record<string, unknown>,
): Promise<number> {
  const event: SystemEvent = {
    topic_id: topicId,
    user_id: LOCAL_USER_ID,
    event_type: eventType,
    payload,
    client_timestamp: Date.now(),
  };

  await syncAdapter.push(event);
  if (event.id == null) {
    throw new Error(`pushEvent: syncAdapter did not assign event id for ${eventType}`);
  }

  return event.id;
}

async function recordCommandEvent(topicId: string, executed: Command): Promise<Command> {
  let eventId: number;

  switch (executed.type) {
    case CommandType.CREATE_NODE: {
      const node = executed.payload?.node as BusinessNode;
      eventId = await pushEvent(topicId, 'NODE_CREATED', { node });
      break;
    }
    case CommandType.UPDATE_NODE: {
      const { id, changes } = executed.payload as {
        id: string;
        changes: Partial<BusinessNode>;
      };
      eventId = await pushEvent(topicId, 'NODE_UPDATED', { id, changes });
      break;
    }
    case CommandType.MOVE_NODE: {
      const { id, position } = executed.payload as {
        id: string;
        position: { x: number; y: number };
      };
      eventId = await pushEvent(topicId, 'NODE_MOVED', { id, position });
      break;
    }
    case CommandType.DELETE_NODE: {
      const { id } = executed.payload as { id: string };
      eventId = await pushEvent(topicId, 'NODE_DELETED', { id });
      break;
    }
    case CommandType.ADD_EDGE: {
      const edge = executed.payload?.edge as BusinessEdge;
      eventId = await pushEvent(topicId, 'EDGE_ADDED', { edge });
      break;
    }
    case CommandType.REMOVE_EDGE: {
      const { id } = executed.payload as { id: string };
      eventId = await pushEvent(topicId, 'EDGE_REMOVED', { id });
      break;
    }
    case CommandType.ATTACH_MODIFIER: {
      const { targetId, targetType, modifier } = executed.payload as {
        targetId: string;
        targetType: ModifierTargetType;
        modifier: Modifier;
      };
      eventId = await pushEvent(topicId, 'MODIFIER_ATTACHED', { targetId, targetType, modifier });
      break;
    }
    case CommandType.MODIFIER_UPDATED: {
      const { targetId, targetType, modifierId, changes } = executed.payload as {
        targetId: string;
        targetType: ModifierTargetType;
        modifierId: string;
        changes: Partial<Modifier>;
      };
      eventId = await pushEvent(topicId, 'MODIFIER_UPDATED', {
        targetId,
        targetType,
        modifierId,
        changes,
      });
      break;
    }
    case CommandType.MODIFIER_REMOVED: {
      const { targetId, targetType, modifierId } = executed.payload as {
        targetId: string;
        targetType: ModifierTargetType;
        modifierId: string;
      };
      eventId = await pushEvent(topicId, 'MODIFIER_REMOVED', { targetId, targetType, modifierId });
      break;
    }
    case CommandType.CREATE_EXPERIENCE: {
      const experience = executed.payload?.experience as Experience;
      eventId = await pushEvent(topicId, 'EXPERIENCE_CREATED', { experience });
      break;
    }
    case CommandType.DELETE_EXPERIENCE: {
      const { id } = executed.payload as { id: string };
      eventId = await pushEvent(topicId, 'EXPERIENCE_DELETED', { id });
      break;
    }
    default:
      throw new Error(`recordCommandEvent: unsupported command "${executed.type}"`);
  }

  return { ...executed, meta: { eventLocalId: eventId } };
}

function scheduleAutoSave(get: () => CanvasStore): void {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }
  saveDebounceTimer = setTimeout(() => {
    saveDebounceTimer = null;
    void get().saveTopic().catch(console.error);
  }, SAVE_DEBOUNCE_MS);
}

export function resetSaveStateForTests(): void {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
}

async function latestEventTimestamp(topicId: string): Promise<number> {
  const events = await db.events.where('topic_id').equals(topicId).toArray();
  return events.reduce((max, row) => Math.max(max, row.client_timestamp), 0);
}

export async function saveTopic(): Promise<void> {
  const { topicId, topicTitle, nodes, edges, experiences, undoStack, redoStack } =
    useCanvasStore.getState();
  if (!topicId) {
    throw new Error('saveTopic: topicId is not set');
  }

  const snapshot = buildTopicSnapshot(topicId, nodes, edges, experiences);
  const savedAt = await latestEventTimestamp(topicId);
  const updatedAt = Date.now();

  await db.snapshots.put({
    topic_id: topicId,
    canvas_snapshot: snapshot,
    saved_at: savedAt,
    undo_stack: undoStack,
    redo_stack: redoStack,
  });
  await db.topics.put({
    id: topicId,
    title: topicTitle,
    updated_at: updatedAt,
    top_nodes: snapshot.top_nodes,
  });

  const topicSaved: SystemEvent = {
    topic_id: topicId,
    user_id: LOCAL_USER_ID,
    event_type: 'TOPIC_SAVED',
    payload: { topic_id: topicId, snapshot },
    client_timestamp: updatedAt,
  };
  void syncAdapter.push(topicSaved).catch(console.error);
}

export async function loadTopic(topicId: string): Promise<void> {
  resetSaveStateForTests();

  const snapshotRow = await db.snapshots.get(topicId);
  const topicRow = await db.topics.get(topicId);
  const afterTimestamp = snapshotRow?.saved_at ?? 0;

  const snapshot = parseTopicCanvas(
    snapshotRow?.canvas_snapshot ?? {
      topic_id: topicId,
      nodes: [],
      edges: [],
      experiences: [],
    },
  );

  const events = await localSync.pull(topicId, afterTimestamp);
  const replayableEvents = events.filter((e) => e.event_type !== 'TOPIC_SAVED');
  const restored = replayEvents(snapshot, replayableEvents, {
    undoStack: snapshotRow?.undo_stack ?? [],
    redoStack: snapshotRow?.redo_stack ?? [],
  });

  useCanvasStore.setState({
    topicId,
    topicTitle: topicRow?.title ?? 'Untitled',
    nodes: restored.nodes,
    edges: restored.edges,
    experiences: restored.experiences,
    undoStack: restored.undoStack,
    redoStack: restored.redoStack,
  });

  postLoadFitView?.();
}

export function getTopicCanvasForExport(): TopicCanvas {
  const { topicId, nodes, edges, experiences } = useCanvasStore.getState();
  if (!topicId) {
    throw new Error('getTopicCanvasForExport: topicId is not set');
  }
  return buildTopicSnapshot(topicId, nodes, edges, experiences);
}

export async function importTopicCanvas(
  raw: unknown,
  title = 'Imported Topic',
): Promise<string> {
  const parsed = parseTopicCanvas(raw);
  const topicId = crypto.randomUUID();
  const snapshot = buildTopicSnapshot(
    topicId,
    parsed.nodes,
    parsed.edges,
    parsed.experiences,
  );
  const updatedAt = Date.now();

  await db.snapshots.put({
    topic_id: topicId,
    canvas_snapshot: snapshot,
    saved_at: 0,
    undo_stack: [],
    redo_stack: [],
  });
  await db.topics.put({
    id: topicId,
    title,
    updated_at: updatedAt,
    top_nodes: snapshot.top_nodes,
  });

  resetSaveStateForTests();
  await loadTopic(topicId);
  return topicId;
}

export async function listTopics(): Promise<
  Array<{ id: string; title: string; updated_at: number }>
> {
  const rows = await db.topics.orderBy('updated_at').reverse().toArray();
  return rows.map((row) => ({
    id: row.id,
    title: row.title?.trim() || 'Untitled',
    updated_at: row.updated_at,
  }));
}

function findNode(nodes: BusinessNode[], id: string): BusinessNode {
  const node = nodes.find((n) => n.id === id);
  if (!node) {
    throw new Error(`CanvasStore: node not found: ${id}`);
  }
  return node;
}

function findExperience(experiences: Experience[], id: string): Experience {
  const experience = experiences.find((e) => e.id === id);
  if (!experience) {
    throw new Error(`CanvasStore: experience not found: ${id}`);
  }
  return experience;
}

function findEdge(edges: BusinessEdge[], id: string): BusinessEdge {
  const edge = edges.find((e) => e.id === id);
  if (!edge) {
    throw new Error(`CanvasStore: edge not found: ${id}`);
  }
  return edge;
}

function findMemo(memos: Memo[], id: string): Memo {
  const memo = memos.find((m) => m.id === id);
  if (!memo) {
    throw new Error(`CanvasStore: memo not found: ${id}`);
  }
  return memo;
}

async function upsertMemoRow(memo: Memo): Promise<void> {
  await db.memos.put({ ...memo, updated_at: Date.now() });
}

async function deleteMemoRow(id: string): Promise<void> {
  await db.memos.delete(id);
}

async function recordMemoEvent(executed: Command): Promise<void> {
  switch (executed.type) {
    case 'MEMO_CREATED': {
      const memo = executed.payload?.memo as Memo;
      await pushMemoEvent('MEMO_CREATED', { memo });
      break;
    }
    case 'MEMO_UPDATED': {
      const { id, changes } = executed.payload as { id: string; changes: Partial<Memo> };
      await pushMemoEvent('MEMO_UPDATED', { id, changes });
      break;
    }
    case 'MEMO_DELETED': {
      const { id } = executed.payload as { id: string };
      await pushMemoEvent('MEMO_DELETED', { id });
      break;
    }
    case 'MEMO_BINDING_SET': {
      const { memoId, binding } = executed.payload as {
        memoId: string;
        binding: { key: number; label: string; text: string };
      };
      await pushMemoEvent('MEMO_BINDING_SET', { memoId, binding });
      break;
    }
    case 'MEMO_EQUIPPED': {
      const { memoId } = executed.payload as { memoId: string };
      await pushMemoEvent('MEMO_EQUIPPED', { memoId });
      break;
    }
    case 'MEMO_UNEQUIPPED': {
      const { memoId } = executed.payload as { memoId: string };
      await pushMemoEvent('MEMO_UNEQUIPPED', { memoId });
      break;
    }
    default:
      throw new Error(`recordMemoEvent: unsupported command "${executed.type}"`);
  }
}

function removeEdgeFromExperienceTargets(
  experiences: Experience[],
  edgeId: string,
): Experience[] {
  return experiences.map((experience) => ({
    ...experience,
    targets: experience.targets.filter((t) => !(t.type === 'edge' && t.id === edgeId)),
  }));
}

function updateModifierTarget(
  nodes: BusinessNode[],
  edges: BusinessEdge[],
  targetId: string,
  targetType: ModifierTargetType,
  updater: (modifiers: Modifier[]) => Modifier[],
): { nodes: BusinessNode[]; edges: BusinessEdge[] } {
  if (targetType === 'node') {
    findNode(nodes, targetId);
    return {
      nodes: nodes.map((node) =>
        node.id === targetId ? { ...node, modifiers: updater(node.modifiers) } : node,
      ),
      edges,
    };
  }

  findEdge(edges, targetId);
  return {
    nodes,
    edges: edges.map((edge) =>
      edge.id === targetId ? { ...edge, modifiers: updater(edge.modifiers) } : edge,
    ),
  };
}

function applyStateChange(
  set: (fn: (state: CanvasStore) => Partial<CanvasStore>) => void,
  get: () => CanvasStore,
  command: Command,
): Command | null {
  const state = get();

  if (command.type === CommandType.CREATE_NODE) {
    const input = (command.payload?.node ?? command.payload) as Record<string, unknown>;
    const id =
      typeof input.id === 'string' && input.id.length > 0
        ? input.id
        : crypto.randomUUID();
    const node = BusinessNodeSchema.parse({
      ...input,
      id,
    });
    set((s) => ({ nodes: [...s.nodes, node] }));
    return { type: CommandType.CREATE_NODE, payload: { node } };
  }

  if (command.type === CommandType.UPDATE_NODE) {
    const id = command.payload?.id as string;
    const changes = command.payload?.changes as Partial<BusinessNode>;
    const existing = findNode(state.nodes, id);
    const previous: Partial<BusinessNode> = {};
    if (changes.label !== undefined) {
      previous.label = existing.label;
    }
    if (changes.content !== undefined) {
      previous.content = existing.content;
    }
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? BusinessNodeSchema.parse({ ...n, ...changes }) : n,
      ),
    }));
    return { type: CommandType.UPDATE_NODE, payload: { id, changes, previous } };
  }

  if (command.type === CommandType.DELETE_NODE) {
    const id = command.payload?.id as string;
    const node = findNode(state.nodes, id);
    set((s) => ({ nodes: s.nodes.filter((n) => n.id !== id) }));
    return { type: CommandType.DELETE_NODE, payload: { id, node } };
  }

  if (command.type === CommandType.MOVE_NODE) {
    const id = command.payload?.id as string;
    const position = command.payload?.position as { x: number; y: number };
    const existing = findNode(state.nodes, id);
    const previousPosition = {
      x: existing.metadata.visual.x,
      y: existing.metadata.visual.y,
    };
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              metadata: {
                ...n.metadata,
                visual: { x: position.x, y: position.y },
              },
            }
          : n,
      ),
    }));
    return {
      type: CommandType.MOVE_NODE,
      payload: { id, position, previousPosition },
    };
  }

  if (command.type === CommandType.ADD_EDGE) {
    const input = (command.payload?.edge ?? command.payload) as Record<string, unknown>;
    const source = input.source as string;
    const target = input.target as string;
    const edgeType = (input.edge_type as BusinessEdge['edge_type']) ?? 'flat';

    if (source === target) {
      throw new Error('CanvasStore: cannot add self-loop edge');
    }

    findNode(state.nodes, source);
    findNode(state.nodes, target);

    const id =
      typeof input.id === 'string' && input.id.length > 0
        ? input.id
        : crypto.randomUUID();
    const edge = BusinessEdgeSchema.parse({
      ...input,
      id,
      source,
      target,
      edge_type: edgeType,
    });

    set((s) => ({ edges: [...s.edges, edge] }));
    return { type: CommandType.ADD_EDGE, payload: { edge } };
  }

  if (command.type === CommandType.REMOVE_EDGE) {
    const id = command.payload?.id as string;
    const edge = findEdge(state.edges, id);
    set((s) => ({
      edges: s.edges.filter((e) => e.id !== id),
      experiences: removeEdgeFromExperienceTargets(s.experiences, id),
    }));
    return { type: CommandType.REMOVE_EDGE, payload: { id, edge } };
  }

  if (command.type === CommandType.ATTACH_MODIFIER) {
    const targetId = command.payload?.targetId as string;
    const targetType = command.payload?.targetType as ModifierTargetType;
    const modifier = ModifierSchema.parse(command.payload?.modifier);

    const updated = updateModifierTarget(
      state.nodes,
      state.edges,
      targetId,
      targetType,
      (modifiers) => {
        if (modifiers.some((m) => m.id === modifier.id)) {
          throw new Error(`CanvasStore: modifier already attached: ${modifier.id}`);
        }
        return [...modifiers, modifier];
      },
    );

    set(() => updated);
    return {
      type: CommandType.ATTACH_MODIFIER,
      payload: { targetId, targetType, modifier },
    };
  }

  if (command.type === CommandType.MODIFIER_UPDATED) {
    const targetId = command.payload?.targetId as string;
    const targetType = command.payload?.targetType as ModifierTargetType;
    const modifierId = command.payload?.modifierId as string;
    const changes = command.payload?.changes as Partial<Modifier>;

    const updated = updateModifierTarget(
      state.nodes,
      state.edges,
      targetId,
      targetType,
      (modifiers) => {
        const index = modifiers.findIndex((m) => m.id === modifierId);
        if (index === -1) {
          throw new Error(`CanvasStore: modifier not found: ${modifierId}`);
        }
        const next = { ...modifiers[index], ...changes };
        const parsed = ModifierSchema.parse(next);
        return modifiers.map((m, i) => (i === index ? parsed : m));
      },
    );

    set(() => updated);
    return {
      type: CommandType.MODIFIER_UPDATED,
      payload: { targetId, targetType, modifierId, changes },
    };
  }

  if (command.type === CommandType.MODIFIER_REMOVED) {
    const targetId = command.payload?.targetId as string;
    const targetType = command.payload?.targetType as ModifierTargetType;
    const modifierId = command.payload?.modifierId as string;
    let removedModifier: Modifier | undefined;

    const updated = updateModifierTarget(
      state.nodes,
      state.edges,
      targetId,
      targetType,
      (modifiers) => {
        const modifier = modifiers.find((m) => m.id === modifierId);
        if (!modifier) {
          throw new Error(`CanvasStore: modifier not found: ${modifierId}`);
        }
        removedModifier = modifier;
        return modifiers.filter((m) => m.id !== modifierId);
      },
    );

    if (!removedModifier) {
      throw new Error(`CanvasStore: modifier not found: ${modifierId}`);
    }

    set(() => updated);
    return {
      type: CommandType.MODIFIER_REMOVED,
      payload: { targetId, targetType, modifierId, modifier: removedModifier },
    };
  }

  if (command.type === CommandType.CREATE_EXPERIENCE) {
    const input = (command.payload?.experience ?? command.payload) as Record<string, unknown>;
    const id =
      typeof input.id === 'string' && input.id.length > 0
        ? input.id
        : crypto.randomUUID();
    const experience = ExperienceSchema.parse({
      ...input,
      id,
    });
    set((s) => ({ experiences: [...s.experiences, experience] }));
    return { type: CommandType.CREATE_EXPERIENCE, payload: { experience } };
  }

  if (command.type === CommandType.DELETE_EXPERIENCE) {
    const id = command.payload?.id as string;
    const experience = findExperience(state.experiences, id);
    set((s) => ({ experiences: s.experiences.filter((e) => e.id !== id) }));
    return { type: CommandType.DELETE_EXPERIENCE, payload: { id, experience } };
  }

  throw new Error(`CanvasStore: unhandled command type "${command.type}"`);
}

function applyMemoStateChange(
  set: (fn: (state: CanvasStore) => Partial<CanvasStore>) => void,
  get: () => CanvasStore,
  command: Command,
): Command {
  const state = get();

  if (command.type === 'MEMO_CREATED') {
    const input = (command.payload?.memo ?? command.payload) as Record<string, unknown>;
    const id =
      typeof input.id === 'string' && input.id.length > 0
        ? input.id
        : crypto.randomUUID();
    const memo = MemoSchema.parse({ ...input, id });
    set((s) => ({ memos: [...s.memos, memo] }));
    return { type: 'MEMO_CREATED', payload: { memo } };
  }

  if (command.type === 'MEMO_UPDATED') {
    const id = command.payload?.id as string;
    const changes = command.payload?.changes as Partial<Memo>;
    findMemo(state.memos, id);
    set((s) => ({
      memos: s.memos.map((m) =>
        m.id === id ? MemoSchema.parse({ ...m, ...changes }) : m,
      ),
    }));
    return { type: 'MEMO_UPDATED', payload: { id, changes } };
  }

  if (command.type === 'MEMO_DELETED') {
    const id = command.payload?.id as string;
    findMemo(state.memos, id);
    set((s) => ({ memos: s.memos.filter((m) => m.id !== id) }));
    return { type: 'MEMO_DELETED', payload: { id } };
  }

  if (command.type === 'MEMO_BINDING_SET') {
    const memoId = command.payload?.memoId as string;
    const binding = command.payload?.binding as { key: number; label: string; text: string };
    findMemo(state.memos, memoId);
    set((s) => ({
      memos: s.memos.map((m) => {
        if (m.id !== memoId) return m;
        const withoutKey = m.bindings.filter((b) => b.key !== binding.key);
        return MemoSchema.parse({
          ...m,
          bindings: [...withoutKey, binding],
        });
      }),
    }));
    return { type: 'MEMO_BINDING_SET', payload: { memoId, binding } };
  }

  if (command.type === 'MEMO_EQUIPPED') {
    const memoId = command.payload?.memoId as string;
    findMemo(state.memos, memoId);
    set((s) => ({
      memos: s.memos.map((m) => ({
        ...m,
        isEquipped: m.id === memoId,
      })),
    }));
    return { type: 'MEMO_EQUIPPED', payload: { memoId } };
  }

  if (command.type === 'MEMO_UNEQUIPPED') {
    const memoId = command.payload?.memoId as string;
    findMemo(state.memos, memoId);
    set((s) => ({
      memos: s.memos.map((m) =>
        m.id === memoId ? { ...m, isEquipped: false } : m,
      ),
    }));
    return { type: 'MEMO_UNEQUIPPED', payload: { memoId } };
  }

  throw new Error(`CanvasStore: unhandled memo command type "${command.type}"`);
}

async function syncEquippedMemoToBackend(executed: Command, memos: Memo[]): Promise<void> {
  const equipped = memos.find((m) => m.isEquipped);
  if (!equipped) return;

  if (executed.type === 'MEMO_UPDATED') {
    const { id } = executed.payload as { id: string };
    if (id !== equipped.id) return;
  } else if (executed.type === 'MEMO_BINDING_SET') {
    const { memoId } = executed.payload as { memoId: string };
    if (memoId !== equipped.id) return;
  } else {
    return;
  }

  await notifyMemoEquipped(equipped);
}

async function persistMemoStateChange(executed: Command, memos: Memo[]): Promise<void> {
  switch (executed.type) {
    case 'MEMO_CREATED': {
      const memo = executed.payload?.memo as Memo;
      await upsertMemoRow(memo);
      break;
    }
    case 'MEMO_UPDATED':
    case 'MEMO_BINDING_SET':
    case 'MEMO_UNEQUIPPED': {
      const { memoId, id } = executed.payload as { memoId?: string; id?: string };
      const targetId = memoId ?? id;
      if (!targetId) {
        throw new Error(`persistMemoStateChange: missing memo id for ${executed.type}`);
      }
      await upsertMemoRow(findMemo(memos, targetId));
      break;
    }
    case 'MEMO_EQUIPPED': {
      await Promise.all(memos.map((memo) => upsertMemoRow(memo)));
      break;
    }
    case 'MEMO_DELETED': {
      const { id } = executed.payload as { id: string };
      await deleteMemoRow(id);
      break;
    }
    default:
      throw new Error(`persistMemoStateChange: unsupported command "${executed.type}"`);
  }
}

function pushUndo(set: (fn: (state: CanvasStore) => Partial<CanvasStore>) => void, command: Command): void {
  set((s) => ({
    undoStack: [...s.undoStack, command].slice(-MAX_UNDO_DEPTH),
    redoStack: [],
  }));
}

export async function loadMemos(): Promise<void> {
  const rows = await db.memos.toArray();
  const memos = rows.map(({ updated_at: _updatedAt, ...memo }) => MemoSchema.parse(memo));
  useCanvasStore.setState({ memos });
}

export const useCanvasStore = createStore<CanvasStore>((set, get) => ({
  topicId: '',
  topicTitle: '',
  nodes: [],
  edges: [],
  experiences: [],
  memos: [],
  undoStack: [],
  redoStack: [],

  saveTopic,
  loadTopic,
  loadMemos,

  dispatch: (command: Command) => {
    if (MEMO_EVENT_TYPES.has(command.type)) {
      const executed = applyMemoStateChange(set, get, command);
      void (async () => {
        try {
          const memos = get().memos;
          await persistMemoStateChange(executed, memos);
          await recordMemoEvent(executed);
          await syncEquippedMemoToBackend(executed, memos);
        } catch (err) {
          console.error(err);
        }
      })();
      return;
    }

    const { topicId } = get();
    if (!topicId) {
      throw new Error('CanvasStore.dispatch: topicId is not set');
    }

    const executed = applyStateChange(set, get, command);
    if (!executed) return;

    pushUndo(set, executed);
    const undoIndex = get().undoStack.length - 1;

    void (async () => {
      try {
        const withEventId = await recordCommandEvent(topicId, executed);
        set((s) => {
          if (undoIndex < 0 || undoIndex >= s.undoStack.length) {
            return {};
          }
          const undoStack = s.undoStack.slice();
          undoStack[undoIndex] = withEventId;
          return { undoStack };
        });

        if (AUTOSAVE_COMMAND_TYPES.has(withEventId.type as CommandTypeName)) {
          scheduleAutoSave(get);
        }
      } catch (err) {
        console.error(err);
      }
    })();
  },

  undo: () => {
    const { topicId, undoStack, redoStack } = get();
    if (!topicId || undoStack.length === 0) return;

    const command = undoStack[undoStack.length - 1];
    const eventLocalId = command.meta?.eventLocalId;

    const inverse = computeInverse(command);
    applyStateChange(set, get, inverse);

    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, command],
    });

    if (eventLocalId != null) {
      void pushEvent(topicId, 'UNDO', { undone_event_id: String(eventLocalId) }).catch(
        console.error,
      );
    }
  },

  redo: () => {
    const { topicId, undoStack, redoStack } = get();
    if (!topicId || redoStack.length === 0) return;

    const command = redoStack[redoStack.length - 1];
    const eventLocalId = command.meta?.eventLocalId;

    applyStateChange(set, get, command);

    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, command].slice(-MAX_UNDO_DEPTH),
    });

    if (eventLocalId != null) {
      void pushEvent(topicId, 'REDO', { redone_event_id: String(eventLocalId) }).catch(
        console.error,
      );
    }
  },
}));
