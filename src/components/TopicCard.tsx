import { memo, useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { TopicSummary } from '../lib/topics';

const CARD_BTN =
  'w-full rounded-xl border border-stone-200 bg-white text-left shadow-sm transition hover:border-stone-300 hover:shadow dark:border-stone-600 dark:bg-stone-800 dark:hover:border-stone-500';

interface TopicCardProps {
  topic: TopicSummary;
  onOpen: (topicId: string) => void;
  onRename: (topicId: string, title: string) => void;
  onExport: (topicId: string) => void;
  onDelete: (topicId: string) => void;
  onEditTags: (topicId: string) => void;
}

const TopicThumbnail = memo(function TopicThumbnail() {
  return (
    <div
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-400 dark:bg-stone-700 dark:text-stone-500"
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    </div>
  );
});

export const TopicCard = memo(function TopicCard({
  topic,
  onOpen,
  onRename,
  onExport,
  onDelete,
  onEditTags,
}: TopicCardProps) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(topic.title);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraftTitle(topic.title);
  }, [topic.title]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commitRename = useCallback(() => {
    const next = draftTitle.trim() || t('common.untitled');
    setEditing(false);
    if (next !== topic.title) {
      onRename(topic.id, next);
    } else {
      setDraftTitle(topic.title);
    }
  }, [draftTitle, onRename, t, topic.id, topic.title]);

  const handleContextMenu = useCallback((event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY });
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  const formattedDate = new Date(topic.updated_at).toLocaleString();
  const anchors = topic.top_nodes.slice(0, 3);

  return (
    <>
      <li>
        <button
          type="button"
          className={CARD_BTN}
          onClick={() => onOpen(topic.id)}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setEditing(true);
          }}
          onContextMenu={handleContextMenu}
        >
          <div className="flex gap-4 px-4 py-4">
            <TopicThumbnail />
            <div className="min-w-0 flex-1">
              {editing ? (
                <input
                  ref={inputRef}
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitRename();
                    }
                    if (e.key === 'Escape') {
                      setDraftTitle(topic.title);
                      setEditing(false);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded border border-stone-300 bg-white px-2 py-0.5 text-sm font-medium text-stone-900 outline-none focus:border-stone-500 dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                />
              ) : (
                <span className="block truncate font-medium text-stone-900 dark:text-stone-100">
                  {topic.title}
                </span>
              )}
              {topic.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {topic.tags.map((tag) => (
                    <span
                      key={`${topic.id}-tag-${tag}`}
                      className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600 dark:bg-stone-700 dark:text-stone-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {anchors.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {anchors.map((label, index) => (
                    <li
                      key={`${topic.id}-anchor-${index}`}
                      className="truncate text-xs text-stone-500 dark:text-stone-400"
                    >
                      {label}
                    </li>
                  ))}
                </ul>
              )}
              <span className="mt-2 block text-xs text-stone-400 dark:text-stone-500">
                {formattedDate}
              </span>
            </div>
          </div>
        </button>
      </li>

      {menu && (
        <TopicCardContextMenu
          x={menu.x}
          y={menu.y}
          onRename={() => {
            setMenu(null);
            setEditing(true);
          }}
          onExport={() => {
            setMenu(null);
            onExport(topic.id);
          }}
          onEditTags={() => {
            setMenu(null);
            onEditTags(topic.id);
          }}
          onDelete={() => {
            setMenu(null);
            onDelete(topic.id);
          }}
        />
      )}
    </>
  );
});

interface TopicCardContextMenuProps {
  x: number;
  y: number;
  onRename: () => void;
  onExport: () => void;
  onEditTags: () => void;
  onDelete: () => void;
}

const TopicCardContextMenu = memo(function TopicCardContextMenu({
  x,
  y,
  onRename,
  onExport,
  onEditTags,
  onDelete,
}: TopicCardContextMenuProps) {
  const { t } = useI18n();

  return (
    <div
      role="menu"
      className="fixed z-[90] min-w-[10rem] rounded-lg border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-600 dark:bg-stone-800"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <ContextMenuItem label={t('dashboard.menu.rename')} onClick={onRename} />
      <ContextMenuItem label={t('dashboard.menu.editTags')} onClick={onEditTags} />
      <ContextMenuItem label={t('dashboard.menu.export')} onClick={onExport} />
      <ContextMenuItem label={t('dashboard.menu.delete')} onClick={onDelete} destructive />
    </div>
  );
});

const ContextMenuItem = memo(function ContextMenuItem({
  label,
  onClick,
  destructive = false,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`block w-full px-3 py-1.5 text-left text-sm ${
        destructive
          ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40'
          : 'text-stone-700 hover:bg-stone-50 dark:text-stone-200 dark:hover:bg-stone-700'
      }`}
    >
      {label}
    </button>
  );
});
