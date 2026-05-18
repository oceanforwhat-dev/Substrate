export interface NodeClipboardPayload {
  nodeId: string;
  topicId: string;
  label: string;
  type: 'component' | 'goal';
}

let clipboard: NodeClipboardPayload | null = null;

export function setNodeClipboard(payload: NodeClipboardPayload): void {
  clipboard = payload;
}

export function getNodeClipboard(): NodeClipboardPayload | null {
  return clipboard;
}
