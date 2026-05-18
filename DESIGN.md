# Substrate Design Manifesto

## 1. Core Philosophy
Substrate is a "Cognitive Operating System" derived from the A4 Learning Method.
It reifies thinking into four atomic types: Nodes, Edges, Modifiers, and Experiences.

**Design Constraint**: A single topic canvas MUST NOT exceed 200 nodes (A4 paper metaphor). 
Beyond this, prompt the user to split into multiple topics.

## 2. Atomic Primitives

### Node
- `id: string`
- `type: 'component' | 'goal'`
- `label: string`
- `content: string`
- `modifiers: Modifier[]`
- `metadata: { visual: { x: number, y: number }, created_at: number }`

### Edge
- `id: string`
- `source: string` (Node ID)
- `target: string` (Node ID)
- `edge_type: 'flat' | 'directed_thought'`
- `modifiers: Modifier[]`
- `metadata: { paradigm: string, connectedGoalId: string }`

### Modifier (attached to Node or Edge)
- `id: string`
- `type: 'text' | 'image' | 'scope' | 'syntax'`
- `content: string`
- `url: string` (for image type)
- `appliesToTopic: boolean` (scope covers entire topic)

### Experience (standalone entity)
- `id: string`
- `title: string`
- `content: string`
- `targets: { id: string, type: 'node' | 'edge' }[]`
- `resolved: boolean`
- `metadata: { visual: { x: number, y: number }, created_at: number }`

## 3. Storage & Sync (Migration on Read)

### Local (IndexedDB via Dexie.js)
- `topics` table: `id, title, updated_at`
- `events` table: `local_id (auto), topic_id, event_type, payload, client_timestamp`
- `snapshots` table: `topic_id, canvas_snapshot (JSON)`

### Remote (Supabase)
- `topics` table: `id, user_id, title, tags, canvas_snapshot (JSONB), updated_at`
- `events` table: `id, topic_id, user_id, event_type, payload (JSONB), client_timestamp`

### Sync Flow
1. **Save**: Write event to local events table → Generate snapshot → Push new events + snapshot to Supabase.
2. **Load**: Fetch latest snapshot from Supabase → If newer than local, use it. 
   Then replay local events that are newer than the snapshot.
3. **Conflict**: If local and remote `updated_at` diverge, show a modal: 
   "A newer cloud version exists. Keep local or overwrite with cloud?"
4. **Zod Wall**: All data from IndexedDB or Supabase MUST pass `TopicCanvasSchema.parse()` before entering Zustand.

### LWW Strategy
- Use `client_timestamp` for ordering.
- Single-topic granularity (no field-level merging).

## 4. Undo/Redo Logic
- **Store**: `undoStack: Command[]` (max depth: 50), `redoStack: Command[]`.
- **Logic**:
    1. Undo: Pop from undoStack → Compute inverse command → Apply to state → Push to redoStack.
    2. Redo: Pop from redoStack → Compute inverse of inverse → Apply → Push back to undoStack.
    3. Event: Append `{ event_type: 'UNDO', payload: { undone_event_id } }` to event stream.
    4. Clear redoStack when a new non-undo command is dispatched.
- **Integrity**: Never physically delete events from the IndexedDB events table.

## 5. Dashboard Centrality
- **On Save**: Calculate Degree Centrality (number of edges connected to each node).
- **Rank**: Top 3 nodes by degree stored in `canvas_snapshot.top_nodes: string[]`.
- **Fallback**: If all nodes have degree 0, use the 3 most recently created nodes.
- **UI**: Dashboard cards display these 3 titles as cognitive anchors.

## 6. Event Catalog (Key Events)

| Event Type | Payload | Trigger |
|---|---|---|
| `NODE_CREATED` | `{ node: BusinessNode }` | User creates a node |
| `NODE_MOVED` | `{ id, position: {x,y} }` | `onNodeDragStop` only |
| `NODE_UPDATED` | `{ id, changes }` | User edits node label/content |
| `NODE_DELETED` | `{ id }` | User deletes a node |
| `EDGE_ADDED` | `{ edge: BusinessEdge }` | User creates a connection |
| `EDGE_REMOVED` | `{ id }` | User deletes a connection |
| `MODIFIER_ATTACHED` | `{ targetId, targetType, modifier }` | User adds modifier to node/edge |
| `MODIFIER_REMOVED` | `{ targetId, modifierId }` | User removes modifier |
| `EXPERIENCE_CREATED` | `{ experience: Experience }` | Lasso + create experience |
| `EXPERIENCE_UPDATED` | `{ id, changes }` | User edits experience |
| `EXPERIENCE_DELETED` | `{ id }` | User deletes experience |
| `UNDO` | `{ undone_event_id }` | User presses Ctrl+Z |
| `REDO` | `{ redone_event_id }` | User presses Ctrl+Shift+Z |
| `TOPIC_SAVED` | `{ topic_id, snapshot }` | User clicks Save |

All event types MUST be defined as string literals in `events.ts`.

## 7. Data Flow
