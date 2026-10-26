import type { Appearance, AppStatus, ClickButton, MediaAction, MenuItem, Profile, Settings, Step } from '../../shared/types';
import { MENU_ICONS } from '../../shared/icons';
import { translate, translateActionLabel, translateRuntimeError, type Language } from '../../shared/i18n';
import { renderIcon } from '../icons';
import { RING_PAD, readableOn, renderRing, setActive } from '../ring';

type Page = 'menu' | 'general' | 'look' | 'about';
type Kid = Node | string | false | null | undefined;

const api = window.api;
let S: Settings;
let status: AppStatus;
let page: Page = 'menu';
let profileId = '';
let itemId: string | null = null;
let addingApp = false;
let drawPreview: (() => void) | null = null;
let renderList: () => void = () => {};
let saveTimer = 0;
const redraw = () => drawPreview?.();
const root = document.getElementById('app') as HTMLElement;
const t = (text: string) => translate(text, S?.language ?? 'ru');

// ── утилиты ──
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, any> = {},
  ...kids: Kid[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag) as any;
  let value: unknown;
  for (const [k, v] of Object.entries(props)) {
    if (k === 'value') value = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (['title', 'aria-label', 'placeholder'].includes(k) && typeof v === 'string') el.setAttribute(k, t(v));
    else if (v === false || v == null) continue;
    else if (typeof v === 'boolean') el[k] = v;
    else el.setAttribute(k, String(v));
  }
  for (const c of kids) if (c) el.append(typeof c === 'string' ? t(c) : c);
  if (value !== undefined) el.value = value;
  return el;
}

const uid = () => crypto.randomUUID();
const isDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
const accent = () => (S.appearance.accent === 'system' ? status.accent : S.appearance.accent);
const profile = (): Profile => S.profiles.find((p) => p.id === profileId) ?? S.profiles[0];
const swap = <T,>(a: T[], i: number, j: number) => {
  if (j >= 0 && j < a.length) [a[i], a[j]] = [a[j], a[i]];
};

function toast(msg: string): void {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2800);
}

function save(): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => api.saveSettings(S), 200);
  drawPreview?.();
}

// ── элементы управления ──
function sw(checked: boolean, on: (v: boolean) => void, disabled = false): HTMLElement {
  const i: HTMLInputElement = h('input', { type: 'checkbox', checked, disabled, onchange: () => on(i.checked) });
  return h('label', { class: 'switch' }, i, h('span'));
}

function seg<T extends string>(opts: [T, string][], cur: T, on: (v: T) => void): HTMLElement {
  return h(
    'div',
    { class: 'seg' },
    ...opts.map(([v, t]) => h('button', { class: v === cur ? 'on' : '', onclick: () => on(v) }, t)),
  );
}

function slider(min: number, max: number, step: number, val: number, fmt: (v: number) => string, on: (v: number) => void): HTMLElement {
  const out = h('span', { class: 'sv-out' }, fmt(val));
  const r: HTMLInputElement = h('input', {
    type: 'range', min: String(min), max: String(max), step: String(step), value: val,
    oninput: () => { out.textContent = fmt(r.valueAsNumber); on(r.valueAsNumber); },
  });
  return h('div', { class: 'slider' }, r, out);
}

function row(title: string, desc: string, ...control: Kid[]): HTMLElement {
  return h('div', { class: 'row' }, h('div', { class: 'rt' }, h('div', {}, title), desc && h('div', { class: 'd' }, desc)), h('div', { class: 'rc' }, ...control));
}

function ringView(items: () => MenuItem[], sel: () => number | null, onPick?: (i: number) => void): HTMLElement {
  const ring = h('div');
  const box = h('div', { class: 'ring-wrap' }, ring);
  drawPreview = () => {
    const a = S.appearance;
    const list = items();
    if (list.length < 2) {
      box.style.width = box.style.height = 'auto';
      box.replaceChildren(h('div', { class: 'hint' }, 'Добавьте минимум два пункта, чтобы увидеть меню'));
      return;
    }
    const size = 2 * (a.radius + RING_PAD);
    const scale = Math.min(1, 320 / size);
    box.style.width = box.style.height = `${size * scale}px`;
    ring.style.transform = `scale(${scale})`;
    ring.style.transformOrigin = '0 0';
    if (!box.contains(ring)) box.replaceChildren(ring);
    renderRing(ring, list.map((i) => ({ label: translateActionLabel(i.label, S.language), icon: i.icon, looping: !!i.loop })), { radius: a.radius, innerRadius: a.innerRadius, opacity: a.opacity, dark: isDark(), accent: accent(), language: S.language }, onPick);
    setActive(ring, sel());
  };
  return box;
}

