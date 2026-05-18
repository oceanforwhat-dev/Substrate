import { db } from '../db';
import { buildTopicSnapshot, parseTopicCanvas } from './index';
import { downloadTopicCanvas } from './topicFile';

export interface TopicSummary {
  id: string;
  title: string;
  updated_at: number;
  top_nodes: string[];
  tags: string[];
}

export async function listTopicSummaries(): Promise<TopicSummary[]> {
  const rows = await db.topics.orderBy('updated_at').reverse().toArray();
  return rows.map((row) => ({
    id: row.id,
    title: row.title?.trim() || 'Untitled',
    updated_at: row.updated_at,
    top_nodes: row.top_nodes ?? [],
    tags: row.tags ?? [],
  }));
}

export async function updateTopicTags(topicId: string, tags: string[]): Promise<void> {
  const row = await db.topics.get(topicId);
  if (!row) {
    throw new Error(`updateTopicTags: topic not found: ${topicId}`);
  }
  const normalized = [...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0))];
  await db.topics.put({ ...row, tags: normalized, updated_at: Date.now() });
}

export async function createBlankTopic(title = 'Untitled'): Promise<string> {
  const topicId = crypto.randomUUID();
  const updatedAt = Date.now();
  const snapshot = buildTopicSnapshot(topicId, [], [], []);

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
    tags: [],
  });

  return topicId;
}

export async function renameTopic(topicId: string, title: string): Promise<void> {
  const row = await db.topics.get(topicId);
  if (!row) {
    throw new Error(`renameTopic: topic not found: ${topicId}`);
  }
  const trimmed = title.trim() || 'Untitled';
  await db.topics.put({ ...row, title: trimmed, updated_at: Date.now() });
}

export async function deleteTopic(topicId: string): Promise<void> {
  await db.transaction('rw', db.topics, db.events, db.snapshots, async () => {
    await db.events.where('topic_id').equals(topicId).delete();
    await db.snapshots.delete(topicId);
    await db.topics.delete(topicId);
  });
}

export async function exportTopicFromDb(topicId: string): Promise<void> {
  const snapshotRow = await db.snapshots.get(topicId);
  if (!snapshotRow) {
    throw new Error(`exportTopicFromDb: no snapshot for topic ${topicId}`);
  }
  const topicRow = await db.topics.get(topicId);
  const canvas = parseTopicCanvas(snapshotRow.canvas_snapshot);
  const title = topicRow?.title?.trim() || 'Untitled';
  downloadTopicCanvas(canvas, title);
}
