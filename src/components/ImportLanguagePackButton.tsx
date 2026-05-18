import { memo, useCallback, useRef } from 'react';
import { isFlatLanguagePack, useI18n } from '../i18n/I18nContext';

interface ImportLanguagePackButtonProps {
  onSuccess?: () => void;
  onError?: () => void;
}

function ImportLanguagePackButtonComponent({
  onSuccess,
  onError,
}: ImportLanguagePackButtonProps) {
  const { importLanguagePack, t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);

  const ingestFile = useCallback(
    async (file: File) => {
      try {
        const raw: unknown = JSON.parse(await file.text());
        if (!isFlatLanguagePack(raw)) {
          throw new Error('Invalid language pack');
        }
        importLanguagePack(raw);
        onSuccess?.();
      } catch {
        onError?.();
      }
    },
    [importLanguagePack, onError, onSuccess],
  );

  const openPicker = useCallback(async () => {
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
              description: 'JSON',
              accept: { 'application/json': ['.json'] },
            },
          ],
        });
        const file = await handles[0]?.getFile();
        if (file) {
          await ingestFile(file);
        }
        return;
      } catch {
        return;
      }
    }

    inputRef.current?.click();
  }, [ingestFile]);

  const onFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) {
        void ingestFile(file);
      }
    },
    [ingestFile],
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={onFileChange}
      />
      <button
        type="button"
        onClick={() => void openPicker()}
        className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 shadow-sm hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
      >
        {t('header.importLanguage')}
      </button>
    </>
  );
}

export const ImportLanguagePackButton = memo(ImportLanguagePackButtonComponent);
