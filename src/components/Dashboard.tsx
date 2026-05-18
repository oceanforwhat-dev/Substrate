import { memo, useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
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
import { importTopicCanvas } from '../store';
import { ConfirmDialog } from './ConfirmDialog';
import { ImportLanguagePackButton } from './ImportLanguagePackButton';
import { LocaleSwitcher } from './LocaleSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { TopicCard } from './TopicCard';

const BTN =
  'rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700';

const PRIMARY_BTN =
  'rounded-lg bg-stone-800 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-stone-900 disabled:opacity-50 dark:bg-stone-600 dark:hover:bg-stone-500';

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

  const openTopic = useCallback(
    (topicId: string) => {
      navigate(`/topic/${topicId}`);
    },
    [navigate],
  );

  const handleNewTopic = useCallback(async () => {
    try {
      const topicId = await createBlankTopic();
      openTopic(topicId);
    } catch (err) {
      console.error(err);
      setError(t('dashboard.errorLoad'));
    }
  }, [openTopic, t]);

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
          <p className="text-sm text-stone-500 dark:text-stone-400">{t('app.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void handleNewTopic()} className={PRIMARY_BTN}>
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

      <main className="flex-1 px-6 py-8">
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
