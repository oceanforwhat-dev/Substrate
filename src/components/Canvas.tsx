import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  applyNodeChanges,
  Background,
  getBezierPath,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  useStore,
  useStoreApi,
  type Connection,
  type ConnectionLineComponentProps,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
  type OnNodeDrag,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toReactFlowCanvasNodes, toReactFlowEdges } from '../adapters/reactFlowAdapter';
import {
  downloadTopicCanvas,
  extractDroppedTopicFile,
  pickTopicFile,
  readTopicFile,
  titleFromFileName,
} from '../lib/topicFile';
import {
  getNodeClipboard,
  setNodeClipboard,
  type NodeClipboardPayload,
} from '../lib/nodeClipboard';
import { CanvasSidebar } from './CanvasSidebar';
import type { BusinessEdge, BusinessNode, Modifier } from '../schema';
import { SHORTCUTS } from '../shortcuts';
import {
  CommandType,
  getTopicCanvasForExport,
  importTopicCanvas,
  loadTopic,
  registerPostLoadFitView,
  type ModifierTargetType,
  useCanvasSelector,
} from '../store';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeContext';
import { ImportLanguagePackButton } from './ImportLanguagePackButton';
import { LocaleSwitcher } from './LocaleSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { ComponentNode } from './nodes/ComponentNode';
import { ExperienceNode } from './nodes/ExperienceNode';
import { ThoughtEdge } from './edges/ThoughtEdge';
import { GoalNode } from './nodes/GoalNode';

const HEADER_BTN =
  'rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 shadow-sm hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700';

const DEFAULT_NODE_WIDTH = 150;
const DEFAULT_NODE_HEIGHT = 56;

const nodeTypes: NodeTypes = {
  componentNode: ComponentNode,
  goalNode: GoalNode,
  experienceNode: ExperienceNode,
};

const edgeTypes = {
  thought: ThoughtEdge,
} satisfies EdgeTypes;

type ContextMenuKind = 'pane' | 'node' | 'edge' | 'experience';

interface ContextMenuState {
  clientX: number;
  clientY: number;
  flowX: number;
  flowY: number;
  kind: ContextMenuKind;
  targetId?: string;
}

const CONNECTION_ARROW_ID = 'substrate-connection-arrow';

function ThoughtConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
  connectionLineStyle,
}: ConnectionLineComponentProps) {
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
  });

  return (
    <>
      <defs>
        <marker
          id={CONNECTION_ARROW_ID}
          markerWidth={12}
          markerHeight={12}
          refX={8}
          refY={6}
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,12 L12,6 z" fill="#78716c" />
        </marker>
      </defs>
      <path
        d={path}
        fill="none"
        className="react-flow__connection-path"
        style={connectionLineStyle}
        markerEnd={`url(#${CONNECTION_ARROW_ID})`}
      />
    </>
  );
}

interface ExperiencePromptState {
  screenX: number;
  screenY: number;
  targets: { id: string; type: 'node' | 'edge' }[];
  bbox: { x: number; y: number; width: number; height: number };
}

function computeSelectionBounds(nodes: Node[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const width = node.measured?.width ?? node.width ?? DEFAULT_NODE_WIDTH;
    const height = node.measured?.height ?? node.height ?? DEFAULT_NODE_HEIGHT;
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + width);
    maxY = Math.max(maxY, node.position.y + height);
  }

  const width = Math.max(maxX - minX, 48);
  const height = Math.max(maxY - minY, 48);
  return { x: minX, y: minY, width, height };
}

interface CanvasFlowProps {
  onBack: () => void;
  onTopicImported: (topicId: string) => void;
}

