import { z } from 'zod';

// --- Modifiers ---
export const ModifierSchema = z.object({
  id: z.string(),
  type: z.enum(['text', 'image', 'scope', 'syntax']),
  content: z.string().default(''),
  url: z.string().default(''),
  appliesToTopic: z.boolean().default(false),
});

// --- Nodes ---
export const BusinessNodeSchema = z.object({
  id: z.string(),
  type: z.enum(['component', 'goal']),
  label: z.string().default(''),
  content: z.string().default(''),
  modifiers: z.array(ModifierSchema).default([]),
  metadata: z.object({
    created_at: z.number().default(() => Date.now()),  // FIXED: use factory
    visual: z.object({
      x: z.number().default(0),
      y: z.number().default(0),
    }).default(() => ({ x: 0, y: 0 })),
    origin_topic_id: z.string().optional(),
    origin_node_id: z.string().optional(),
  }).default(() => ({ created_at: Date.now(), visual: { x: 0, y: 0 } })),
});

// --- Edges ---
export const BusinessEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  edge_type: z.enum(['flat', 'directed_thought']).default('flat'),
  modifiers: z.array(ModifierSchema).default([]),
  metadata: z.object({
    paradigm: z.string().default(''),
    connectedGoalId: z.string().default(''),
    // NOTE: curvature removed — this is a rendering concern handled by the Adapter
  }).default(() => ({ paradigm: '', connectedGoalId: '' })),
});

// --- Experiences (Lasso Groups) ---
export const ExperienceSchema = z.object({
  id: z.string(),
  title: z.string().default(''),
  content: z.string().default(''),
  targets: z.array(z.object({
    id: z.string(),
    type: z.enum(['node', 'edge']),
  })).default([]),
  resolved: z.boolean().default(false),
  metadata: z.object({
    created_at: z.number().default(() => Date.now()),  // FIXED: use factory
    visual: z.object({
      x: z.number().default(0),
      y: z.number().default(0),
      width: z.number().default(200),
      height: z.number().default(120),
    }).default(() => ({ x: 0, y: 0, width: 200, height: 120 })),
  }).default(() => ({
    created_at: Date.now(),
    visual: { x: 0, y: 0, width: 200, height: 120 },
  })),
});

// --- The Canvas (Snapshot) ---
export const TopicCanvasSchema = z.object({
  topic_id: z.string(),
  nodes: z.array(BusinessNodeSchema).default([]),
  edges: z.array(BusinessEdgeSchema).default([]),
  experiences: z.array(ExperienceSchema).default([]),
  // Auto-computed on save: top 3 node labels by degree centrality
  top_nodes: z.array(z.string()).max(3).default([]),
});

// --- Memos (standalone, outside topics) ---
export const MemoBindingSchema = z.object({
  key: z.number().int().min(1).max(9),
  label: z.string(),
  text: z.string(),
});

export const MemoSchema = z.object({
  id: z.string(),
  title: z.string().default(''),
  content: z.string().default(''),
  bindings: z.array(MemoBindingSchema).default([]),
  isEquipped: z.boolean().default(false),
  created_at: z.number().default(() => Date.now()),
  archived: z.boolean().default(false),
});

export type BusinessNode = z.infer<typeof BusinessNodeSchema>;
export type BusinessEdge = z.infer<typeof BusinessEdgeSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type Modifier = z.infer<typeof ModifierSchema>;
export type TopicCanvas = z.infer<typeof TopicCanvasSchema>;
export type Memo = z.infer<typeof MemoSchema>;