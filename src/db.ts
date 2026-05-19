import Dexie, { type Table } from 'dexie';
import type { Memo, TopicCanvas } from './schema';

export interface TopicRow {
  id: string;
  title?: string;
  updated_at: number;
  top_nodes?: string[];
  tags?: string[];
}

export interface EventRow {
  local_id?: number;
  topic_id: string;
  user_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  client_timestamp: number;
}

export interface PersistedCommand {
  type: string;
  payload?: Record<string, unknown>;
  meta?: { eventLocalId?: number };
}

export interface SnapshotRow {
  topic_id: string;
  canvas_snapshot: TopicCanvas;
  saved_at: number;
  undo_stack: PersistedCommand[];
  redo_stack: PersistedCommand[];
}

export type MemoRow = Memo & { updated_at: number };

export class SubstrateDB extends Dexie {
  topics!: Table<TopicRow, string>;
  events!: Table<EventRow, number>;
  snapshots!: Table<SnapshotRow, string>;
  memos!: Table<MemoRow, string>;

  constructor(name = 'SubstrateDB') {
    super(name);
    this.version(1).stores({
      topics: 'id, updated_at',
      events: '++local_id, topic_id, event_type, client_timestamp',
      snapshots: 'topic_id',
    });
    this.version(2).stores({
      topics: 'id, updated_at',
      events: '++local_id, topic_id, event_type, client_timestamp',
      snapshots: 'topic_id',
      memos: 'id, title, updated_at',
    });
  }
}

export const db = new SubstrateDB();
