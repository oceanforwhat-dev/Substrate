import { db } from '../db';
import { parseTopicCanvas } from './validate';
import type { TopicCanvas } from '../schema';

const INDEX_BATCH_SIZE = 8;

export interface TopicSearchIndexEntry {
  topicId: string;
  title: string;
  tags: string[];
  haystack: string;
}

function normalizeText(value: string): string {
  return value.toLowerCase().trim();
}

function buildHaystack(title: string, canvas: TopicCanvas): string {
  const parts: string[] = [title];
  for (const node of canvas.nodes) {
    parts.push(node.label, node.content);
  }
  for (const experience of canvas.experiences) {
    parts.push(experience.title);
  }
  return normalizeText(parts.join('\n'));
}

export async function buildTopicSearchIndex(
  onProgress?: (done: number, total: number) => void,
): Promise<TopicSearchIndexEntry[]> {
  const rows = await db.topics.toArray();
  const entries: TopicSearchIndexEntry[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const snapshotRow = await db.snapshots.get(row.id);
    const canvas = snapshotRow?.canvas_snapshot
      ? parseTopicCanvas(snapshotRow.canvas_snapshot)
      : parseTopicCanvas({
          topic_id: row.id,
          nodes: [],
          edges: [],
          experiences: [],
        });

    entries.push({
      topicId: row.id,
      title: row.title?.trim() || 'Untitled',
      tags: row.tags ?? [],
      haystack: buildHaystack(row.title?.trim() || 'Untitled', canvas),
    });

    if ((i + 1) % INDEX_BATCH_SIZE === 0 || i === rows.length - 1) {
      onProgress?.(i + 1, rows.length);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    }
  }

  return entries;
}

export function matchesTopicSearch(entry: TopicSearchIndexEntry, query: string): boolean {
  const q = normalizeText(query);
  if (q.length === 0) return true;
  return entry.haystack.includes(q) || normalizeText(entry.title).includes(q);
}

export function filterTopicsByTags(
  topicIds: string[],
  tagsByTopicId: Map<string, string[]>,
  selectedTags: string[],
  mode: 'and' | 'or',
): string[] {
  if (selectedTags.length === 0) return topicIds;

  return topicIds.filter((topicId) => {
    const tags = tagsByTopicId.get(topicId) ?? [];
    if (mode === 'and') {
      return selectedTags.every((tag) => tags.includes(tag));
    }
    return selectedTags.some((tag) => tags.includes(tag));
  });
}
