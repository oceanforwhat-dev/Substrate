import {
  BusinessEdgeSchema,
  BusinessNodeSchema,
  ExperienceSchema,
  ModifierSchema,
  type BusinessEdge,
  type BusinessNode,
  type Experience,
  type Modifier,
  type TopicCanvas,
} from '../schema';
import type { SystemEvent } from '../events';
import { CommandType, type Command, type ModifierTargetType } from '../commands';

const MAX_UNDO_DEPTH = 50;

export interface ReplayResult {
  nodes: BusinessNode[];
  edges: BusinessEdge[];
  experiences: Experience[];
  undoStack: Command[];
  redoStack: Command[];
}

interface CanvasData {
  nodes: BusinessNode[];
  edges: BusinessEdge[];
  experiences: Experience[];
}

interface ReplayStacks {
  undoStack: Command[];
  redoStack: Command[];
}

function findNode(nodes: BusinessNode[], id: string): BusinessNode {
  const node = nodes.find((n) => n.id === id);
  if (!node) throw new Error(`replay: node not found: ${id}`);
  return node;
}

function findEdge(edges: BusinessEdge[], id: string): BusinessEdge {
  const edge = edges.find((e) => e.id === id);
  if (!edge) throw new Error(`replay: edge not found: ${id}`);
  return edge;
}

function findExperience(experiences: Experience[], id: string): Experience {
  const experience = experiences.find((e) => e.id === id);
  if (!experience) throw new Error(`replay: experience not found: ${id}`);
  return experience;
}