function CanvasFlow({ onBack, onTopicImported }: CanvasFlowProps) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const topicId = useCanvasSelector((s) => s.topicId);
  const topicTitle = useCanvasSelector((s) => s.topicTitle);
  const businessNodes = useCanvasSelector((s) => s.nodes);
  const businessEdges = useCanvasSelector((s) => s.edges);
  const businessExperiences = useCanvasSelector((s) => s.experiences);
  const dispatch = useCanvasSelector((s) => s.dispatch);
  const { screenToFlowPosition, flowToScreenPosition, fitView, getNodes } = useReactFlow();
  const storeApi = useStoreApi();

  useEffect(() => {
    registerPostLoadFitView(() => {
      requestAnimationFrame(() => {
        fitView({ padding: 0.2, duration: 0 });
      });
    });
    return () => registerPostLoadFitView(null);
  }, [fitView]);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [lassoMode, setLassoMode] = useState(false);
  const [edgeType, setEdgeType] = useState<BusinessEdge['edge_type']>('flat');
  const [experiencePrompt, setExperiencePrompt] = useState<ExperiencePromptState | null>(null);
  const [experienceTitle, setExperienceTitle] = useState('');
  const [experienceContent, setExperienceContent] = useState('');
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mouseFlowRef = useRef({ x: 0, y: 0 });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedCanvasNodes = useStore((state) =>
    state.nodes.filter(
      (node) =>
        node.selected && (node.type === 'componentNode' || node.type === 'goalNode'),
    ),
  );

  const connectionLineStyle =
    edgeType === 'directed_thought'
      ? { stroke: '#78716c', strokeWidth: 2 }
      : { stroke: '#a8a29e', strokeWidth: 2 };

  const baseRfNodes = useMemo(
    () => toReactFlowCanvasNodes(businessNodes, businessExperiences),
    [businessNodes, businessExperiences],
  );
  const [rfNodes, setRfNodes] = useState<Node[]>(baseRfNodes);

  useEffect(() => {
    setRfNodes((prev) => {
      const selectedIds = new Set(
        prev.filter((node) => node.selected).map((node) => node.id),
      );
      return baseRfNodes.map((node) => ({
        ...node,
        selectable: true,
        selected: selectedIds.has(node.id),
      }));
    });
  }, [baseRfNodes]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setRfNodes((nodes) => applyNodeChanges(changes, nodes));
  }, []);

  const clearNodeSelection = useCallback(() => {
    setRfNodes((nodes) => nodes.map((node) => ({ ...node, selected: false })));
    storeApi.getState().unselectNodesAndEdges();
  }, [storeApi]);

  const rfEdges = useMemo(() => toReactFlowEdges(businessEdges), [businessEdges]);

  const showToast = useCallback((message: string, durationMs = 2800) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast(message);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, durationMs);
  }, []);

  const selectionStatusText = useMemo(() => {
    if (selectedCanvasNodes.length === 0) {
      return t('canvas.selection.none');
    }
    if (selectedCanvasNodes.length === 1) {
      const data = selectedCanvasNodes[0]!.data as BusinessNode;
      const label =
        data.label.trim() ||
        (data.type === 'goal' ? t('node.goalDefault') : t('node.componentDefault'));
      const typeLabel =
        data.type === 'goal' ? t('node.type.goal') : t('node.type.component');
      return `${t('canvas.selection.prefix')} ${label} (${typeLabel})`;
    }
    return `${t('canvas.selection.prefix')} ${selectedCanvasNodes.length} ${t('canvas.selection.nodes')}`;
  }, [selectedCanvasNodes, t]);

  const createNodeAt = useCallback(
    (
      type: 'component' | 'goal',
      position: { x: number; y: number },
      options?: { label?: string; originTopicId?: string; originNodeId?: string },
    ) => {
      const metadata: Record<string, unknown> = { visual: position };
      if (options?.originTopicId) {
        metadata.origin_topic_id = options.originTopicId;
      }
      if (options?.originNodeId) {
        metadata.origin_node_id = options.originNodeId;
      }
      dispatch({
        type: CommandType.CREATE_NODE,
        payload: {
          node: {
            type,
            label:
              options?.label ??
              (type === 'component' ? t('node.componentDefault') : t('node.goalDefault')),
            metadata,
          },
        },
      });
    },
    [dispatch, t],
  );

  const pasteReferenceNode = useCallback(
    (clip: NodeClipboardPayload, position: { x: number; y: number }) => {
      const isCrossTopic = clip.topicId !== topicId;
      createNodeAt(clip.type, position, {
        label: clip.label,
        ...(isCrossTopic
          ? { originTopicId: clip.topicId, originNodeId: clip.nodeId }
          : {}),
      });
    },
    [createNodeAt, topicId],
  );

  const openContextMenu = useCallback(
    (
      event: MouseEvent | ReactMouseEvent,
      kind: ContextMenuKind,
      targetId?: string,
    ) => {
      event.preventDefault();
      const clientX = 'clientX' in event ? event.clientX : 0;
      const clientY = 'clientY' in event ? event.clientY : 0;
      const flow = screenToFlowPosition({ x: clientX, y: clientY });
      setContextMenu({ clientX, clientY, flowX: flow.x, flowY: flow.y, kind, targetId });
    },
    [screenToFlowPosition],
  );

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | ReactMouseEvent) => {
      openContextMenu(event, 'pane');
    },
    [openContextMenu],
  );

  const onNodeContextMenu = useCallback(
    (event: ReactMouseEvent, node: Node) => {
      if (node.type === 'experienceNode') {
        openContextMenu(event, 'experience', node.id);
        return;
      }
      openContextMenu(event, 'node', node.id);
    },
    [openContextMenu],
  );

  const onEdgeContextMenu = useCallback(
    (event: ReactMouseEvent, edge: Edge) => {
      openContextMenu(event, 'edge', edge.id);
    },
    [openContextMenu],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      dispatch({
        type: CommandType.ADD_EDGE,
        payload: {
          edge: {
            source: connection.source,
            target: connection.target,
            edge_type: edgeType,
          },
        },
      });
    },
    [dispatch, edgeType],
  );

  const onMouseMove = useCallback(
    (event: ReactMouseEvent) => {
      mouseFlowRef.current = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
    },
    [screenToFlowPosition],
  );

  const onNodeDragStop: OnNodeDrag<Node> = useCallback(
    (_event, node) => {
      dispatch({
        type: CommandType.MOVE_NODE,
        payload: { id: node.id, position: node.position },
      });
    },
    [dispatch],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const attachModifier = useCallback(
    (targetId: string, targetType: ModifierTargetType, modifierType: Modifier['type']) => {
      let content = '';
      let url = '';

      if (modifierType === 'text') {
        const input = window.prompt(t('prompt.textModifier'));
        if (input === null) return;
        content = input;
      } else if (modifierType === 'image') {
        const input = window.prompt(t('prompt.imageUrl'));
        if (input === null) return;
        url = input;
      } else if (modifierType === 'scope') {
        content = t('modifier.scopeLabel');
      } else {
        content = t('modifier.syntaxLabel');
      }

      dispatch({
        type: CommandType.ATTACH_MODIFIER,
        payload: {
          targetId,
          targetType,
          modifier: {
            id: crypto.randomUUID(),
            type: modifierType,
            content,
            url,
            appliesToTopic: false,
          },
        },
      });
      closeContextMenu();
    },
    [closeContextMenu, dispatch, t],
  );

  const closeExperiencePrompt = useCallback(() => {
    setExperiencePrompt(null);
    setExperienceTitle('');
    setExperienceContent('');
  }, []);

  const exitLassoMode = useCallback(() => {
    setLassoMode(false);
    closeExperiencePrompt();
  }, [closeExperiencePrompt]);

  const onSelectionEnd = useCallback(() => {
    if (!lassoMode) return;

    const { nodeLookup, edgeLookup } = storeApi.getState();
    const selectedNodes: Node[] = [];
    for (const [, internalNode] of nodeLookup) {
      if (!internalNode.selected) continue;
      const node = internalNode.internals.userNode;
      if (node.type === 'experienceNode') continue;
      selectedNodes.push(node);
    }

    const selectedEdges: Edge[] = [];
    for (const [, edge] of edgeLookup) {
      if (edge.selected) {
        selectedEdges.push(edge);
      }
    }

    if (selectedNodes.length === 0 && selectedEdges.length === 0) {
      closeExperiencePrompt();
      return;
    }

    const bbox = computeSelectionBounds(selectedNodes);
    const centerX = bbox.x + bbox.width / 2;
    const centerY = bbox.y + bbox.height / 2;
    const screen = flowToScreenPosition({ x: centerX, y: centerY });

    setExperiencePrompt({
      screenX: screen.x,
      screenY: screen.y,
      bbox,
      targets: [
        ...selectedNodes.map((node) => ({ id: node.id, type: 'node' as const })),
        ...selectedEdges.map((edge) => ({ id: edge.id, type: 'edge' as const })),
      ],
    });
    setExperienceTitle('');
    setExperienceContent('');
  }, [closeExperiencePrompt, flowToScreenPosition, lassoMode, storeApi]);

  const createExperience = useCallback(() => {
    if (!experiencePrompt) return;

    const title = experienceTitle.trim() || t('node.experienceDefault');
    const content = experienceContent.trim();
    const centerX = experiencePrompt.bbox.x + experiencePrompt.bbox.width / 2;
    const centerY = experiencePrompt.bbox.y + experiencePrompt.bbox.height / 2;
    const width = experiencePrompt.bbox.width;
    const height = experiencePrompt.bbox.height;

    dispatch({
      type: CommandType.CREATE_EXPERIENCE,
      payload: {
        experience: {
          title,
          content,
          targets: experiencePrompt.targets,
          metadata: {
            visual: {
              x: centerX - width / 2,
              y: centerY - height / 2,
              width,
              height,
            },
          },
        },
      },
    });

    clearNodeSelection();
    exitLassoMode();
  }, [clearNodeSelection, dispatch, experienceContent, experiencePrompt, experienceTitle, exitLassoMode, t]);

  const handlePaste = useCallback(() => {
    closeContextMenu();
    const clip = getNodeClipboard();
    if (!clip) return;
    pasteReferenceNode(clip, mouseFlowRef.current);
    showToast(`${t('toast.pastedPrefix')} ${clip.label}`, 1500);
  }, [closeContextMenu, pasteReferenceNode, showToast, t]);

  const handleExport = useCallback(() => {
    try {
      const canvas = getTopicCanvasForExport();
      downloadTopicCanvas(canvas, topicTitle || t('common.untitled'));
      showToast(t('toast.exported'));
    } catch (err) {
      console.error(err);
      showToast(t('toast.exportFailed'));
    }
  }, [showToast, t, topicTitle]);

  const runImport = useCallback(
    async (file: File) => {
      setImporting(true);
      try {
        const raw = await readTopicFile(file);
        const topicId = await importTopicCanvas(raw, titleFromFileName(file.name));
        onTopicImported(topicId);
        showToast(t('toast.imported'));
      } catch (err) {
        console.error(err);
        showToast(t('toast.importInvalid'));
      } finally {
        setImporting(false);
      }
    },
    [onTopicImported, showToast, t],
  );

  const handleImportClick = useCallback(async () => {
    const file = await pickTopicFile();
    if (file) {
      await runImport(file);
    }
  }, [runImport]);

  const handleDrop = useCallback(
    async (event: DragEvent) => {
      event.preventDefault();
      setDragOver(false);
      const file = extractDroppedTopicFile(event.dataTransfer);
      if (file) {
        await runImport(file);
      }
    },
    [runImport],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const chord = event.ctrlKey || event.metaKey;

      if (chord && key === 'c') {
        const selected = getNodes().filter(
          (node) =>
            node.selected && (node.type === 'componentNode' || node.type === 'goalNode'),
        );
        if (selected.length === 1 && topicId) {
          const flowNode = selected[0]!;
          const data = flowNode.data as BusinessNode | undefined;
          if (data && (data.type === 'component' || data.type === 'goal')) {
            event.preventDefault();
            setNodeClipboard({
              nodeId: flowNode.id,
              topicId,
              label: data.label.trim() || flowNode.id,
              type: data.type,
            });
            const copyLabel = data.label.trim() || flowNode.id;
            showToast(`${t('toast.copiedPrefix')} ${copyLabel}`, 1500);
          }
        }
        return;
      }

      if (chord && key === 'v') {
        event.preventDefault();
        handlePaste();
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (event.shiftKey && key !== SHORTCUTS.ESCAPE) {
        return;
      }

      if (key === SHORTCUTS.ESCAPE) {
        closeContextMenu();
        if (experiencePrompt) {
          closeExperiencePrompt();
          clearNodeSelection();
        } else {
          exitLassoMode();
        }
        return;
      }

      if (key === SHORTCUTS.LASSO) {
        event.preventDefault();
        setLassoMode((active) => !active);
        setExperiencePrompt(null);
        setExperienceTitle('');
        setExperienceContent('');
        closeContextMenu();
        return;
      }

      if (lassoMode) {
        return;
      }

      if (key === SHORTCUTS.THOUGHT_MODE) {
        event.preventDefault();
        setEdgeType((current) => (current === 'flat' ? 'directed_thought' : 'flat'));
        return;
      }

      if (key === SHORTCUTS.CREATE_COMPONENT) {
        event.preventDefault();
        createNodeAt('component', mouseFlowRef.current);
        return;
      }

      if (key === SHORTCUTS.CREATE_GOAL) {
        event.preventDefault();
        createNodeAt('goal', mouseFlowRef.current);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    clearNodeSelection,
    closeContextMenu,
    closeExperiencePrompt,
    createNodeAt,
    exitLassoMode,
    experiencePrompt,
    getNodes,
    handlePaste,
    lassoMode,
    showToast,
    topicId,
    t,
  ]);

  return (
<>
      <header className="fixed left-4 top-4 z-50 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-2">
        <nav
          className="flex min-w-0 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1 shadow-sm dark:border-stone-600 dark:bg-stone-800"
          aria-label={t('canvas.breadcrumb')}
        >
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 text-xs font-medium text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100"
          >
            {t('canvas.dashboard')}
          </button>
          <span className="text-xs text-stone-400 dark:text-stone-500" aria-hidden>
            /
          </span>
          <span className="max-w-[10rem] truncate text-xs font-medium text-stone-800 dark:text-stone-100">
            {topicTitle || t('common.untitled')}
          </span>
        </nav>
        <button type="button" onClick={onBack} className={HEADER_BTN}>
          {t('canvas.backToDashboard')}
        </button>
        <LocaleSwitcher />
        <ThemeToggle />
        <ImportLanguagePackButton
          onSuccess={() => showToast(t('toast.languageImported'))}
          onError={() => showToast(t('toast.languageInvalid'))}
        />
        <button type="button" onClick={handleExport} className={HEADER_BTN}>
          {t('header.export')}
        </button>
        <button
          type="button"
          onClick={() => void handleImportClick()}
          disabled={importing}
          className={HEADER_BTN}
        >
          {importing ? t('common.importing') : t('header.import')}
        </button>
        <button
          type="button"
          onClick={() => setSidebarOpen((open) => !open)}
          className={HEADER_BTN}
        >
          {sidebarOpen ? t('canvas.sidebar.hide') : t('canvas.sidebar.show')}
        </button>
        <span className="text-xs text-stone-500 dark:text-stone-400">{selectionStatusText}</span>
      </header>

      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-orange-50/80 dark:bg-orange-950/50">
          <p className="rounded-lg border-2 border-dashed border-orange-400 bg-white px-6 py-3 text-sm font-medium text-orange-900 dark:border-orange-500 dark:bg-stone-800 dark:text-orange-200">
            {t('canvas.dropImport')}
          </p>
        </div>
      )}

      <div className="flex h-full w-full">
      <div className="relative min-w-0 flex-1">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesConnectable
        nodesDraggable
        elementsSelectable
        edgesFocusable
        nodesFocusable
        selectionMode={lassoMode ? SelectionMode.Partial : SelectionMode.Full}
        selectionOnDrag={lassoMode}
        panOnDrag={!lassoMode}
        onConnect={onConnect}
        connectionLineStyle={connectionLineStyle}
        connectionLineComponent={
          edgeType === 'directed_thought' ? ThoughtConnectionLine : undefined
        }
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onMouseMove={onMouseMove}
        onNodeDragStop={onNodeDragStop}
        onSelectionEnd={onSelectionEnd}
        onNodesChange={onNodesChange}
        selectNodesOnDrag={false}
        onPaneClick={() => {
          closeContextMenu();
          if (experiencePrompt) {
            closeExperiencePrompt();
            clearNodeSelection();
          } else if (!lassoMode) {
            closeExperiencePrompt();
            clearNodeSelection();
          }
        }}
        className={`h-full w-full bg-stone-50 dark:bg-gray-900 ${lassoMode ? 'cursor-crosshair' : ''}`}
      >
        <Background
          gap={20}
          size={1}
          color={theme === 'dark' ? '#374151' : '#e7e5e4'}
        />
      </ReactFlow>
      </div>
      {topicId && (
        <CanvasSidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((value) => !value)}
          topicId={topicId}
          nodes={businessNodes}
          edges={businessEdges}
          experiences={businessExperiences}
        />
      )}
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-600 dark:bg-gray-800"
          style={{ left: contextMenu.clientX, top: contextMenu.clientY }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {contextMenu.kind === 'pane' && (
            <>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-700"
                onClick={() => {
                  createNodeAt('component', { x: contextMenu.flowX, y: contextMenu.flowY });
                  closeContextMenu();
                }}
              >
                {t('menu.newComponent')}
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-700"
                onClick={() => {
                  createNodeAt('goal', { x: contextMenu.flowX, y: contextMenu.flowY });
                  closeContextMenu();
                }}
              >
                {t('menu.newGoal')}
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-700"
                onClick={() => void handlePaste()}
              >
                {t('menu.paste')}
              </button>
            </>
          )}
          {contextMenu.kind === 'node' && contextMenu.targetId && (
            <>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-700"
                onClick={() => attachModifier(contextMenu.targetId!, 'node', 'text')}
              >
                {t('menu.addTextModifier')}
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-700"
                onClick={() => attachModifier(contextMenu.targetId!, 'node', 'image')}
              >
                {t('menu.addImageModifier')}
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-700"
                onClick={() => attachModifier(contextMenu.targetId!, 'node', 'syntax')}
              >
                {t('menu.addSyntaxModifier')}
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-700"
                onClick={() => attachModifier(contextMenu.targetId!, 'node', 'scope')}
              >
                {t('menu.addScopeModifier')}
              </button>
            </>
          )}
          {contextMenu.kind === 'experience' && contextMenu.targetId && (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
              onClick={() => {
                dispatch({
                  type: CommandType.DELETE_EXPERIENCE,
                  payload: { id: contextMenu.targetId },
                });
                closeContextMenu();
              }}
            >
              {t('menu.deleteExperience')}
            </button>
          )}
          {contextMenu.kind === 'edge' && contextMenu.targetId && (
            <>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-700"
                onClick={() => attachModifier(contextMenu.targetId!, 'edge', 'text')}
              >
                {t('menu.addTextModifier')}
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-700"
                onClick={() => attachModifier(contextMenu.targetId!, 'edge', 'image')}
              >
                {t('menu.addImageModifier')}
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-700"
                onClick={() => attachModifier(contextMenu.targetId!, 'edge', 'syntax')}
              >
                {t('menu.addSyntaxModifier')}
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-700"
                onClick={() => attachModifier(contextMenu.targetId!, 'edge', 'scope')}
              >
                {t('menu.addScopeModifier')}
              </button>
            </>
          )}
        </div>
      )}

      {!lassoMode && (
        <button
          type="button"
          onClick={() =>
            setEdgeType((current) => (current === 'flat' ? 'directed_thought' : 'flat'))
          }
          className={`fixed right-4 top-4 z-50 ${HEADER_BTN}`}
        >
          {t('canvas.edgeLabel').replace(
            '{type}',
            edgeType === 'flat' ? t('canvas.edgeFlat') : t('canvas.edgeThought'),
          )}
        </button>
      )}

      {lassoMode && (
        <div className="fixed left-20 top-4 z-50 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-900 dark:border-orange-700 dark:bg-orange-950/60 dark:text-orange-200">
          {t('canvas.lassoMode')}
        </div>
      )}

      {experiencePrompt && (
        <div
          className="fixed z-50 flex w-56 flex-col gap-2 rounded-lg border border-orange-200 bg-white p-3 shadow-lg dark:border-orange-700 dark:bg-stone-800"
          style={{
            left: experiencePrompt.screenX,
            top: experiencePrompt.screenY,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <input
            type="text"
            value={experienceTitle}
            onChange={(e) => setExperienceTitle(e.target.value)}
            placeholder={t('canvas.experienceTitle')}
            className="w-full rounded border border-stone-200 px-2 py-1 text-sm text-stone-800 outline-none focus:border-orange-300 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
          />
          <textarea
            value={experienceContent}
            onChange={(e) => setExperienceContent(e.target.value)}
            placeholder={t('canvas.experienceContent')}
            rows={3}
            className="w-full resize-none rounded border border-stone-200 px-2 py-1 text-sm text-stone-800 outline-none focus:border-orange-300 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={createExperience}
              className="flex-1 rounded bg-orange-500 px-2.5 py-1 text-sm font-medium text-white hover:bg-orange-600"
            >
              {t('common.create')}
            </button>
            <button
              type="button"
              onClick={() => {
                closeExperiencePrompt();
                clearNodeSelection();
              }}
              className="flex-1 rounded border border-stone-200 px-2.5 py-1 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-700"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="canvas-toast fixed bottom-4 right-4 z-50 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700 shadow-md dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200">
          {toast}
        </div>
      )}
</>
  );
}

interface CanvasProps {
  topicId: string;
  onBack: () => void;
  onTopicImported: (topicId: string) => void;
}

export function Canvas({ topicId, onBack, onTopicImported }: CanvasProps) {
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    void loadTopic(topicId).catch(console.error);
  }, [topicId]);

  const handleDrop = useCallback(
    async (event: DragEvent) => {
      event.preventDefault();
      setDragOver(false);
      const file = extractDroppedTopicFile(event.dataTransfer);
      if (!file) return;
      try {
        const raw = await readTopicFile(file);
        const id = await importTopicCanvas(raw, titleFromFileName(file.name));
        onTopicImported(id);
      } catch (err) {
        console.error(err);
      }
    },
    [onTopicImported],
  );

  return (
    <div
      className={`h-screen w-screen bg-stone-50 dark:bg-gray-900 ${dragOver ? 'ring-4 ring-inset ring-orange-300' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (extractDroppedTopicFile(event.dataTransfer)) {
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => void handleDrop(event)}
    >
      <ReactFlowProvider>
        <CanvasFlow onBack={onBack} onTopicImported={onTopicImported} />
      </ReactFlowProvider>
    </div>
  );
}