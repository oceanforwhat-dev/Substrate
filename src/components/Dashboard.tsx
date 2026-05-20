import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type MouseEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/I18nContext';
import {
  buildTopicSearchIndex,
  filterTopicsByTags,
  matchesTopicSearch,
  type TopicSearchIndexEntry,
} from '../lib/topicSearch';
import {
  createBlankTopic,
  deleteTopic,
  exportTopicFromDb,
  listTopicSummaries,
  renameTopic,
  updateTopicTags,
  type TopicSummary,
} from '../lib/topics';
import { TagsEditorDialog } from './TagsEditorDialog';
import { extractDroppedTopicFile, pickTopicFile, readTopicFile, titleFromFileName } from '../lib/topicFile';
import type { Memo } from '../schema';
import { notifyMemoUnequipped, syncEquippedMemoFromMemos } from '../lib/memoTauri';
import { importTopicCanvas, useCanvasSelector, useCanvasStore } from '../store';
import { ConfirmDialog } from './ConfirmDialog';
import { ImportLanguagePackButton } from './ImportLanguagePackButton';
import { LocaleSwitcher } from './LocaleSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { MemoEditor } from './MemoEditor';
import {
  DeleteConfirmPopover,
  TrashIcon,
  deleteConfirmAnchorFromEvent,
  deleteMemoById,
  type DeleteConfirmAnchor,
} from './MemoSharedUi';
import { TopicCard } from './TopicCard';
import { TopicNameDialog } from './TopicNameDialog';

type MemoEditorSession = {
  memoId: string | null;
  initialTitle: string;
  initialContent: string;
  initialBindings: Memo['bindings'];
};

const BTN =
  'rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700';

const PRIMARY_BTN =
  'rounded-lg bg-stone-800 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-stone-900 disabled:opacity-50 dark:bg-stone-600 dark:hover:bg-stone-500';

function memoTypeLabel(memo: Memo, t: (key: string) => string): string {
  return memo.bindings.length > 0
    ? t('dashboard.memo.typeBindable')
    : t('dashboard.memo.typeEmpty');
}

function EquipIcon({ equipped }: { equipped: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill={equipped ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={equipped ? 0 : 1.5}
      className={`size-4 ${equipped ? 'text-amber-500 dark:text-amber-400' : 'text-stone-400 dark:text-stone-500'}`}
      aria-hidden
    >
      <path d="M10 2l2.09 4.24 4.68.68-3.39 3.3.8 4.66L10 12.9l-4.18 2.2.8-4.66-3.39-3.3 4.68-.68L10 2z" />
    </svg>
  );
}

interface MemoRowProps {
  memo: Memo;
  orderBadge?: number;
  draggable?: boolean;
  isDragging?: boolean;
  isDragOver?: boolean;
  equipLabel: string;
  deleteLabel: string;
  typeLabel: string;
  untitledLabel: string;
  onEquipToggle: (memo: Memo) => void;
  onEdit: (memo: Memo) => void;
  onDelete: (event: MouseEvent<HTMLButtonElement>, memo: Memo) => void;
  onDragStart?: (event: DragEvent<HTMLLIElement>, memoId: string) => void;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent<HTMLLIElement>, memoId: string) => void;
  onDragLeave?: () => void;
  onDrop?: (event: DragEvent<HTMLLIElement>, memoId: string) => void;
}

const MemoRow = memo(function MemoRow({
  memo,
  orderBadge,
  draggable = false,
  isDragging = false,
  isDragOver = false,
  equipLabel,
  deleteLabel,
  typeLabel,
  untitledLabel,
  onEquipToggle,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: MemoRowProps) {
  return (
    <li
      draggable={draggable}
      onDragStart={onDragStart ? (e) => onDragStart(e, memo.id) : undefined}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver ? (e) => onDragOver(e, memo.id) : undefined}
      onDragLeave={onDragLeave}
      onDrop={onDrop ? (e) => onDrop(e, memo.id) : undefined}
      className={`flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-stone-50 dark:hover:bg-stone-700/50 ${isDragging ? 'opacity-40' : ''} ${isDragOver ? 'ring-2 ring-amber-400/60 ring-inset' : ''}`}
    >
      <button
        type="button"
        aria-label={equipLabel}
        onClick={(e) => {
          e.stopPropagation();
          onEquipToggle(memo);
        }}
        className="shrink-0 rounded p-1 hover:bg-stone-100 dark:hover:bg-stone-700"
      >
        <EquipIcon equipped={memo.equipped} />
      </button>
      {orderBadge != null && (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-stone-200 text-[10px] font-semibold text-stone-700 dark:bg-stone-600 dark:text-stone-200">
          {orderBadge}
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit(memo);
        }}
        className="min-w-0 flex-1 truncate rounded-md text-left text-sm font-medium text-stone-900 outline-none focus-visible:ring-2 focus-visible:ring-stone-400 dark:text-stone-100"
      >
        {memo.title.trim() || untitledLabel}
      </button>
      <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-600 dark:bg-stone-700 dark:text-stone-300">
        {typeLabel}
      </span>
      <button
        type="button"
        aria-label={deleteLabel}
        onClick={(e) => onDelete(e, memo)}
        className="shrink-0 rounded p-1 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
      >
        <TrashIcon />
      </button>
    </li>
  );
});

