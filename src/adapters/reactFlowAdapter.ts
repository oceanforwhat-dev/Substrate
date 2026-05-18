import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { BusinessEdge, BusinessNode, Experience } from '../schema';

/** View-model edge data: business edge + adapter-computed curvature (not persisted). */
export type FlowEdgeData = BusinessEdge & { curvature: number };

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

const NODE_TYPE_MAP = {
  component: 'componentNode',
  goal: 'goalNode',
} as const;

const CURVATURE_BY_COUNT: Record<number, number[]> = {
  1: [0],
  2: [0.3, -0.3],
  3: [0, 0.5, -0.5],
};

function curvatureForPairIndex(pairCount: number, index: number): number {
  const preset = CURVATURE_BY_COUNT[pairCount];
  if (preset) {
    return preset[index] ?? 0;
  }
  if (pairCount <= 1) {
    return 0;
  }
  const step = 1 / (pairCount - 1);
  return -0.5 + index * step;
}

function pairKey(source: string, target: string): string {
  return `${source}|${target}`;
}

export function toReactFlowNodes(businessNodes: BusinessNode[]): Node<BusinessNode>[] {
  return businessNodes.map((businessNode) => {
    const node = deepClone(businessNode);
    return {
      id: node.id,
      type: NODE_TYPE_MAP[node.type],
      position: { x: node.metadata.visual.x, y: node.metadata.visual.y },
      data: node,
    };
  });
}

export function toReactFlowEdges(businessEdges: BusinessEdge[]): Edge<FlowEdgeData>[] {
  const pairGroups = new Map<string, BusinessEdge[]>();
  for (const businessEdge of businessEdges) {
    const key = pairKey(businessEdge.source, businessEdge.target);
    const group = pairGroups.get(key) ?? [];
    group.push(businessEdge);
    pairGroups.set(key, group);
  }

  return businessEdges.map((businessEdge) => {
    const edge = deepClone(businessEdge);
    const key = pairKey(edge.source, edge.target);
    const group = pairGroups.get(key) ?? [edge];
    const index = group.findIndex((e) => e.id === edge.id);
    const curvature = curvatureForPairIndex(group.length, index);

    const data: FlowEdgeData = { ...edge, curvature };
    const isDirected = edge.edge_type === 'directed_thought';

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'thought',
      data,
      markerEnd: isDirected
        ? { type: MarkerType.ArrowClosed, width: 18, height: 18, color: '#78716c' }
        : undefined,
    };
  });
}

export function toReactFlowExperiences(
  experiences: Experience[],
): Node<Experience>[] {
  return experiences.map((experience) => {
    const exp = deepClone(experience);
    return {
      id: exp.id,
      type: 'experienceNode',
      position: { x: exp.metadata.visual.x, y: exp.metadata.visual.y },
      data: exp,
      zIndex: 0,
    };
  });
}

/** Experiences first (behind), then business nodes. */
export function toReactFlowCanvasNodes(
  businessNodes: BusinessNode[],
  experiences: Experience[],
): Node[] {
  return [
    ...toReactFlowExperiences(experiences),
    ...toReactFlowNodes(businessNodes).map((node) => ({ ...node, zIndex: 1 })),
  ];
}