// ── запись сочетания клавиш ──
const TRIGGER_LABELS: Record<string, string> = {
  MouseLeft: 'Левая кнопка мыши',
  MouseRight: 'Правая кнопка мыши',
  MouseMiddle: 'Средняя кнопка мыши',
  MouseBack: 'Кнопка мыши «Назад»',
  MouseForward: 'Кнопка мыши «Вперёд»',
};

const triggerLabel = (name: string) => TRIGGER_LABELS[name] ?? name;

const CODE_TOKENS: Record<string, string> = {
  Enter: 'enter', Tab: 'tab', Space: 'space', Backspace: 'backspace', Delete: 'delete', Insert: 'insert',
  Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown', ArrowLeft: 'left', ArrowUp: 'up',
  ArrowRight: 'right', ArrowDown: 'down', PrintScreen: 'printscreen', Pause: 'pause', Minus: '-', Equal: '=',
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Backquote: '`', AudioVolumeMute: 'mute', AudioVolumeDown: 'volumedown', AudioVolumeUp: 'volumeup',
  MediaPlayPause: 'playpause', MediaTrackNext: 'nexttrack', MediaTrackPrevious: 'prevtrack',
};

function tokenOf(e: KeyboardEvent): string | null {
  const c = e.code;
  if (/^Key[A-Z]$/.test(c)) return c.slice(3).toLowerCase();
  if (/^Digit\d$/.test(c)) return c.slice(5);
  if (/^F\d{1,2}$/.test(c)) return c.toLowerCase();
  return CODE_TOKENS[c] ?? null;
}

function recordCombo(inp: HTMLInputElement, st: { value: string }): void {
  const old = inp.value;
  inp.value = '';
  inp.placeholder = t('Нажмите сочетание… (Esc — отмена)');
  const onKey = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
    window.removeEventListener('keydown', onKey, true);
    inp.placeholder = 'ctrl+shift+t';
    const tok = e.code === 'Escape' ? null : tokenOf(e);
    if (!tok) { inp.value = old; return; }
    const mods = [e.ctrlKey && 'ctrl', e.shiftKey && 'shift', e.altKey && 'alt', e.metaKey && 'win'].filter(Boolean);
    inp.value = [...mods, tok].join('+');
    st.value = inp.value;
    save();
  };
  window.addEventListener('keydown', onKey, true);
}

// ── шаги ──
const STEP_TYPES: [Step['type'], string][] = [
  ['keys', 'Горячая клавиша'], ['text', 'Ввод текста'], ['run', 'Запуск / открыть'],
  ['media', 'Мультимедиа'], ['delay', 'Пауза'], ['click', 'Клик мыши'], ['scroll', 'Прокрутка'],
];
const MEDIA_ACTIONS: [MediaAction, string][] = [
  ['previous', 'Предыдущий трек'],
  ['playPause', 'Плей / пауза'],
  ['next', 'Следующий трек'],
  ['volumeDown', 'Громкость ниже'],
  ['volumeUp', 'Громкость выше'],
  ['mute', 'Отключить громкость'],
];
const CLICKS: [ClickButton, string][] = [
  ['left', 'Левая'], ['right', 'Правая'], ['middle', 'Средняя'], ['back', 'Назад (X1)'], ['forward', 'Вперёд (X2)'],
];

function newStep(type: Step['type']): Step {
  switch (type) {
    case 'delay': return { type, ms: 100 };
    case 'click': return { type, button: 'left', count: 1 };
    case 'scroll': return { type, notches: -3 };
    case 'media': return { type, action: 'mute' };
    default: return { type, value: '' };
  }
}

function numInput(val: number, on: (v: number) => void, min = 0, step = 1): HTMLInputElement {
  const n: HTMLInputElement = h('input', {
    class: 'ctl num', type: 'number', min: String(min), step: String(step), value: val,
    oninput: () => on(Number(n.value) || 0),
  });
  return n;
}

