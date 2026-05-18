# Changelog
## Beta 0.0.2 — Interaction & Polish - 2026/5/18

### Fixed
- Undo stack limited to 3 steps (now full 50-step depth as designed)
- Redo shortcut changed from Ctrl+Shift+Z to Ctrl+Y (Windows standard)
- Consecutive edge creation between same node pair failing to attach
- Ghost edge appearing when cancelling edge drag then switching connection mode
- Clicking a node during mouse movement not registering selection
- Clicking a selected node not deselecting it (required clicking empty canvas)
- Edges not showing visual selection state and having no right-click delete option
- Sidebar toggle button changing width when toggled (text label length shift)
- Sidebar unable to be closed by clicking its toggle button a second time
- Connection-mode button overlapping with opened sidebar
- Toolbar layout shifting when switching between Chinese and English
- Modifier input using native browser `window.prompt()` dialog
- Top-left area showing overlapping Dashboard breadcrumb and uneditable topic title
- Right-click modifier menu still showing deprecated "Syntax" option
- Dashboard subtitle showing meaningless "Topics on this device" text

### Changed
- Top-left topic title is now click-to-rename via inline input
- Dashboard subtitle replaced with dynamic topic count display
- Modifier input now uses custom inline popover with Confirm/Cancel buttons
- Sidebar toggle button uses fixed-width icon, toggles open and closed
- Toolbar buttons use fixed minimum width for layout stability across languages

### Technical
- Updated Tauri bundle with all fixes (Windows/macOS/Linux)

## Beta 0.0.1 — MVP - 2026/5/17

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