function hasDuplicateEdge(
  edges: BusinessEdge[],
  source: string,
  target: string,
  edgeType: BusinessEdge['edge_type'],
): boolean {
  return edges.some(
    (e) => e.source === source && e.target === target && e.edge_type === edgeType,
  );
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

export function computeInverse(command: Command): Command {
  switch (command.type) {
    case CommandType.CREATE_NODE: {
      const node = command.payload?.node as BusinessNode;
      return { type: CommandType.DELETE_NODE, payload: { id: node.id } };
    }
    case CommandType.DELETE_NODE: {
      const node = command.payload?.node as BusinessNode;
      return { type: CommandType.CREATE_NODE, payload: { node } };
    }
    case CommandType.MOVE_NODE: {
      const id = command.payload?.id as string;
      const previousPosition = command.payload?.previousPosition as { x: number; y: number };
      return {
        type: CommandType.MOVE_NODE,
        payload: { id, position: previousPosition },
      };
    }
    case CommandType.ADD_EDGE: {
      const edge = command.payload?.edge as BusinessEdge;
      return { type: CommandType.REMOVE_EDGE, payload: { id: edge.id } };
    }
    case CommandType.REMOVE_EDGE: {
      const edge = command.payload?.edge as BusinessEdge;
      return { type: CommandType.ADD_EDGE, payload: { edge } };
    }
    case CommandType.ATTACH_MODIFIER: {
      const { targetId, targetType, modifier } = command.payload as {
        targetId: string;
        targetType: ModifierTargetType;
        modifier: Modifier;
      };
      return {
        type: CommandType.MODIFIER_REMOVED,
        payload: { targetId, targetType, modifierId: modifier.id },
      };
    }
    case CommandType.MODIFIER_REMOVED: {
      const { targetId, targetType, modifier } = command.payload as {
        targetId: string;
        targetType: ModifierTargetType;
        modifier: Modifier;
      };
      return {
        type: CommandType.ATTACH_MODIFIER,
        payload: { targetId, targetType, modifier },
      };
    }
    case CommandType.CREATE_EXPERIENCE: {
      const experience = command.payload?.experience as Experience;
      return { type: CommandType.DELETE_EXPERIENCE, payload: { id: experience.id } };
    }
    case CommandType.DELETE_EXPERIENCE: {
      const experience = command.payload?.experience as Experience;
      return { type: CommandType.CREATE_EXPERIENCE, payload: { experience } };
    }
    default:
      throw new Error(`replay: cannot compute inverse for "${command.type}"`);
  }
}

function applyCommandPure(canvas: CanvasData, command: Command): {
  canvas: CanvasData;
  executed: Command;
} {
  const { nodes, edges, experiences } = canvas;

  if (command.type === CommandType.CREATE_NODE) {
    const input = (command.payload?.node ?? command.payload) as Record<string, unknown>;
    const id =
      typeof input.id === 'string' && input.id.length > 0 ? input.id : crypto.randomUUID();
    const node = BusinessNodeSchema.parse({ ...input, id });
    return {
      canvas: { nodes: [...nodes, node], edges, experiences },
      executed: { type: CommandType.CREATE_NODE, payload: { node } },
    };
  }

  if (command.type === CommandType.DELETE_NODE) {
    const id = command.payload?.id as string;
    const node = findNode(nodes, id);
    return {
      canvas: { nodes: nodes.filter((n) => n.id !== id), edges, experiences },
      executed: { type: CommandType.DELETE_NODE, payload: { id, node } },
    };
  }

  if (command.type === CommandType.MOVE_NODE) {
    const id = command.payload?.id as string;
    const position = command.payload?.position as { x: number; y: number };
    const existing = findNode(nodes, id);
    const previousPosition = {
      x: existing.metadata.visual.x,
      y: existing.metadata.visual.y,
    };
    return {
      canvas: {
        nodes: nodes.map((n) =>
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
        edges,
        experiences,
      },
      executed: {
        type: CommandType.MOVE_NODE,
        payload: { id, position, previousPosition },
      },
    };
  }

  if (command.type === CommandType.ADD_EDGE) {
    const input = (command.payload?.edge ?? command.payload) as Record<string, unknown>;
    const source = input.source as string;
    const target = input.target as string;
    const edgeType = (input.edge_type as BusinessEdge['edge_type']) ?? 'flat';
    findNode(nodes, source);
    findNode(nodes, target);
    if (hasDuplicateEdge(edges, source, target, edgeType)) {
      throw new Error(`replay: duplicate edge (${source} -> ${target})`);
    }
    const id =
      typeof input.id === 'string' && input.id.length > 0 ? input.id : crypto.randomUUID();
    const edge = BusinessEdgeSchema.parse({ ...input, id, source, target, edge_type: edgeType });
    return {
      canvas: { nodes, edges: [...edges, edge], experiences },
      executed: { type: CommandType.ADD_EDGE, payload: { edge } },
    };
  }

  if (command.type === CommandType.REMOVE_EDGE) {
    const id = command.payload?.id as string;
    const edge = findEdge(edges, id);
    return {
      canvas: {
        nodes,
        edges: edges.filter((e) => e.id !== id),
        experiences: removeEdgeFromExperienceTargets(experiences, id),
      },
      executed: { type: CommandType.REMOVE_EDGE, payload: { id, edge } },
    };
  }

  if (command.type === CommandType.ATTACH_MODIFIER) {
    const targetId = command.payload?.targetId as string;
    const targetType = command.payload?.targetType as ModifierTargetType;
    const modifier = ModifierSchema.parse(command.payload?.modifier);
    const updated = updateModifierTarget(nodes, edges, targetId, targetType, (modifiers) => [
      ...modifiers,
      modifier,
    ]);
    return {
      canvas: { ...updated, experiences },
      executed: {
        type: CommandType.ATTACH_MODIFIER,
        payload: { targetId, targetType, modifier },
      },
    };
  }

  if (command.type === CommandType.MODIFIER_REMOVED) {
    const targetId = command.payload?.targetId as string;
    const targetType = command.payload?.targetType as ModifierTargetType;
    const modifierId = command.payload?.modifierId as string;
    let removedModifier: Modifier | undefined;

    const updated = updateModifierTarget(nodes, edges, targetId, targetType, (modifiers) => {
      const modifier = modifiers.find((m) => m.id === modifierId);
      if (!modifier) throw new Error(`replay: modifier not found: ${modifierId}`);
      removedModifier = modifier;
      return modifiers.filter((m) => m.id !== modifierId);
    });

    if (!removedModifier) {
      throw new Error(`replay: modifier not found: ${modifierId}`);
    }

    return {
      canvas: { ...updated, experiences },
      executed: {
        type: CommandType.MODIFIER_REMOVED,
        payload: { targetId, targetType, modifierId, modifier: removedModifier },
      },
    };
  }

  if (command.type === CommandType.CREATE_EXPERIENCE) {
    const input = (command.payload?.experience ?? command.payload) as Record<string, unknown>;
    const id =
      typeof input.id === 'string' && input.id.length > 0 ? input.id : crypto.randomUUID();
    const experience = ExperienceSchema.parse({ ...input, id });
    return {
      canvas: { nodes, edges, experiences: [...experiences, experience] },
      executed: { type: CommandType.CREATE_EXPERIENCE, payload: { experience } },
    };
  }

  if (command.type === CommandType.DELETE_EXPERIENCE) {
    const id = command.payload?.id as string;
    const experience = findExperience(experiences, id);
    return {
      canvas: { nodes, edges, experiences: experiences.filter((e) => e.id !== id) },
      executed: { type: CommandType.DELETE_EXPERIENCE, payload: { id, experience } },
    };
  }

  throw new Error(`replay: unhandled command "${command.type}"`);
}

function eventToCommand(event: SystemEvent): Command | null {
  switch (event.event_type) {
    case 'NODE_CREATED':
      return { type: CommandType.CREATE_NODE, payload: { node: event.payload.node } };
    case 'NODE_MOVED':
      return {
        type: CommandType.MOVE_NODE,
        payload: { id: event.payload.id, position: event.payload.position },
      };
    case 'NODE_DELETED':
      return { type: CommandType.DELETE_NODE, payload: { id: event.payload.id } };
    case 'EDGE_ADDED':
      return { type: CommandType.ADD_EDGE, payload: { edge: event.payload.edge } };
    case 'EDGE_REMOVED':
      return { type: CommandType.REMOVE_EDGE, payload: { id: event.payload.id } };
    case 'MODIFIER_ATTACHED':
      return {
        type: CommandType.ATTACH_MODIFIER,
        payload: {
          targetId: event.payload.targetId,
          targetType: event.payload.targetType,
          modifier: event.payload.modifier,
        },
      };
    case 'MODIFIER_REMOVED':
      return {
        type: CommandType.MODIFIER_REMOVED,
        payload: {
          targetId: event.payload.targetId,
          targetType: event.payload.targetType,
          modifierId: event.payload.modifierId,
        },
      };
    case 'EXPERIENCE_CREATED':
      return {
        type: CommandType.CREATE_EXPERIENCE,
        payload: { experience: event.payload.experience },
      };
    case 'EXPERIENCE_DELETED':
      return { type: CommandType.DELETE_EXPERIENCE, payload: { id: event.payload.id } };
    case 'UNDO':
    case 'REDO':
    case 'TOPIC_SAVED':
      return null;
    default:
      return null;
  }
}

function pushUndo(stacks: ReplayStacks, command: Command): ReplayStacks {
  return {
    undoStack: [...stacks.undoStack, command].slice(-MAX_UNDO_DEPTH),
    redoStack: [],
  };
}

function replayOne(
  canvas: CanvasData,
  stacks: ReplayStacks,
  event: SystemEvent,
): { canvas: CanvasData; stacks: ReplayStacks } {
  if (event.event_type === 'TOPIC_SAVED') {
    return { canvas, stacks };
  }

  if (event.event_type === 'UNDO') {
    const undoneId = Number(event.payload.undone_event_id);
    const command = stacks.undoStack.find((c) => c.meta?.eventLocalId === undoneId);
    if (!command) {
      throw new Error(`replay: UNDO references unknown event id ${undoneId}`);
    }
    const inverse = computeInverse(command);
    const { canvas: next } = applyCommandPure(canvas, inverse);
    return {
      canvas: next,
      stacks: {
        undoStack: stacks.undoStack.filter((c) => c.meta?.eventLocalId !== undoneId),
        redoStack: [...stacks.redoStack, command],
      },
    };
  }

  if (event.event_type === 'REDO') {
    const redoneId = Number(event.payload.redone_event_id);
    const command = stacks.redoStack.find((c) => c.meta?.eventLocalId === redoneId);
    if (!command) {
      throw new Error(`replay: REDO references unknown event id ${redoneId}`);
    }
    const { canvas: next } = applyCommandPure(canvas, command);
    return {
      canvas: next,
      stacks: {
        redoStack: stacks.redoStack.filter((c) => c.meta?.eventLocalId !== redoneId),
        undoStack: [...stacks.undoStack, command].slice(-MAX_UNDO_DEPTH),
      },
    };
  }

  const command = eventToCommand(event);
  if (!command) {
    return { canvas, stacks };
  }

  const { canvas: next, executed } = applyCommandPure(canvas, command);
  const withMeta: Command = {
    ...executed,
    meta: { eventLocalId: event.id },
  };

  return {
    canvas: next,
    stacks: pushUndo(stacks, withMeta),
  };
}

export function replayEvents(snapshot: TopicCanvas, events: SystemEvent[]): ReplayResult {
  let canvas: CanvasData = {
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    experiences: snapshot.experiences,
  };
  let stacks: ReplayStacks = { undoStack: [], redoStack: [] };

  for (const event of events) {
    const next = replayOne(canvas, stacks, event);
    canvas = next.canvas;
    stacks = next.stacks;
  }

  return {
    nodes: canvas.nodes,
    edges: canvas.edges,
    experiences: canvas.experiences,
    undoStack: stacks.undoStack,
    redoStack: stacks.redoStack,
  };
}
