export const MENU_ICONS = [
  { id: 'copy', label: 'Копировать' },
  { id: 'paste', label: 'Вставить' },
  { id: 'pin', label: 'Закрепить' },
  { id: 'undo', label: 'Отменить' },
  { id: 'scissors', label: 'Вырезать' },
  { id: 'camera', label: 'Скриншот' },
  { id: 'chart', label: 'Диспетчер задач' },
  { id: 'volume-off', label: 'Без звука' },
  { id: 'volume', label: 'Звук' },
  { id: 'media-previous', label: 'Предыдущий трек' },
  { id: 'media-play', label: 'Плей / пауза' },
  { id: 'media-next', label: 'Следующий трек' },
  { id: 'media-volume-down', label: 'Громкость ниже' },
  { id: 'media-volume-up', label: 'Громкость выше' },
  { id: 'loop', label: 'Повтор' },
  { id: 'file', label: 'Текстовый файл' },
  { id: 'globe', label: 'Интернет' },
  { id: 'folder', label: 'Папка' },
  { id: 'search', label: 'Поиск' },
  { id: 'lock', label: 'Замок' },
  { id: 'lightbulb', label: 'Идея' },
  { id: 'settings', label: 'Настройки' },
  { id: 'star', label: 'Избранное' },
  { id: 'rocket', label: 'Запуск' },
  { id: 'gamepad', label: 'Игра' },
  { id: 'music', label: 'Музыка' },
  { id: 'phone', label: 'Телефон' },
  { id: 'mail', label: 'Почта' },
  { id: 'calculator', label: 'Калькулятор' },
  { id: 'sparkles', label: 'Другое' },
] as const;

export type MenuIcon = (typeof MENU_ICONS)[number]['id'];

const ICON_IDS = new Set<string>(MENU_ICONS.map(({ id }) => id));
const LEGACY_ICONS: Record<string, MenuIcon> = {
  '📋': 'copy',
  '📌': 'paste',
  '↩': 'undo',
  '✂': 'scissors',
  '📸': 'camera',
  '📊': 'chart',
  '🔇': 'volume-off',
  '🔊': 'volume',
  '⏯': 'media-play',
  '⏭': 'media-next',
  '📝': 'file',
  '🌐': 'globe',
  '📁': 'folder',
  '🔍': 'search',
  '🔒': 'lock',
  '💡': 'lightbulb',
  '⚙': 'settings',
  '⭐': 'star',
  '🚀': 'rocket',
  '🎮': 'gamepad',
  '🎵': 'music',
  '📞': 'phone',
  '✉': 'mail',
  '🧮': 'calculator',
};

export function normalizeMenuIcon(value: unknown): MenuIcon {
  const icon = String(value ?? '').replace(/\uFE0F/g, '');
  if (ICON_IDS.has(icon)) return icon as MenuIcon;
  return LEGACY_ICONS[icon] ?? 'sparkles';
}
