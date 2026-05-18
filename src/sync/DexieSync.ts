import { db } from '../db';
import type { SystemEvent } from '../events';
import type { SyncProvider } from './SyncProvider';

export class DexieSync implements SyncProvider {
  async push(event: SystemEvent): Promise<void> {
    const localId = await db.events.add({
      topic_id: event.topic_id,
      user_id: event.user_id,
      event_type: event.event_type,
      payload: event.payload,
      client_timestamp: event.client_timestamp,
    });
    event.id = localId;
  }

  async pull(topicId: string, afterTimestamp: number): Promise<SystemEvent[]> {
    const rows = await db.events
      .where('topic_id')
      .equals(topicId)
      .filter((row) => row.client_timestamp > afterTimestamp)
      .sortBy('client_timestamp');

    return rows.map((row) => ({
      id: row.local_id,
      topic_id: row.topic_id,
      user_id: row.user_id,
      event_type: row.event_type as SystemEvent['event_type'],
      payload: row.payload,
      client_timestamp: row.client_timestamp,
    }));
  }
}
