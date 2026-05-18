import type { SystemEvent } from '../events';

export interface SyncProvider {
  push(event: SystemEvent): Promise<void>;
  pull(topicId: string, afterTimestamp: number): Promise<SystemEvent[]>;
}
