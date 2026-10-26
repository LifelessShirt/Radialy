import {
  Calculator,
  Camera,
  ChartNoAxesColumnIncreasing,
  CirclePlay,
  ClipboardPaste,
  Copy,
  FileText,
  Folder,
  Gamepad2,
  Globe,
  Lightbulb,
  LockKeyhole,
  Mail,
  Music2,
  Phone,
  Pin,
  Repeat2,
  Rocket,
  Scissors,
  Search,
  Settings,
  SkipBack,
  SkipForward,
  Sparkles,
  Star,
  Undo2,
  Volume2,
  Volume1,
  VolumeX,
} from 'lucide';
import type { MenuIcon } from '../shared/icons';

type IconNode = (typeof Copy)[number][];

const ICON_NODES: Record<MenuIcon, IconNode> = {
  copy: Copy,
  paste: ClipboardPaste,
  pin: Pin,
  undo: Undo2,
  scissors: Scissors,
  camera: Camera,
  chart: ChartNoAxesColumnIncreasing,
  'volume-off': VolumeX,
  volume: Volume2,
  'media-previous': SkipBack,
  'media-play': CirclePlay,
  'media-next': SkipForward,
  'media-volume-down': Volume1,
  'media-volume-up': Volume2,
  loop: Repeat2,
  file: FileText,
  globe: Globe,
  folder: Folder,
  search: Search,
  lock: LockKeyhole,
  lightbulb: Lightbulb,
  settings: Settings,
  star: Star,
  rocket: Rocket,
  gamepad: Gamepad2,
  music: Music2,
  phone: Phone,
  mail: Mail,
  calculator: Calculator,
  sparkles: Sparkles,
};

export function renderIcon(name: MenuIcon, className?: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (className) svg.setAttribute('class', className);
  for (const [tag, attrs] of ICON_NODES[name]) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
    svg.append(element);
  }
  return svg;
}
