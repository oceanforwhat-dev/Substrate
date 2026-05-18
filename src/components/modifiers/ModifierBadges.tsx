import { memo } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import type { Modifier } from '../../schema';

const TYPE_COLORS: Record<Modifier['type'], string> = {
  text: 'bg-sky-500',
  image: 'bg-emerald-500',
  scope: 'bg-violet-500',
  syntax: 'bg-stone-500',
};

interface ModifierBadgesProps {
  modifiers: Modifier[];
  className?: string;
}

function ModifierBadgesComponent({ modifiers, className = '' }: ModifierBadgesProps) {
  const { t } = useI18n();

  if (modifiers.length === 0) {
    return null;
  }

  const tooltipFor = (modifier: Modifier): string => {
    if (modifier.type === 'image') {
      return modifier.url.trim() || t('modifier.image');
    }
    return modifier.content.trim() || t(`modifier.type.${modifier.type}`);
  };

  return (
    <div
      className={`pointer-events-auto absolute -right-1 -top-1 flex flex-wrap gap-0.5 ${className}`}
    >
      {modifiers.map((modifier) => (
        <span
          key={modifier.id}
          title={tooltipFor(modifier)}
          className={`flex h-4 w-4 cursor-default items-center justify-center rounded-full text-[9px] font-bold text-white shadow-sm ring-1 ring-black/10 ${TYPE_COLORS[modifier.type]}`}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {modifier.type === 'image' ? (
            <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 fill-current" aria-hidden>
              <path d="M2 3h12v10H2V3zm2 2 2.5 3 1.5-2 2 3 1-1.5H4V5zm0 6h8v-2H4v2z" />
            </svg>
          ) : (
            modifier.type.charAt(0).toUpperCase()
          )}
        </span>
      ))}
    </div>
  );
}

export const ModifierBadges = memo(ModifierBadgesComponent);
