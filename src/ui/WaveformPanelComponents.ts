import { WAVEFORM } from '../config';

export type WaveformIcon = keyof typeof ICON;

const ICON = {
  start: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="1.7" height="10"/><path d="M13 3.2v9.6L6 8z"/></svg>',
  end: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 3.2v9.6L10 8z"/><rect x="11.3" y="3" width="1.7" height="10"/></svg>',
  back: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3 5 8l5 5"/></svg>',
  fwd: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>',
  play: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3l8 5-8 5z"/></svg>',
  pause: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="3" width="3" height="10"/><rect x="9" y="3" width="3" height="10"/></svg>',
  eye: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z"/><circle cx="8" cy="8" r="2"/></svg>',
  eyeoff: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1 8s2.5-4.5 7-4.5c1 0 1.9.2 2.7.5M15 8s-2.5 4.5-7 4.5c-1 0-1.9-.2-2.7-.5"/><path d="M2 2l12 12"/></svg>',
};

interface ButtonOptions {
  action: string;
  icon: WaveformIcon;
  label: string;
  title: string;
  main?: boolean;
}

export function setButtonIcon(button: HTMLButtonElement, icon: WaveformIcon): void {
  button.innerHTML = ICON[icon];
}

function button(options: ButtonOptions): HTMLButtonElement {
  const el = document.createElement('button');
  el.className = options.main ? 'hud-wbtn main' : 'hud-wbtn';
  el.dataset.a = options.action;
  el.title = options.title;
  el.setAttribute('aria-label', options.label);
  setButtonIcon(el, options.icon);
  return el;
}

function span(className: string, text = ''): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}

export class WaveformTransportControls {
  readonly el = document.createElement('div');
  readonly startBtn = button({ action: 'start', icon: 'start', title: 'Jump to start', label: 'Jump to start' });
  readonly backBtn = button({ action: 'back', icon: 'back', title: 'Back one bar', label: 'Seek back one bar' });
  readonly playBtn = button({ action: 'play', icon: 'play', title: 'Play / pause', label: 'Play or pause', main: true });
  readonly fwdBtn = button({ action: 'fwd', icon: 'fwd', title: 'Forward one bar', label: 'Seek forward one bar' });
  readonly endBtn = button({ action: 'end', icon: 'end', title: 'Jump to end', label: 'Jump to end' });

  constructor() {
    this.el.className = 'hud-wcontrols';
    this.el.dataset.component = 'transport-controls';
    this.el.append(this.startBtn, this.backBtn, this.playBtn, this.fwdBtn, this.endBtn);
  }
}

export class WaveformTransportInfo {
  readonly timeEl = span('hud-wtime', '0:00 / 0:00');
  readonly el = document.createElement('div');
  readonly bpmEl = document.createElement('b');
  readonly bpmDot = document.createElement('i');
  readonly barEl = document.createElement('b');
  readonly sectionEl = span('hud-wsection hidden');
  readonly sectionDot = document.createElement('i');
  readonly sectionLabel = document.createElement('b');
  readonly energyFill = document.createElement('i');

  constructor() {
    this.el.className = 'hud-winfo';
    this.el.dataset.component = 'transport-info';

    const bpm = span('hud-wbpm');
    this.bpmDot.className = 'hud-wbpm-dot';
    this.bpmEl.textContent = '0';
    bpm.append(this.bpmDot, this.bpmEl, document.createTextNode(' BPM'));

    const bar = span('hud-wbar', 'Bar ');
    this.barEl.textContent = '1';
    bar.append(this.barEl);

    this.sectionDot.className = 'hud-wsection-dot';
    this.sectionEl.append(this.sectionDot, this.sectionLabel);

    const energy = span('hud-wenergy');
    energy.title = 'energy';
    energy.append(this.energyFill);

    this.el.append(bpm, bar, this.sectionEl, energy);
  }
}

export class WaveformTransportRow {
  readonly el = document.createElement('div');
  readonly controls = new WaveformTransportControls();
  readonly info = new WaveformTransportInfo();
  readonly toggleBtn = button({ action: 'toggle', icon: 'eye', title: 'Toggle waveform', label: 'Toggle waveform' });

  constructor() {
    this.el.className = 'hud-wave-row';
    this.el.dataset.component = 'transport-row';
    this.el.append(
      this.controls.el,
      this.info.timeEl,
      span('hud-wspacer'),
      this.info.el,
      span('hud-wspacer'),
      this.toggleBtn,
    );
  }
}

export class WaveformBandLegend {
  readonly el = document.createElement('div');

  constructor() {
    this.el.className = 'hud-wlegend';
    this.el.dataset.component = 'band-legend';
    this.el.append(
      span('hud-wleg-label', 'bands'),
      this.item('lows', WAVEFORM.lowColor),
      this.item('mids', WAVEFORM.midColor),
      this.item('highs', WAVEFORM.highColor),
    );
  }

  private item(label: string, color: string): HTMLSpanElement {
    const el = span('hud-wleg');
    const swatch = document.createElement('i');
    swatch.style.background = color;
    el.append(swatch, document.createTextNode(label));
    return el;
  }
}

export class WaveformCanvasPane {
  readonly el = document.createElement('div');
  readonly canvas = document.createElement('canvas');

  constructor() {
    this.el.className = 'hud-wave-canvas-wrap';
    this.el.dataset.component = 'waveform-canvas';
    this.el.append(this.canvas);
  }
}
