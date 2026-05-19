# Changelog

## Beta 0.0.3 — Memo Overlay & Quick Copy - 2026/5/19

### Added
- Memo system: create, edit, delete, and equip memos from the Dashboard (left panel)
- Memo editor with free-text content and title, reusable as empty box or bindable memo
- Binding mode: select text regions and assign them to keys 1–9 for quick access
- Global memo overlay: toggle with middle mouse button click or double-press Shift (left or right)
- Overlay displays full memo content and binding list, stays on top without stealing focus
- Draggable overlay window with screen-boundary clamping (clamped on drag end)
- Quick Copy mode: enter by tapping Ctrl while overlay is open; exit via Esc, second Ctrl-tap, or after paste
- Paste binding text to external apps via clipboard + simulated Ctrl+V
- Paste binding text to Substrate’s own inputs via Tauri event, bypassing focus conflicts
- Fallback clipboard-only paste when target window is no longer valid
- Backup trigger for middle mouse button: double-press Shift for users with broken or missing MMB

### Fixed
- Overlay briefly flashing "No memo equipped" placeholder on open
- Overlay showing stale content after editing equipped memo (now refreshes on next open)
- Overlay text not wrapping (forced single line with horizontal scroll)
- Overlay appearing partially off-screen or outside monitor bounds
- Overlay "twitching" when dragged near screen edges due to continuous clamping
- Overlay drag tracking lag (mouse moved farther than window) caused by DPI scaling mismatch
- Memo editor modal closing unexpectedly when mouse released outside after text selection
- Memo editor modal size too small for comfortable editing
- Delete button missing from memo list (added with confirmation popover)
- Ugly checkbox replaced with smooth toggle switch for equipping memos
- Number key leaking into target application when pasting (digit prepended to pasted text)
- Quick Copy mode completely non-functional when Substrate main window had focus
- Number key leaking specifically in Substrate’s own inputs due to WebView key handling

### Changed
- Memo editor modal enlarged for comfortable editing (wider and taller)
- Equip toggle redesigned as iOS-style rounded switch, no text label
- Memo list item layout: trash icon (left) — title — type badge — equip toggle (right)
- Overlay close button (✕) added to top-right corner for manual dismiss
- Diagnostic logging cleaned up after fixes verified

### Technical
- Memo schema, events, store, and IndexedDB table implemented (Cycle 1)
- Global mouse/keyboard event detection via device_query + Win32 GetAsyncKeyState (Cycle 2)
- Keyboard hook for number key interception with polling fallback (Cycle 3)
- Self-paste path via Tauri event `paste-binding-text` to avoid focus conflicts within same app

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