function stepRow(it: MenuItem, st: Step, i: number, again: () => void): HTMLElement {
  const type: HTMLSelectElement = h(
    'select',
    { class: 'ctl', value: st.type, onchange: () => { it.steps[i] = newStep(type.value as Step['type']); save(); again(); } },
    ...STEP_TYPES.map(([v, t]) => h('option', { value: v }, t)),
  );
  let body: Kid[] = [];
  switch (st.type) {
    case 'keys': {
      const s = st;
      const inp: HTMLInputElement = h('input', { class: 'ctl', value: s.value, placeholder: 'ctrl+shift+t', spellcheck: 'false', oninput: () => { s.value = inp.value; save(); } });
      body = [inp, h('button', { class: 'btn', onclick: () => recordCombo(inp, s) }, 'Запись')];
      break;
    }
    case 'text': {
      const s = st;
      const inp: HTMLInputElement = h('input', { class: 'ctl', value: s.value, placeholder: 'Текст, который нужно напечатать', oninput: () => { s.value = inp.value; save(); } });
      body = [inp];
      break;
    }
    case 'run': {
      const s = st;
      const inp: HTMLInputElement = h('input', { class: 'ctl', value: s.value, placeholder: 'notepad.exe, путь к файлу или https://…', spellcheck: 'false', oninput: () => { s.value = inp.value; save(); } });
      body = [inp, h('button', { class: 'btn', onclick: async () => { const p = await api.pickFile(); if (p) { inp.value = s.value = p; save(); } } }, 'Обзор…')];
      break;
    }
    case 'delay': {
      const s = st;
      body = [numInput(s.ms, (v) => { s.ms = v; save(); }, 0, 10), 'мс'];
      break;
    }
    case 'click': {
      const s = st;
      const btn: HTMLSelectElement = h('select', { class: 'ctl', value: s.button, onchange: () => { s.button = btn.value as ClickButton; save(); } }, ...CLICKS.map(([v, t]) => h('option', { value: v }, t)));
      body = [btn, numInput(s.count, (v) => { s.count = Math.max(1, Math.round(v)); save(); }, 1), 'раз'];
      break;
    }
    case 'scroll': {
      const s = st;
      body = [numInput(s.notches, (v) => { s.notches = Math.round(v); save(); }, -50), 'щелчков (плюс — вверх, минус — вниз)'];
      break;
    }
    case 'media': {
      const s = st;
      const action: HTMLSelectElement = h(
        'select',
        { class: 'ctl', value: s.action, onchange: () => { s.action = action.value as MediaAction; save(); } },
        ...MEDIA_ACTIONS.map(([value, label]) => h('option', { value }, label)),
      );
      body = [action];
      break;
    }
  }
  const mv = (d: number) => () => { swap(it.steps, i, i + d); save(); again(); };
  return h('div', { class: 'step' }, type, h('div', { class: 'sv' }, ...body),
    h('button', { class: 'ib', title: 'Выше', disabled: i === 0, onclick: mv(-1) }, '\uE70E'),
    h('button', { class: 'ib', title: 'Ниже', disabled: i === it.steps.length - 1, onclick: mv(1) }, '\uE70D'),
    h('button', { class: 'ib', title: 'Удалить шаг', onclick: () => { it.steps.splice(i, 1); save(); again(); } }, '\uE74D'));
}

