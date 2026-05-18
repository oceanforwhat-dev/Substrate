import { memo, useCallback, useMemo, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/I18nContext';
import { computeTopNodeLabels } from '../lib/snapshot';
import { findRelatedTopics, type RelatedTopicMatch } from '../lib/relatedTopics';
import type { BusinessEdge, BusinessNode, Experience } from '../schema';

type SidebarTab = 'outline' | 'related';

interface CanvasSidebarProps {
  open: boolean;
  onToggle: () => void;
  topicId: string;
  nodes: BusinessNode[];
  edges: BusinessEdge[];
  experiences: Experience[];
}

interface OutlineRow {
  id: string;
  label: string;
  modifierCount: number;
  edgeCount: number;
}

function countEdgesForNode(nodeId: string, edges: BusinessEdge[]): number {
  return edges.filter((edge) => edge.source === nodeId || edge.target === nodeId).length;
}

export const CanvasSidebar = memo(function CanvasSidebar({
  open,
  onToggle,
  topicId,
  nodes,
  edges,
  experiences,
}: CanvasSidebarProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { fitView } = useReactFlow();
  const [tab, setTab] = useState<SidebarTab>('outline');
  const [related, setRelated] = useState<RelatedTopicMatch[]>([]);
  const [findingRelated, setFindingRelated] = useState(false);

  const components = useMemo<OutlineRow[]>(
    () =>
      nodes
        .filter((node) => node.type === 'component')
        .map((node) => ({
          id: node.id,
          label: node.label.trim() || t('node.componentDefault'),
          modifierCount: node.modifiers.length,
          edgeCount: countEdgesForNode(node.id, edges),
        })),
    [edges, nodes, t],
  );

  const goals = useMemo<OutlineRow[]>(
    () =>
      nodes
        .filter((node) => node.type === 'goal')
        .map((node) => ({
          id: node.id,
          label: node.label.trim() || t('node.goalDefault'),
          modifierCount: node.modifiers.length,
          edgeCount: countEdgesForNode(node.id, edges),
        })),
    [edges, nodes, t],
  );

  const experienceRows = useMemo<OutlineRow[]>(
    () =>
      experiences.map((experience) => ({
        id: experience.id,
        label: experience.title.trim() || t('node.experienceDefault'),
        modifierCount: 0,
        edgeCount: experience.targets.length,
      })),
    [experiences, t],
  );

  const anchorLabels = useMemo(
    () => computeTopNodeLabels(nodes, edges),
    [edges, nodes],
  );

  const focusNode = useCallback(
    (nodeId: string) => {
      void fitView({ nodes: [{ id: nodeId }], padding: 0.4, duration: 280 });
    },
    [fitView],
  );

  const handleFindRelated = useCallback(async () => {
    setFindingRelated(true);
    try {
      const matches = await findRelatedTopics(topicId, anchorLabels);
      setRelated(matches);
      setTab('related');
    } catch (err) {
      console.error(err);
    } finally {
      setFindingRelated(false);
    }
  }, [anchorLabels, topicId]);

  const openTopic = useCallback(
    (targetTopicId: string, newTab: boolean) => {
      const path = `/topic/${targetTopicId}`;
      if (newTab) {
        window.open(path, '_blank', 'noopener,noreferrer');
        return;
      }
      navigate(path);
    },
    [navigate],
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="fixed right-0 top-1/2 z-40 -translate-y-1/2 rounded-l-lg border border-r-0 border-stone-200 bg-white px-2 py-3 text-xs font-medium text-stone-600 shadow-sm hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300"
        aria-label={t('canvas.sidebar.open')}
      >
        ‹
      </button>
    );
  }

  return (
    <aside className="pointer-events-auto flex w-72 shrink-0 flex-col border-l border-stone-200 bg-white shadow-lg dark:border-stone-700 dark:bg-stone-900">
      <div className="flex items-center justify-between border-b border-stone-200 px-3 py-2 dark:border-stone-700">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setTab('outline')}
            className={`rounded px-2 py-1 text-xs font-medium ${
              tab === 'outline'
                ? 'bg-stone-200 text-stone-900 dark:bg-stone-700 dark:text-stone-100'
                : 'text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800'
            }`}
          >
            {t('canvas.sidebar.outline')}
          </button>
          <button
            type="button"
            onClick={() => setTab('related')}
            className={`rounded px-2 py-1 text-xs font-medium ${
              tab === 'related'
                ? 'bg-stone-200 text-stone-900 dark:bg-stone-700 dark:text-stone-100'
                : 'text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800'
            }`}
          >
            {t('canvas.sidebar.related')}
          </button>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="rounded px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
          aria-label={t('canvas.sidebar.close')}
        >
          ›
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {tab === 'outline' ? (
          <OutlinePanel
            components={components}
            goals={goals}
            experiences={experienceRows}
            onSelect={focusNode}
            t={t}
          />
        ) : (
          <RelatedPanel
            related={related}
            finding={findingRelated}
            onFind={handleFindRelated}
            onOpen={openTopic}
            t={t}
          />
        )}
      </div>
    </aside>
  );
});

