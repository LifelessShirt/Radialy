// Общая отрисовка радиального меню (оверлей и предпросмотр в настройках).
import type { MenuIcon } from '../shared/icons';
import type { Language } from '../shared/i18n';
import { translate } from '../shared/i18n';
import { renderIcon } from './icons';

export const RING_PAD = 24; // должен совпадать с PAD в main/overlay.ts

export interface RingItem {
  label: string;
  icon: MenuIcon;
  looping?: boolean;
}
export interface RingStyle {
  radius: number;
  innerRadius: number;
  opacity: number;
  dark: boolean;
  accent: string;
  language?: Language;
}

const NS = 'http://www.w3.org/2000/svg';

export function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#000000' : '#ffffff';
}

/** Сектор кольца; углы в градусах по часовой стрелке от «12 часов» */
function sectorPath(c: number, r0: number, r1: number, a0: number, a1: number): string {
  const pt = (r: number, a: number) => {
    const t = (a * Math.PI) / 180;
    return `${(c + r * Math.sin(t)).toFixed(2)} ${(c - r * Math.cos(t)).toFixed(2)}`;
  };
  const corner = Math.min(7, (r0 * (a1 - a0) * Math.PI) / 720);
  const large = a1 - a0 > 180 ? 1 : 0;
  return [
    `M${pt(r1, a0 + (corner * 180) / (Math.PI * r1))}`,
    `A${r1} ${r1} 0 ${large} 1 ${pt(r1, a1 - (corner * 180) / (Math.PI * r1))}`,
    `Q${pt(r1, a1)} ${pt(r1 - corner, a1)}`,
    `L${pt(r0 + corner, a1)}`,
    `Q${pt(r0, a1)} ${pt(r0, a1 - (corner * 180) / (Math.PI * r0))}`,
    `A${r0} ${r0} 0 ${large} 0 ${pt(r0, a0 + (corner * 180) / (Math.PI * r0))}`,
    `Q${pt(r0, a0)} ${pt(r0 + corner, a0)}`,
    `L${pt(r1 - corner, a0)}`,
    `Q${pt(r1, a0)} ${pt(r1, a0 + (corner * 180) / (Math.PI * r1))}Z`,
  ].join('');
}

export function renderRing(root: HTMLElement, items: RingItem[], st: RingStyle, onPick?: (i: number) => void): void {
  const R = st.radius;
  const r0 = st.innerRadius;
  const n = items.length;
  const size = 2 * (R + RING_PAD);
  const c = size / 2;
  const step = 360 / n;
  const mid = (R + r0) / 2;
  const gap = ((3 / mid) * 180) / Math.PI; // зазор между секторами ≈ 3 px
  const chord = Math.max(64, 2 * mid * Math.sin(Math.PI / n) * 0.9);

  root.classList.add('ring');
  root.classList.toggle('pick', !!onPick);
  root.classList.toggle('icons-only', R < 160);
  root.style.width = `${size}px`;
  root.style.height = `${size}px`;
  const set = (k: string, v: string) => root.style.setProperty(k, v);
  const sectorOpacity = st.opacity;
  set('--sector', st.dark ? `rgba(38,38,38,${sectorOpacity})` : `rgba(250,250,250,${sectorOpacity})`);
  set('--stroke', st.dark ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.10)');
  set('--fg', st.dark ? '#ffffff' : '#1a1a1a');
  set('--accent', st.accent);
  set('--accent-fg', readableOn(st.accent));

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  const labels: HTMLElement[] = [];

  items.forEach((it, i) => {
    const a = i * step;
    const rad = (a * Math.PI) / 180;
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', sectorPath(c, r0, R, a - step / 2 + gap / 2, a + step / 2 - gap / 2));
    path.setAttribute('class', 'sector');
    path.dataset.i = String(i);
    if (onPick) path.addEventListener('click', () => onPick(i));
    svg.append(path);

    const label = document.createElement('div');
    label.className = 'label';
    label.dataset.i = String(i);
    label.style.left = `${c + mid * Math.sin(rad)}px`;
    label.style.top = `${c - mid * Math.cos(rad)}px`;
    label.style.maxWidth = `${chord}px`;
    if (it.icon) {
      const iconWrap = document.createElement('span');
      iconWrap.className = 'icon-wrap';
      iconWrap.append(renderIcon(it.icon, 'ico'));
      if (it.looping) {
        const loopBadge = document.createElement('span');
        loopBadge.className = 'loop-badge';
        loopBadge.title = translate('Повтор включён', st.language ?? 'ru');
        loopBadge.append(renderIcon('loop'));
        iconWrap.append(loopBadge);
      }
      label.append(iconWrap);
    }
    const txt = document.createElement('span');
    txt.textContent = it.label;
    label.append(txt);
    labels.push(label);
  });

  const hub = document.createElementNS(NS, 'circle');
  hub.setAttribute('cx', String(c));
  hub.setAttribute('cy', String(c));
  hub.setAttribute('r', String(r0 - 1));
  hub.setAttribute('class', 'hub');
  svg.append(hub);

  root.replaceChildren(svg, ...labels);
}

export function setActive(root: HTMLElement, i: number | null): void {
  root.querySelectorAll('[data-i]').forEach((el) => {
    el.classList.toggle('active', i !== null && el.getAttribute('data-i') === String(i));
  });
}
