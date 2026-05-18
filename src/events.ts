// --- Event Type Literals ---
// Runtime-accessible array; TypeScript infers union type via 'as const'
export const EventTypeEnum = [
    'NODE_CREATED', 'NODE_MOVED', 'NODE_UPDATED', 'NODE_DELETED',
    'EDGE_ADDED', 'EDGE_REMOVED',
    'MODIFIER_ATTACHED', 'MODIFIER_UPDATED', 'MODIFIER_REMOVED',
    'EXPERIENCE_CREATED', 'EXPERIENCE_UPDATED', 'EXPERIENCE_DELETED',
    'UNDO', 'REDO',
    'TOPIC_SAVED',
  ] as const;
  
  export type EventType = typeof EventTypeEnum[number];
  
  // --- System Event Interface ---
  // Every event must conform to this shape.
  // The `payload` field shape is documented per event type below.
  export interface SystemEvent {
    id?: number;                  // local auto-increment (IndexedDB)
    topic_id: string;
    user_id: string;
    event_type: EventType;
    /**
     * Payload shape varies per event_type:
     * NODE_CREATED        -> { node: BusinessNode }
     * NODE_MOVED          -> { id: string, position: {x: number, y: number} }
     * NODE_UPDATED        -> { id: string, changes: Partial<BusinessNode> }
     * NODE_DELETED        -> { id: string }
     * EDGE_ADDED          -> { edge: BusinessEdge }
     * EDGE_REMOVED        -> { id: string }
     * MODIFIER_ATTACHED   -> { targetId: string, targetType: 'node'|'edge', modifier: Modifier }
     * MODIFIER_UPDATED    -> { targetId: string, targetType: 'node'|'edge', modifierId: string, changes: Partial<Modifier> }
     * MODIFIER_REMOVED    -> { targetId: string, targetType: 'node'|'edge', modifierId: string }
     * EXPERIENCE_CREATED  -> { experience: Experience }
     * EXPERIENCE_UPDATED  -> { id: string, changes: Partial<Experience> }
     * EXPERIENCE_DELETED  -> { id: string }
     * UNDO                -> { undone_event_id: string }
     * REDO                -> { redone_event_id: string }
     * TOPIC_SAVED         -> { topic_id: string, snapshot: TopicCanvas }
     */
    payload: Record<string, any>;
    client_timestamp: number;
  }