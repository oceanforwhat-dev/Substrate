# Changelog

## Beta 0.0.1 — MVP

### Added
- Infinite canvas with four atomic primitives: Nodes, Edges, Modifiers, Experiences
- Two node types: Component and Goal
- Two edge types: Flat connection and Directed thought (with arrow)
- Modifier system: text, image, syntax, and scope modifiers attachable to nodes and edges
- Lasso tool for grouping nodes/edges into Experiences
- Multi-edge offset (parallel edges between same nodes visually separate)
- Right-click context menu (flat hierarchy, no submenus)
- Keyboard shortcuts: C (component), G (goal), S (thought mode), L (lasso), Esc (default mode)
- Local persistence via IndexedDB — refresh does not lose data
- Snapshot-based save/load with Zod validation wall
- Event sourcing (append-only event log)
- File export/import (.substrate)
- Cross-topic node copy/paste with origin tracking
- Dashboard with topic cards, search, and tag filtering
- Outline sidebar for current canvas
- Chinese / English / custom language pack import
- Light / dark theme toggle

### Known issues
- Undo/Redo not yet implemented
- No Tauri desktop packaging yet
- Multi-window not supported
- Experience visual bound may not follow node movement (one-time mapping at creation)