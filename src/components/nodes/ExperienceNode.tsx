import { memo } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { useI18n } from '../../i18n/I18nContext';
import type { Experience } from '../../schema';

type ExperienceFlowNode = Node<Experience, 'experienceNode'>;

function ExperienceNodeComponent({ data }: NodeProps<ExperienceFlowNode>) {
  const { t } = useI18n();
  const width = data.metadata.visual.width ?? 200;
  const height = data.metadata.visual.height ?? 120;
  const title = data.title?.trim() || t('node.experienceDefault');

  return (
    <div
      className="pointer-events-none relative rounded-lg border border-orange-300/50 dark:border-orange-600/60"
      style={{
        width,
        height,
        background: 'rgba(255, 165, 0, 0.15)',
      }}
    >
      <span className="absolute left-2 top-2 text-[10px] font-medium text-orange-900/90 dark:text-orange-200">
        {title}
      </span>
    </div>
  );
}

export const ExperienceNode = memo(ExperienceNodeComponent);
