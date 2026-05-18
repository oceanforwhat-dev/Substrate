import { db } from '../db';
import { parseTopicCanvas } from './validate';

export interface RelatedTopicMatch {
  topicId: string;
  title: string;
  matchingLabels: string[];
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

export async function findRelatedTopics(
  currentTopicId: string,
  anchorLabels: string[],
): Promise<RelatedTopicMatch[]> {
  const anchors = new Set(
    anchorLabels.map(normalizeLabel).filter((label) => label.length > 0),
  );
  if (anchors.size === 0) return [];

  const rows = await db.topics.toArray();
  const matches: RelatedTopicMatch[] = [];

  for (const row of rows) {
    if (row.id === currentTopicId) continue;

    const snapshotRow = await db.snapshots.get(row.id);
    if (!snapshotRow) continue;

    const canvas = parseTopicCanvas(snapshotRow.canvas_snapshot);
    const matchingLabels = new Set<string>();

    for (const node of canvas.nodes) {
      const normalized = normalizeLabel(node.label);
      if (anchors.has(normalized)) {
        matchingLabels.add(node.label.trim() || normalized);
      }
    }

    if (matchingLabels.size === 0) continue;

    matches.push({
      topicId: row.id,
      title: row.title?.trim() || 'Untitled',
      matchingLabels: [...matchingLabels],
    });
  }

  return matches.sort((a, b) => b.matchingLabels.length - a.matchingLabels.length);
}