function editor(it: MenuItem): HTMLElement {
  const stepsBox = h('div', { class: 'steps' });
  const drawSteps = () =>
    stepsBox.replaceChildren(
      ...it.steps.map((st, i) => stepRow(it, st, i, drawSteps)),
      h('button', { class: 'btn', onclick: () => { it.steps.push(newStep('keys')); save(); drawSteps(); } }, '+ Добавить шаг'),
    );
  drawSteps();

  const name: HTMLInputElement = h('input', { class: 'ctl', value: translateActionLabel(it.label, S.language), placeholder: 'Название', oninput: () => { it.label = name.value; save(); renderList(); } });
  const iconButtons: HTMLButtonElement[] = [];
  const chips = h('div', { class: 'chips icon-picker' }, ...MENU_ICONS.map(({ id, label }) => {
    const button: HTMLButtonElement = h('button', {
      class: it.icon === id ? 'on' : '',
      title: label,
      'aria-label': label,
      onclick: () => {
        it.icon = id;
        save();
        renderList();
        for (const iconButton of iconButtons) iconButton.classList.toggle('on', iconButton === button);
      },
    }, renderIcon(id));
    iconButtons.push(button);
    return button;
  }));
  const loopEnabled = sw(!!it.loop, (enabled) => {
    if (enabled) it.loop = { intervalMs: it.loop?.intervalMs ?? 1000 };
    else delete it.loop;
    save();
    render();
  });
  const loopInterval = it.loop
    ? h('div', { class: 'loop-interval' },
        h('label', {}, 'Интервал повтора'),
        numInput(it.loop.intervalMs, (value) => {
          if (!it.loop) return;
          it.loop.intervalMs = Math.min(60000, Math.max(10, Math.round(value / 10) * 10));
          save();
        }, 10, 10),
        h('span', {}, 'мс'))
    : null;

  return h('div', { class: 'card editor' },
    h('div', { class: 'field' }, h('label', {}, 'Название'), name),
    h('div', { class: 'field' }, h('label', {}, 'Значок Lucide'), chips),
    h('div', { class: 'loop-config' },
      h('div', {}, h('div', {}, 'Повторять действие'), h('div', { class: 'd' }, 'Выбор пункта запускает повтор, повторный выбор останавливает его')),
      loopEnabled),
    loopInterval,
    h('div', { class: 'field' }, h('label', {}, 'Действия — выполняются по порядку, несколько шагов = макрос'), stepsBox),
    h('div', { class: 'foot' },
      h('button', { class: 'btn', onclick: () => { api.testSteps(it.steps); toast('Выполнится через 3 секунды — переключитесь на нужное окно'); } }, 'Проверить через 3 с')));
}

// ── страницы ──
function pageMenu(): HTMLElement {
  const p = profile();
  const items = p.items;

  const bar = h('div', { class: 'bar' },
    h('select', { class: 'ctl', value: p.id, onchange: (e: Event) => { profileId = (e.target as HTMLSelectElement).value; itemId = null; addingApp = false; render(); } },
      ...S.profiles.map((pr) => h('option', { value: pr.id }, pr.exe ?? 'Все приложения (по умолчанию)'))),
    h('button', { class: 'btn', onclick: () => { addingApp = !addingApp; render(); } }, '+ Меню для приложения'),
    p.exe && h('button', { class: 'btn', onclick: () => {
      if (!confirm(t('Удалить меню для {app}?').replace('{app}', String(p.exe)))) return;
      S.profiles = S.profiles.filter((x) => x.id !== p.id);
      profileId = S.profiles[0].id; itemId = null; save(); render();
    } }, 'Удалить это меню'));

  const addBox = addingApp ? (() => {
    const exe: HTMLInputElement = h('input', { class: 'ctl', placeholder: 'chrome.exe', spellcheck: 'false' });
    const det: HTMLButtonElement = h('button', { class: 'btn', onclick: async () => {
      let n = 3;
      det.disabled = true;
      det.textContent = t('Переключитесь на нужное окно… {seconds}').replace('{seconds}', String(n));
      const tmr = setInterval(() => { n--; if (n > 0) det.textContent = t('Переключитесь на нужное окно… {seconds}').replace('{seconds}', String(n)); }, 1000);
      const name = await api.detectApp();
      clearInterval(tmr);
      det.disabled = false;
      det.textContent = t('Определить по окну');
      if (name) exe.value = name; else toast('Не удалось определить окно');
    } }, 'Определить по окну');
    return h('div', { class: 'bar' }, exe, det, h('button', { class: 'btn accent', onclick: () => {
      let v = exe.value.trim().toLowerCase();
      if (!v) return;
      if (!v.endsWith('.exe')) v += '.exe';
      let target = S.profiles.find((x) => x.exe === v);
      if (!target) {
        target = { id: uid(), exe: v, items: S.profiles[0].items.map((i) => ({ ...structuredClone(i), id: uid() })) };
        S.profiles.push(target);
      }
      profileId = target.id; itemId = null; addingApp = false; save(); render();
    } }, 'Добавить'));
  })() : null;

  const ring = ringView(() => profile().items, () => { const i = profile().items.findIndex((x) => x.id === itemId); return i < 0 ? null : i; },
    (i) => { itemId = profile().items[i].id; render(); });

  const list = h('div', { class: 'card list' });
  renderList = () => {
    const cur = profile().items;
    list.replaceChildren(
      ...cur.map((it, idx) => {
        const mv = (d: number) => (e: Event) => { e.stopPropagation(); swap(cur, idx, idx + d); save(); render(); };
        return h('div', { class: 'li' + (it.id === itemId ? ' on' : ''), onclick: () => { itemId = it.id; render(); } },
          h('span', { class: 'lic' }, renderIcon(it.icon)),
          h('span', { class: 'lit' }, translateActionLabel(it.label || 'Без названия', S.language)),
          h('button', { class: 'ib', title: 'Выше', disabled: idx === 0, onclick: mv(-1) }, '\uE70E'),
          h('button', { class: 'ib', title: 'Ниже', disabled: idx === cur.length - 1, onclick: mv(1) }, '\uE70D'),
          h('button', { class: 'ib', title: 'Удалить', onclick: (e: Event) => { e.stopPropagation(); cur.splice(idx, 1); if (itemId === it.id) itemId = null; save(); render(); } }, '\uE74D'));
      }),
      h('button', { class: 'btn add', disabled: cur.length >= 16, onclick: () => {
        const it: MenuItem = { id: uid(), label: 'Новый пункт', icon: 'star', steps: [{ type: 'keys', value: '' }] };
        cur.push(it); itemId = it.id; save(); render();
      } }, cur.length >= 16 ? 'Максимум 16 пунктов' : '+ Добавить пункт'),
    );
  };
  renderList();

  const it = items.find((x) => x.id === itemId);
  return h('div', {}, h('h1', {}, 'Меню'), bar, addBox,
    h('div', { class: 'cols' },
      h('div', {}, h('div', { class: 'card' }, ring), list),
      it ? editor(it) : h('div', { class: 'card hint' }, 'Выберите пункт слева или нажмите на сектор меню, чтобы настроить его действия.')));
}

