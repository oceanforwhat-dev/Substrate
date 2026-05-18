import { TopicCanvasSchema, type TopicCanvas } from '../schema';

export function parseTopicCanvas(raw: unknown): TopicCanvas {
  return TopicCanvasSchema.parse(raw);
}