interface MemoListPanelProps {
  onNewMemo: () => void;
  onEditMemo: (memo: Memo) => void;
  onMemoDeleted?: (memoId: string) => void;
}

const MemoListPanel = memo(function MemoListPanel({
  onNewMemo,
  onEditMemo,
  onMemoDeleted,
}: MemoListPanelProps) {
  const { t } = useI18n();
  const memos = useCanvasSelector((s) => s.memos);
  const equippedMemos = useCanvasSelector((s) => s.equippedMemos);
  const dispatch = useCanvasSelector((s) => s.dispatch);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    memo: Memo;
    anchor: DeleteConfirmAnchor;
  } | null>(null);
  const [dragMemoId, setDragMemoId] = useState<string | null>(null);
  const [dragOverMemoId, setDragOverMemoId] = useState<string | null>(null);

  const syncTauri = useCallback(() => {
    const { memos: nextMemos, currentFocusedMemoId: focusedId } = useCanvasStore.getState();
    void syncEquippedMemoFromMemos(nextMemos, focusedId);
  }, []);

  const handleEquipToggle = useCallback(
    (memo: Memo) => {
      if (memo.equipped) {
        dispatch({ type: 'MEMO_UNEQUIPPED', payload: { memoId: memo.id } });
      } else {
        dispatch({ type: 'MEMO_EQUIPPED', payload: { memoId: memo.id } });
      }
      syncTauri();
    },
    [dispatch, syncTauri],
  );

  const handleUnequipAll = useCallback(() => {
    for (const memo of equippedMemos) {
      dispatch({ type: 'MEMO_UNEQUIPPED', payload: { memoId: memo.id } });
    }
    void notifyMemoUnequipped();
  }, [dispatch, equippedMemos]);

  const handleReorderDrop = useCallback(
    (event: DragEvent<HTMLLIElement>, targetMemoId: string) => {
      event.preventDefault();
      event.stopPropagation();
      if (!dragMemoId || dragMemoId === targetMemoId) return;
      const orderedIds = equippedMemos.map((m) => m.id);
      const fromIdx = orderedIds.indexOf(dragMemoId);
      const toIdx = orderedIds.indexOf(targetMemoId);
      if (fromIdx === -1 || toIdx === -1) return;
      const next = [...orderedIds];
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, dragMemoId);
      dispatch({ type: 'MEMO_REORDER', payload: { orderedIds: next } });
      setDragMemoId(null);
      setDragOverMemoId(null);
    },
    [dispatch, dragMemoId, equippedMemos],
  );

  const handleDragStart = useCallback((event: DragEvent<HTMLLIElement>, memoId: string) => {
    setDragMemoId(memoId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', memoId);
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLLIElement>, memoId: string) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverMemoId(memoId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragMemoId(null);
    setDragOverMemoId(null);
  }, []);

  const unequippedMemos = useMemo(() => memos.filter((m) => !m.equipped), [memos]);

  const openDeleteConfirm = useCallback((event: MouseEvent<HTMLButtonElement>, memo: Memo) => {
    event.stopPropagation();
    setDeleteConfirm({ memo, anchor: deleteConfirmAnchorFromEvent(event) });
  }, []);

  const confirmDeleteMemo = useCallback(() => {
    if (!deleteConfirm) return;
    const { id } = deleteConfirm.memo;
    deleteMemoById(dispatch, deleteConfirm.memo);
    onMemoDeleted?.(id);
    setDeleteConfirm(null);
    syncTauri();
  }, [deleteConfirm, dispatch, onMemoDeleted, syncTauri]);

  const sharedRowProps = {
    onEquipToggle: handleEquipToggle,
    onEdit: onEditMemo,
    onDelete: openDeleteConfirm,
    deleteLabel: t('dashboard.memo.deleteMemo'),
    untitledLabel: t('common.untitled'),
  };

  return (
    <aside className="flex w-1/4 min-w-0 flex-col border-r border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-800">
      <div className="shrink-0 border-b border-stone-200 px-4 py-4 dark:border-stone-700">
        <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
          {t('dashboard.memo.title')}
        </h2>
        <button type="button" onClick={onNewMemo} className={`${PRIMARY_BTN} mt-3 w-full`}>
          {t('dashboard.memo.new')}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {memos.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-stone-500 dark:text-stone-400">
            {t('dashboard.memo.empty')}
          </p>
        ) : (
          <div className="space-y-4">
            <section className="rounded-lg border border-stone-200 bg-stone-50/50 p-2 dark:border-stone-600 dark:bg-stone-900/40">
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                  {t('dashboard.memo.equippedGroup')}
                </h3>
                {equippedMemos.length > 0 && (
                  <button
                    type="button"
                    onClick={handleUnequipAll}
                    className="text-[11px] font-medium text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline dark:text-stone-400 dark:hover:text-stone-200"
                  >
                    {t('dashboard.memo.unequipAll')}
                  </button>
                )}
              </div>
              {equippedMemos.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-stone-400 dark:text-stone-500">
                  —
                </p>
              ) : (
                <ul className="space-y-1">
                  {equippedMemos.map((memo) => (
                    <MemoRow
                      key={memo.id}
                      memo={memo}
                      orderBadge={memo.equippedOrder}
                      draggable
                      isDragging={dragMemoId === memo.id}
                      isDragOver={dragOverMemoId === memo.id && dragMemoId !== memo.id}
                      equipLabel={
                        memo.equipped
                          ? t('dashboard.memo.unequipMemo')
                          : t('dashboard.memo.equipMemo')
                      }
                      typeLabel={memoTypeLabel(memo, t)}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDragOver={handleDragOver}
                      onDragLeave={() => setDragOverMemoId(null)}
                      onDrop={handleReorderDrop}
                      {...sharedRowProps}
                    />
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                {t('dashboard.memo.allMemos')}
              </h3>
              {unequippedMemos.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-stone-400 dark:text-stone-500">
                  —
                </p>
              ) : (
                <ul className="space-y-1">
                  {unequippedMemos.map((memo) => (
                    <MemoRow
                      key={memo.id}
                      memo={memo}
                      equipLabel={t('dashboard.memo.equipMemo')}
                      typeLabel={memoTypeLabel(memo, t)}
                      {...sharedRowProps}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
      {deleteConfirm && (
        <DeleteConfirmPopover
          anchor={deleteConfirm.anchor}
          onConfirm={confirmDeleteMemo}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </aside>
  );
});

export const Dashboard = memo(function Dashboard() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [topics, setTopics] = useState<TopicSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TopicSummary | null>(null);
  const [tagsEditorTopic, setTagsEditorTopic] = useState<TopicSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState<TopicSearchIndexEntry[]>([]);
  const [indexing, setIndexing] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<'and' | 'or'>('or');
  const [newTopicDialogOpen, setNewTopicDialogOpen] = useState(false);
  const [memoEditor, setMemoEditor] = useState<MemoEditorSession | null>(null);
  const dispatch = useCanvasSelector((s) => s.dispatch);

  const refreshTopics = useCallback(async () => {
    setLoading(true);
    try {
      const summaries = await listTopicSummaries();
      setTopics(summaries);
      setError(null);
      setIndexing(true);
      const index = await buildTopicSearchIndex();
      setSearchIndex(index);
    } catch (err) {
      console.error(err);
      setError(t('dashboard.errorLoad'));
    } finally {
      setLoading(false);
      setIndexing(false);
    }
  }, [t]);

  useEffect(() => {
    void refreshTopics();
  }, [refreshTopics]);

  useEffect(() => {
    void useCanvasStore
      .getState()
      .loadMemos()
      .then(() => {
        const { memos: loaded, currentFocusedMemoId } = useCanvasStore.getState();
        return syncEquippedMemoFromMemos(loaded, currentFocusedMemoId);
      })
      .catch(console.error);
  }, []);

  const openTopic = useCallback(
    (topicId: string) => {
      navigate(`/topic/${topicId}`);
    },
    [navigate],
  );

  const handleNewTopicConfirm = useCallback(
    async (title: string) => {
      setNewTopicDialogOpen(false);
      try {
        const trimmed = title.trim() || t('common.untitled');
        const topicId = await createBlankTopic(trimmed);
        openTopic(topicId);
      } catch (err) {
        console.error(err);
        setError(t('dashboard.errorLoad'));
      }
    },
    [openTopic, t],
  );

  const runImport = useCallback(
    async (file: File) => {
      setImporting(true);
      setError(null);
      try {
        const raw = await readTopicFile(file);
        const topicId = await importTopicCanvas(raw, titleFromFileName(file.name));
        await refreshTopics();
        openTopic(topicId);
      } catch (err) {
        console.error(err);
        setError(t('dashboard.errorImport'));
      } finally {
        setImporting(false);
      }
    },
    [openTopic, refreshTopics, t],
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

  const handleRename = useCallback(
    async (topicId: string, title: string) => {
      try {
        await renameTopic(topicId, title);
        await refreshTopics();
      } catch (err) {
        console.error(err);
        setError(t('dashboard.errorLoad'));
      }
    },
    [refreshTopics, t],
  );

  const handleExport = useCallback(
    async (topicId: string) => {
      try {
        await exportTopicFromDb(topicId);
        setToast(t('toast.exported'));
        window.setTimeout(() => setToast(null), 2800);
      } catch (err) {
        console.error(err);
        setToast(t('toast.exportFailed'));
        window.setTimeout(() => setToast(null), 2800);
      }
    },
    [t],
  );

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const topic of topics) {
      for (const tag of topic.tags) {
        tagSet.add(tag);
      }
    }
    return [...tagSet].sort((a, b) => a.localeCompare(b));
  }, [topics]);

  const filteredTopics = useMemo(() => {
    let ids = topics.map((topic) => topic.id);
    const q = searchQuery.trim();
    if (q.length > 0) {
      const matching = new Set(
        searchIndex.filter((entry) => matchesTopicSearch(entry, q)).map((entry) => entry.topicId),
      );
      ids = ids.filter((id) => matching.has(id));
    }
    const tagsByTopicId = new Map(topics.map((topic) => [topic.id, topic.tags]));
    ids = filterTopicsByTags(ids, tagsByTopicId, selectedTags, tagMode);
    const idSet = new Set(ids);
    return topics.filter((topic) => idSet.has(topic.id));
  }, [searchIndex, searchQuery, selectedTags, tagMode, topics]);

  const toggleTagFilter = useCallback((tag: string) => {
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
    );
  }, []);

  const handleSaveTags = useCallback(
    async (tags: string[]) => {
      if (!tagsEditorTopic) return;
      try {
        await updateTopicTags(tagsEditorTopic.id, tags);
        setTagsEditorTopic(null);
        await refreshTopics();
      } catch (err) {
        console.error(err);
        setError(t('dashboard.errorLoad'));
      }
    },
    [refreshTopics, tagsEditorTopic, t],
  );

  const openNewMemoEditor = useCallback(() => {
    setMemoEditor({
      memoId: null,
      initialTitle: '',
      initialContent: '',
      initialBindings: [],
    });
  }, []);

  const openMemoEditor = useCallback((memo: Memo) => {
    setMemoEditor({
      memoId: memo.id,
      initialTitle: memo.title,
      initialContent: memo.content,
      initialBindings: memo.bindings,
    });
  }, []);

  const closeMemoEditor = useCallback(() => {
    setMemoEditor(null);
  }, []);

  const handleDeleteMemoFromEditor = useCallback(() => {
    if (!memoEditor?.memoId) return;
    const memo = useCanvasStore.getState().memos.find((m) => m.id === memoEditor.memoId);
    if (memo) {
      deleteMemoById(dispatch, memo);
    }
    setMemoEditor(null);
  }, [dispatch, memoEditor]);

  const handleSaveMemo = useCallback(
    (title: string, content: string, bindings: Memo['bindings']) => {
      if (memoEditor?.memoId) {
        dispatch({
          type: 'MEMO_UPDATED',
          payload: { id: memoEditor.memoId, changes: { title, content, bindings } },
        });
      } else {
        dispatch({
          type: 'MEMO_CREATED',
          payload: { memo: { title, content, bindings } },
        });
      }
      setMemoEditor(null);
    },
    [dispatch, memoEditor],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteTopic(deleteTarget.id);
      setDeleteTarget(null);
      await refreshTopics();
    } catch (err) {
      console.error(err);
      setError(t('dashboard.errorLoad'));
    }
  }, [deleteTarget, refreshTopics, t]);

  return (
    <div
      className={`flex min-h-screen flex-col bg-stone-50 dark:bg-gray-900 ${dragOver ? 'ring-4 ring-inset ring-orange-300' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (extractDroppedTopicFile(event.dataTransfer)) {
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => void handleDrop(event)}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-white px-6 py-4 dark:border-stone-700 dark:bg-stone-800">
        <div>
          <h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            {t('app.title')}
          </h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {loading
              ? t('dashboard.loading')
              : t('dashboard.topicCount').replace('{count}', String(topics.length))}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setNewTopicDialogOpen(true)} className={PRIMARY_BTN}>
            {t('dashboard.newTopic')}
          </button>
          <button
            type="button"
            onClick={() => void handleImportClick()}
            disabled={importing}
            className={BTN}
          >
            {importing ? t('common.importing') : t('header.import')}
          </button>
          <LocaleSwitcher />
          <ThemeToggle />
          <ImportLanguagePackButton
            onSuccess={() => {
              setToast(t('toast.languageImported'));
              window.setTimeout(() => setToast(null), 2800);
            }}
            onError={() => {
              setToast(t('toast.languageInvalid'));
              window.setTimeout(() => setToast(null), 2800);
            }}
          />
        </div>
      </header>

      <main className="flex min-h-0 flex-1">
        <MemoListPanel
          onNewMemo={openNewMemoEditor}
          onEditMemo={openMemoEditor}
          onMemoDeleted={(memoId) => {
            if (memoEditor?.memoId === memoId) setMemoEditor(null);
          }}
        />
        <section className="flex w-3/4 min-w-0 flex-col overflow-y-auto px-6 py-8">
        <div className="mb-6 space-y-3">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('dashboard.searchPlaceholder')}
            className="w-full max-w-xl rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none focus:border-stone-500 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
          />
          {indexing && (
            <p className="text-xs text-stone-500 dark:text-stone-400">{t('dashboard.indexing')}</p>
          )}
          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
                {t('dashboard.tagsFilter')}
              </span>
              <button
                type="button"
                onClick={() => setTagMode((mode) => (mode === 'and' ? 'or' : 'and'))}
                className={BTN}
              >
                {tagMode === 'and' ? t('dashboard.tagModeAnd') : t('dashboard.tagModeOr')}
              </button>
              {allTags.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTagFilter(tag)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      active
                        ? 'bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-700 dark:text-stone-300'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
              {selectedTags.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedTags([])}
                  className="text-xs text-stone-500 underline hover:text-stone-700 dark:text-stone-400"
                >
                  {t('dashboard.clearTags')}
                </button>
              )}
            </div>
          )}
        </div>

        {dragOver && (
          <div className="mb-4 rounded-lg border-2 border-dashed border-orange-300 bg-orange-50 px-4 py-3 text-center text-sm text-orange-900 dark:border-orange-600 dark:bg-orange-950/40 dark:text-orange-200">
            {t('dashboard.dropImport')}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-stone-500 dark:text-stone-400">{t('dashboard.loading')}</p>
        ) : filteredTopics.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center dark:border-stone-600 dark:bg-stone-800">
            <p className="text-sm text-stone-600 dark:text-stone-300">
              {topics.length === 0 ? t('dashboard.noTopics') : t('dashboard.noMatches')}
            </p>
            {topics.length === 0 && (
              <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                {t('dashboard.noTopicsHint')}
              </p>
            )}
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredTopics.map((topic) => (
              <TopicCard
                key={topic.id}
                topic={topic}
                onOpen={openTopic}
                onRename={handleRename}
                onExport={handleExport}
                onEditTags={(topicId) => {
                  const target = topics.find((item) => item.id === topicId);
                  if (target) setTagsEditorTopic(target);
                }}
                onDelete={(topicId) => {
                  const target = topics.find((item) => item.id === topicId);
                  if (target) setDeleteTarget(target);
                }}
              />
            ))}
          </ul>
        )}
        </section>
      </main>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700 shadow-md dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200">
          {toast}
        </div>
      )}

      {tagsEditorTopic && (
        <TagsEditorDialog
          topicTitle={tagsEditorTopic.title}
          initialTags={tagsEditorTopic.tags}
          onSave={(tags) => void handleSaveTags(tags)}
          onCancel={() => setTagsEditorTopic(null)}
        />
      )}

      {memoEditor && (
        <MemoEditor
          key={memoEditor.memoId ?? 'new'}
          memoId={memoEditor.memoId}
          initialTitle={memoEditor.initialTitle}
          initialContent={memoEditor.initialContent}
          initialBindings={memoEditor.initialBindings}
          onSave={handleSaveMemo}
          onCancel={closeMemoEditor}
          onDelete={memoEditor.memoId ? handleDeleteMemoFromEditor : undefined}
        />
      )}

      {newTopicDialogOpen && (
        <TopicNameDialog
          onConfirm={(title) => void handleNewTopicConfirm(title)}
          onCancel={() => setNewTopicDialogOpen(false)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={t('dashboard.deleteTitle')}
          message={`${t('dashboard.deleteMessage')} (${deleteTarget.title})`}
          confirmLabel={t('dashboard.menu.delete')}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
});
