import { memo } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeContext';

function ThemeToggleComponent() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? t('theme.switchToLight') : t('theme.switchToDark')}
      aria-label={isDark ? t('theme.switchToLight') : t('theme.switchToDark')}
      className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm shadow-sm hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:hover:bg-stone-700"
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}

export const ThemeToggle = memo(ThemeToggleComponent);
