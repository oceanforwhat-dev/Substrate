import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { useI18n } from '../../i18n/I18nContext';
import { isNodeReference } from '../../lib/nodeReference';
import type { BusinessNode } from '../../schema';
import { ModifierBadges } from '../modifiers/ModifierBadges';
import { ReferenceBadge } from '../ReferenceBadge';
import { SELECTED_NODE_CLASSES } from './nodeSelectionStyles';

type ComponentFlowNode = Node<BusinessNode, 'componentNode'>;

function ComponentNodeComponent({ data, selected }: NodeProps<ComponentFlowNode>) {
  const { t } = useI18n();
  const label = data.label?.trim() || t('node.componentDefault');
  const reference = isNodeReference(data);

  const shellClass = selected
    ? SELECTED_NODE_CLASSES
    : reference
      ? 'border-2 border-dashed border-sky-400 dark:border-sky-500'
      : 'border-2 border-sky-300 dark:border-sky-600';

  return (
    <div className="relative">
      <div
        className={`min-w-[140px] rounded-md bg-white px-3 py-2 shadow-sm dark:bg-slate-800 ${shellClass}`}
      >
        <Handle
          type="target"
          position={Position.Top}
          className="!h-2 !w-2 !border-sky-400 !bg-sky-200 dark:!border-sky-500 dark:!bg-sky-900"
        />
        <p className="text-sm font-medium text-slate-800 dark:text-stone-100">{label}</p>
        <Handle
          type="source"
          position={Position.Bottom}
          className="!h-2 !w-2 !border-sky-400 !bg-sky-200 dark:!border-sky-500 dark:!bg-sky-900"
        />
      </div>
      {reference && <ReferenceBadge />}
      <ModifierBadges modifiers={data.modifiers} />
    </div>
  );
}

export const ComponentNode = memo(ComponentNodeComponent);