function pageGeneral(): HTMLElement {
  const key = h('div', { class: 'keycap' }, triggerLabel(S.trigger));
  let capturing = false;
  const btn: HTMLButtonElement = h('button', { class: 'btn accent', onclick: async () => {
    if (capturing) return;
    capturing = true;
    btn.textContent = t('Нажмите клавишу или кнопку мыши… (Esc — отмена)');
    btn.disabled = true;
    key.textContent = '…';
    const name = await api.captureTrigger();
    if (name) { S.trigger = name; save(); }
    render();
  } }, 'Назначить клавишу');

  const problem = status.error || !status.hookOk
    ? h('div', { class: 'warn' }, t('Проблема: {error}. Подробности — в файле radial-menu.log (раздел «О программе»).').replace('{error}', status.error ? translateRuntimeError(status.error, S.language) : t('не удалось запустить перехват клавиш')))
    : null;

  const language: HTMLSelectElement = h('select', {
    class: 'ctl',
    value: S.language,
    onchange: () => {
      S.language = language.value as Language;
      save();
      render();
    },
  },
  h('option', { value: 'ru' }, 'Русский'),
  h('option', { value: 'uk' }, 'Українська'),
  h('option', { value: 'en' }, 'English'));

  return h('div', {}, h('h1', {}, 'Основные'), problem,
    h('div', { class: 'card' },
      row('Язык приложения', 'Язык выбирается автоматически при первом запуске.', language),
      row('Меню включено', 'Можно также приостановить из значка в трее', sw(S.enabled, (v) => { S.enabled = v; save(); })),
      row('Клавиша-триггер', 'Зажмите — появится меню, отпустите — выполнится выбранное действие', key, btn),
      h('div', { class: 'hint' }, 'Можно назначить клавишу клавиатуры или любую кнопку мыши, в том числе боковые.')),
    h('h2', {}, 'Автозапуск'),
    h('div', { class: 'card' },
      row('Запускать вместе с Windows', status.packaged ? '' : 'Доступно в установленной версии', sw(S.startup.launchAtLogin, (v) => { S.startup.launchAtLogin = v; save(); }, !status.packaged)),
      row('Запускаться свёрнутым в трей', 'При автозапуске окно настроек не открывается', sw(S.startup.startHidden, (v) => { S.startup.startHidden = v; save(); }))));
}

