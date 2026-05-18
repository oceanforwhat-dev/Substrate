import type { TopicCanvas } from '../schema';

const INVALID_FILE_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

export function sanitizeFileName(title: string): string {
  const cleaned = title
    .trim()
    .replace(INVALID_FILE_NAME_CHARS, '')
    .replace(/\s+/g, ' ')
    .slice(0, 200);
  return cleaned.length > 0 ? cleaned : 'untitled';
}

export function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.(substrate|json)$/i, '').trim();
  return base.length > 0 ? base : 'Imported Topic';
}

export function isTopicFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.substrate') || name.endsWith('.json');
}

export function downloadTopicCanvas(canvas: TopicCanvas, topicTitle: string): void {
  const json = JSON.stringify(canvas, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${sanitizeFileName(topicTitle)}.substrate`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function readTopicFile(file: File): Promise<unknown> {
  const text = await file.text();
  return JSON.parse(text) as unknown;
}

function pickWithHiddenInput(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0] ?? null;
        input.remove();
        resolve(file);
      },
      { once: true },
    );
    document.body.appendChild(input);
    input.click();
  });
}

export async function pickTopicFile(): Promise<File | null> {
  const picker = (
    window as Window & {
      showOpenFilePicker?: (options?: {
        multiple?: boolean;
        types?: Array<{
          description?: string;
          accept: Record<string, string[]>;
        }>;
      }) => Promise<FileSystemFileHandle[]>;
    }
  ).showOpenFilePicker;

  if (picker) {
    try {
      const handles = await picker({
        multiple: false,
        types: [
          {
            description: 'Substrate topic',
            accept: {
              'application/json': ['.substrate', '.json'],
            },
          },
        ],
      });
      const handle = handles[0];
      if (!handle) return null;
      return await handle.getFile();
    } catch {
      return null;
    }
  }

  return pickWithHiddenInput('.substrate,.json,application/json');
}

export function extractDroppedTopicFile(dataTransfer: DataTransfer): File | null {
  const files = Array.from(dataTransfer.files);
  return files.find(isTopicFile) ?? null;
}