const OutlinePanel = memo(function OutlinePanel({
  components,
  goals,
  experiences,
  onSelect,
  t,
}: {
  components: OutlineRow[];
  goals: OutlineRow[];
  experiences: OutlineRow[];
  onSelect: (id: string) => void;
  t: (key: string) => string;
}) {
  return (
  <div className="space-y-4">
      <OutlineGroup title={t('canvas.sidebar.components')} rows={components} onSelect={onSelect} />
      <OutlineGroup title={t('canvas.sidebar.goals')} rows={goals} onSelect={onSelect} />
      <OutlineGroup title={t('canvas.sidebar.experiences')} rows={experiences} onSelect={onSelect} />
    </div>
  );
});

const OutlineGroup = memo(function OutlineGroup({
  title,
  rows,
  onSelect,
}: {
  title: string;
  rows: OutlineRow[];
  onSelect: (id: string) => void;
}) {
  if (rows.length === 0) return null;

  return (
    <section>
      <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500">
        {title}
      </h3>
      <ul className="space-y-0.5">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onSelect(row.id)}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              <span className="min-w-0 truncate">{row.label}</span>
              <span className="shrink-0 text-[10px] text-stone-400 dark:text-stone-500">
                M{row.modifierCount} · E{row.edgeCount}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
});

const RelatedPanel = memo(function RelatedPanel({
  related,
  finding,
  onFind,
  onOpen,
  t,
}: {
  related: RelatedTopicMatch[];
  finding: boolean;
  onFind: () => void;
  onOpen: (topicId: string, newTab: boolean) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void onFind()}
        disabled={finding}
        className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
      >
        {finding ? t('canvas.sidebar.finding') : t('canvas.sidebar.findRelated')}
      </button>
      {related.length === 0 ? (
        <p className="text-xs text-stone-500 dark:text-stone-400">{t('canvas.sidebar.noRelated')}</p>
      ) : (
        <ul className="space-y-2">
          {related.map((match) => (
            <li
              key={match.topicId}
              className="rounded-lg border border-stone-200 px-2 py-2 dark:border-stone-700"
            >
              <p className="truncate text-xs font-medium text-stone-800 dark:text-stone-100">
                {match.title}
              </p>
              <p className="mt-0.5 text-[10px] text-stone-500 dark:text-stone-400">
                {match.matchingLabels.join(', ')}
              </p>
              <div className="mt-2 flex gap-1">
                <button
                  type="button"
                  onClick={() => onOpen(match.topicId, false)}
                  className="rounded border border-stone-200 px-2 py-0.5 text-[10px] hover:bg-stone-50 dark:border-stone-600 dark:hover:bg-stone-800"
                >
                  {t('canvas.sidebar.openTopic')}
                </button>
                <button
                  type="button"
                  onClick={() => onOpen(match.topicId, true)}
                  className="rounded border border-stone-200 px-2 py-0.5 text-[10px] hover:bg-stone-50 dark:border-stone-600 dark:hover:bg-stone-800"
                >
                  {t('canvas.sidebar.openNewTab')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
