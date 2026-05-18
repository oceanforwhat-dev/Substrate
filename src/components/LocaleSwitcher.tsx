import { memo, useCallback } from 'react';
import { useI18n } from '../i18n/I18nContext';

function LocaleSwitcherComponent() {
  const { locale, setLocale, t } = useI18n();

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setLocale(event.target.value);
    },
    [setLocale],
  );

  return (
    <select
      value={locale}
      onChange={onChange}
      aria-label={t('header.locale')}
      className="min-w-[5.5rem] shrink-0 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-center text-xs font-medium text-stone-700 shadow-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
    >
      <option value="zh-CN">{t('locale.zhCN')}</option>
      <option value="en-US">{t('locale.enUS')}</option>
      {locale !== 'zh-CN' && locale !== 'en-US' ? (
        <option value={locale}>{locale}</option>
      ) : null}
    </select>
  );
}

export const LocaleSwitcher = memo(LocaleSwitcherComponent);
