import type { BusinessNode } from '../schema';

export function getOriginTopicId(node: BusinessNode): string | undefined {
  const id = node.metadata.origin_topic_id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

export function isNodeReference(node: BusinessNode): boolean {
  return getOriginTopicId(node) != null;
}
