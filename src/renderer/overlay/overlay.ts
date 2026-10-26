import { renderRing, setActive } from '../ring';

const root = document.getElementById('ring') as HTMLElement;
const backdrop = document.getElementById('backdrop') as HTMLElement;

window.overlay.onOpen((p) => {
  document.documentElement.lang = p.language;
  renderRing(root, p.items, { ...p, blurBackground: true, language: p.language });
  root.style.left = `${p.center.x}px`;
  root.style.top = `${p.center.y}px`;
  backdrop.style.setProperty('--center-x', `${p.center.x}px`);
  backdrop.style.setProperty('--center-y', `${p.center.y}px`);
  backdrop.style.setProperty('--inner-radius', `${p.innerRadius}px`);
  backdrop.style.setProperty('--radius', `${p.radius}px`);
  root.classList.remove('in');
  backdrop.classList.remove('in');
  void root.offsetWidth; // перезапуск анимации
  root.classList.add('in');
  backdrop.classList.add('in');
});
window.overlay.onHover((i) => setActive(root, i));
window.overlay.onClose(() => {
  root.classList.remove('in');
  backdrop.classList.remove('in');
  root.replaceChildren();
});
