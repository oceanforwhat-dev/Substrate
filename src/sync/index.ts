import { DexieSync } from './DexieSync';

export type { SyncProvider } from './SyncProvider';
export { DexieSync } from './DexieSync';

export const LOCAL_USER_ID = 'local-user';

/** Local-first event log (IndexedDB). */
export const localSync = new DexieSync();

/** @deprecated Use localSync */
export const syncAdapter = localSync;
