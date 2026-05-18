import type { BusinessEdge, BusinessNode, Experience, TopicCanvas } from '../schema';

export function computeTopNodeLabels(
  nodes: BusinessNode[],
  edges: BusinessEdge[],
): string[] {
  if (nodes.length === 0) return [];

  const degree = new Map<string, number>();
  for (const node of nodes) {
    degree.set(node.id, 0);
  }
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  const allZero = nodes.every((n) => (degree.get(n.id) ?? 0) === 0);

  const ranked = allZero
    ? [...nodes].sort(
        (a, b) => b.metadata.created_at - a.metadata.created_at,
      )
    : [...nodes].sort(
        (a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0),
      );

  return ranked.slice(0, 3).map((n) => n.label);
}

export function buildTopicSnapshot(
  topicId: string,
  nodes: BusinessNode[],
  edges: BusinessEdge[],
  experiences: Experience[],
): TopicCanvas {
  return {
    topic_id: topicId,
    nodes,
    edges,
    experiences,
    top_nodes: computeTopNodeLabels(nodes, edges),
  };
}
