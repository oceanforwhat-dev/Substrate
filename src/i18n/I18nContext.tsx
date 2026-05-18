import {
  createContext,
  memo,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import enUS from './en-US.json';
import zhCN from './zh-CN.json';

const LOCALE_STORAGE_KEY = 'substrate-locale';
const BUILTIN_LOCALES = ['zh-CN', 'en-US'] as const;

export type BuiltinLocale = (typeof BUILTIN_LOCALES)[number];

type MessageMap = Record<string, string>;

interface I18nContextValue {
  locale: string;
  setLocale: (locale: string) => void;
  t: (key: string) => string;
  importLanguagePack: (json: object) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function detectInitialLocale(): string {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored) return stored;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

function cloneBuiltinPacks(): Record<string, MessageMap> {
  return {
    'en-US': { ...(enUS as MessageMap) },
    'zh-CN': { ...(zhCN as MessageMap) },
  };
}

export function isFlatLanguagePack(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.entries(value).every(
    ([key, entry]) =>
      typeof key === 'string' &&
      typeof entry === 'string' &&
      (key !== '_locale' || entry.trim().length > 0),
  );
}

function resolvePackLocale(json: Record<string, string>): {
  locale: string;
  messages: Record<string, string>;
} {
  const localeTag = json._locale;
  if (typeof localeTag === 'string' && localeTag.trim().length > 0) {
    const { _locale: _removed, ...messages } = json;
    void _removed;
    return { locale: localeTag.trim(), messages };
  }
  return { locale: '', messages: json };
}

interface I18nProviderProps {
  children: ReactNode;
}

function I18nProviderComponent({ children }: I18nProviderProps) {
  const [locale, setLocaleState] = useState(detectInitialLocale);
  const [packs, setPacks] = useState<Record<string, MessageMap>>(cloneBuiltinPacks);

  const setLocale = useCallback((next: string) => {
    setLocaleState(next);
    localStorage.setItem(LOCALE_STORAGE_KEY, next);
  }, []);

  const importLanguagePack = useCallback(
    (json: object) => {
      if (!isFlatLanguagePack(json)) {
        throw new Error('Language pack must be a flat key-value object');
      }
      const { locale: packLocale, messages } = resolvePackLocale(json);
      const targetLocale = packLocale || locale;
      setPacks((prev) => ({
        ...prev,
        [targetLocale]: { ...(prev[targetLocale] ?? {}), ...messages },
      }));
      if (packLocale) {
        setLocale(packLocale);
      }
    },
    [locale, setLocale],
  );

  const t = useCallback(
    (key: string) => {
      const current = packs[locale]?.[key];
      if (current != null) return current;
      const fallback = packs['en-US']?.[key];
      if (fallback != null) return fallback;
      return key;
    },
    [locale, packs],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t, importLanguagePack }),
    [locale, setLocale, t, importLanguagePack],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const I18nProvider = memo(I18nProviderComponent);

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}
