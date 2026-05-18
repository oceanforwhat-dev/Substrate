import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type Position,
} from '@xyflow/react';
import type { FlowEdgeData } from '../../adapters/reactFlowAdapter';
import { ModifierBadges } from '../modifiers/ModifierBadges';

type ThoughtFlowEdge = Edge<FlowEdgeData, 'thought'>;

/** Adapter curvature is a lateral offset factor, not RF's bezier curvature (ignored for typical handle layouts). */
function getThoughtEdgePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition: Position,
  targetPosition: Position,
  curvature: number,
): [path: string, labelX: number, labelY: number] {
  if (curvature === 0) {
    const [path, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      curvature: 0,
    });
    return [path, labelX, labelY];
  }

  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const lateral = curvature * length * 0.75;
  const ctrlX = (sourceX + targetX) / 2 + nx * lateral;
  const ctrlY = (sourceY + targetY) / 2 + ny * lateral;
  const path = `M${sourceX},${sourceY} Q${ctrlX},${ctrlY} ${targetX},${targetY}`;
  const labelX = 0.25 * sourceX + 0.5 * ctrlX + 0.25 * targetX;
  const labelY = 0.25 * sourceY + 0.5 * ctrlY + 0.25 * targetY;
  return [path, labelX, labelY];
}

const SELECTED_EDGE_STROKE = '#3b82f6';

function ThoughtEdgeComponent({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
  selected,
}: EdgeProps<ThoughtFlowEdge>) {
  if (!data) {
    return null;
  }

  const curvature = data.curvature ?? 0;
  const [edgePath, labelX, labelY] = getThoughtEdgePath(
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature,
  );

  const paradigm = data.metadata.paradigm?.trim() ?? '';
  const edgeLabel =
    data.modifiers.find((m) => m.type === 'text' && m.content.trim().length > 0)?.content.trim() ??
    '';

  const showMarker = data.edge_type === 'directed_thought';
  const edgeStyle = selected
    ? { ...style, stroke: SELECTED_EDGE_STROKE, strokeWidth: 3 }
    : style;

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={showMarker ? markerEnd : undefined}
        style={edgeStyle}
        interactionWidth={24}
      />
      <EdgeLabelRenderer>
        <div
          className="pointer-events-none flex flex-col items-center gap-1"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {paradigm && (
            <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
              Paradigm
            </span>
          )}
          {edgeLabel && (
            <span className="rounded bg-white/90 px-1.5 py-0.5 text-xs text-stone-700 shadow-sm">
              {edgeLabel}
            </span>
          )}
          <ModifierBadges modifiers={data.modifiers} className="relative right-auto top-auto" />
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const ThoughtEdge = memo(ThoughtEdgeComponent);