function pageLook(): HTMLElement {
  const a = S.appearance;
  const set = (patch: Partial<Appearance>) => { Object.assign(a, patch); save(); };
  const picker: HTMLInputElement = h('input', { type: 'color', value: a.accent === 'system' ? status.accent : a.accent, oninput: () => set({ accent: picker.value }) });
  const ring = ringView(() => S.profiles[0].items, () => null);
  return h('div', {}, h('h1', {}, 'Внешний вид'),
    h('div', { class: 'cols look' },
      h('div', { class: 'card' },
        row('Тема', '', seg<Appearance['theme']>([['system', 'Системная'], ['light', 'Светлая'], ['dark', 'Тёмная']], a.theme, (v) => { set({ theme: v }); render(); })),
        row('Цвет акцента', 'Подсветка выбранного сектора',
          seg<'system' | 'custom'>([['system', 'Системный'], ['custom', 'Свой']], a.accent === 'system' ? 'system' : 'custom', (v) => { set({ accent: v === 'system' ? 'system' : picker.value }); render(); }),
          a.accent !== 'system' && picker),
        row('Размер меню', '', slider(120, 260, 5, a.radius, (v) => `${v} px`, (v) => set({ radius: v }))),
        row('Центральная зона', 'Отпустить кнопку внутри — отмена', slider(30, 80, 2, a.innerRadius, (v) => `${v} px`, (v) => set({ innerRadius: v }))),
        row('Непрозрачность', '', slider(50, 100, 2, Math.round(a.opacity * 100), (v) => `${v}%`, (v) => set({ opacity: v / 100 }))),
        row('Возвращать курсор в центр', 'Перед выполнением действия — удобно для макросов с кликами', sw(a.returnCursor, (v) => set({ returnCursor: v })))),
      h('div', { class: 'card' }, ring)));
}

function pageAbout(): HTMLElement {
  return h('div', {}, h('h1', {}, 'О программе'),
    h('div', { class: 'card' },
      row('Radialy', t('Версия {version}').replace('{version}', status.version), h('button', { class: 'btn', onclick: async () => {
        try {
          await api.openGitHub();
        } catch {
          toast('Не удалось открыть GitHub');
        }
      } }, 'GitHub')),
      row('Закрытие окна', 'Программа продолжает работать в трее. Полностью закрыть её можно только из меню значка в трее.'),
      row('Папка с настройками и логом', status.dataDir, h('button', { class: 'btn', onclick: () => api.openDataDir() }, 'Открыть'))));
}

// ── каркас ──
const NAV: [Page, string, string][] = [
  ['menu', 'Меню', '\uE8FD'], ['general', 'Основные', '\uE713'], ['look', 'Внешний вид', '\uE790'], ['about', 'О программе', '\uE946'],
];

function render(): void {
  drawPreview = null;
  document.documentElement.lang = S.language;
  const content = { menu: pageMenu, general: pageGeneral, look: pageLook, about: pageAbout }[page]();
  root.replaceChildren(
    h('div', { class: 'titlebar' }, 'Radialy'),
    h('nav', { class: 'nav' }, ...NAV.map(([id, title, glyph]) =>
      h('button', { class: page === id ? 'on' : '', onclick: () => { page = id; render(); } }, h('span', { class: 'gi' }, glyph), title))),
    h('main', { class: 'content' }, content),
  );
  redraw();
}

async function init(): Promise<void> {
  [S, status] = await Promise.all([api.getSettings(), api.getStatus()]);
  document.documentElement.style.setProperty('--accent', status.accent);
  document.documentElement.style.setProperty('--accent-fg', readableOn(status.accent));
  profileId = S.profiles[0].id;
  itemId = S.profiles[0].items[0]?.id ?? null;
  api.onExternalChange((s) => {
    S = s;
    if (!S.profiles.some((p) => p.id === profileId)) profileId = S.profiles[0].id;
    render();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => drawPreview?.());
  render();
}

void init();
