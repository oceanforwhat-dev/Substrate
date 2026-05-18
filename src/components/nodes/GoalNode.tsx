import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { useI18n } from '../../i18n/I18nContext';
import { isNodeReference } from '../../lib/nodeReference';
import type { BusinessNode } from '../../schema';
import { ModifierBadges } from '../modifiers/ModifierBadges';
import { ReferenceBadge } from '../ReferenceBadge';
import { SELECTED_NODE_CLASSES } from './nodeSelectionStyles';

type GoalFlowNode = Node<BusinessNode, 'goalNode'>;

function GoalNodeComponent({ data, selected }: NodeProps<GoalFlowNode>) {
  const { t } = useI18n();
  const label = data.label?.trim() || t('node.goalDefault');
  const reference = isNodeReference(data);

  const shellClass = selected
    ? SELECTED_NODE_CLASSES
    : reference
      ? 'border-2 border-dashed border-amber-400 bg-amber-50/60 dark:border-amber-500 dark:bg-amber-950/30'
      : 'border-2 border-amber-300 bg-amber-50/80 dark:border-amber-600 dark:bg-amber-950/50';

  return (
    <div className="relative">
      <div
        className={`min-w-[150px] rounded-xl px-3 py-2 shadow-sm ${shellClass}`}
      >
        <Handle
          type="target"
          position={Position.Top}
          className="!h-2 !w-2 !border-amber-400 !bg-amber-200 dark:!border-amber-500 dark:!bg-amber-800"
        />
        <span className="mb-1 inline-block rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-800 dark:text-amber-100">
          {t('node.goalBadge')}
        </span>
        <p className="text-sm font-medium text-slate-800 dark:text-stone-100">{label}</p>
        <Handle
          type="source"
          position={Position.Bottom}
          className="!h-2 !w-2 !border-amber-400 !bg-amber-200 dark:!border-amber-500 dark:!bg-amber-800"
        />
      </div>
      {reference && <ReferenceBadge />}
      <ModifierBadges modifiers={data.modifiers} />
    </div>
  );
}

export const GoalNode = memo(GoalNodeComponent);
