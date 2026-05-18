export const CommandType = {
  CREATE_NODE: 'CREATE_NODE',
  UPDATE_NODE: 'UPDATE_NODE',
  MOVE_NODE: 'MOVE_NODE',
  DELETE_NODE: 'DELETE_NODE',
  ADD_EDGE: 'ADD_EDGE',
  REMOVE_EDGE: 'REMOVE_EDGE',
  ATTACH_MODIFIER: 'ATTACH_MODIFIER',
  MODIFIER_UPDATED: 'MODIFIER_UPDATED',
  MODIFIER_REMOVED: 'MODIFIER_REMOVED',
  CREATE_EXPERIENCE: 'CREATE_EXPERIENCE',
  DELETE_EXPERIENCE: 'DELETE_EXPERIENCE',
} as const;

export type CommandTypeName = (typeof CommandType)[keyof typeof CommandType];

export type ModifierTargetType = 'node' | 'edge';

export interface Command {
  type: CommandTypeName | string;
  payload?: Record<string, unknown>;
  meta?: { eventLocalId?: number };
}
