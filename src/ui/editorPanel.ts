// Interfície (DOM) de l'editor de circuits.

import type { ValidationResult } from '../editor/validation';
import { PIECES } from '../track/pieces';
import { MAX_NAME_LENGTH } from '../track/serialize';
import type { PieceType } from '../track/types';

export type EditorTool = 'place' | 'erase';

/** Ordre de la paleta; els deu primers tenen drecera amb les tecles 1..0. */
export const PALETTE: readonly PieceType[] = [
  'straight',
  'curveSmall',
  'curveLarge',
  'slope',
  'ramp',
  'loop',
  'boost',
  'obstacle',
  'checkpoint',
  'startFinish',
  'start',
  'finish',
];

export interface EditorPanelHandlers {
  selectPiece(type: PieceType): void;
  setTool(tool: EditorTool): void;
  rotate(): void;
  changeLevel(delta: number): void;
  undo(): void;
  redo(): void;
  clear(): void;
  changeLaps(delta: number): void;
  rename(name: string): void;
  test(): void;
  exit(): void;
  save(): void;
  openLoad(): void;
  openExport(): void;
  openImport(): void;
}

export interface EditorPanelState {
  piece: PieceType;
  tool: EditorTool;
  rotation: number;
  level: number;
  canUndo: boolean;
  canRedo: boolean;
  laps: number;
  lapTrack: boolean;
  name: string;
  pieceCount: number;
  validation: ValidationResult;
}

export interface LoadEntry {
  name: string;
  detail: string;
  onLoad(): void;
  onDelete?: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  parent?: HTMLElement,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
}

function button(
  parent: HTMLElement,
  text: string,
  onClick: () => void,
  title = '',
): HTMLButtonElement {
  const b = el('button', 'btn', parent, text);
  b.type = 'button';
  if (title) b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

export class EditorPanel {
  readonly root: HTMLDivElement;
  private readonly nameInput: HTMLInputElement;
  private readonly lapsLabel: HTMLSpanElement;
  private readonly lapsBox: HTMLDivElement;
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private readonly testBtn: HTMLButtonElement;
  private readonly pieceButtons = new Map<PieceType, HTMLButtonElement>();
  private readonly placeBtn: HTMLButtonElement;
  private readonly eraseBtn: HTMLButtonElement;
  private readonly rotationLabel: HTMLSpanElement;
  private readonly levelLabel: HTMLSpanElement;
  private readonly status: HTMLDivElement;
  private readonly messages: HTMLUListElement;
  private readonly toastEl: HTMLDivElement;
  private readonly modal: HTMLDivElement;
  private toastTimer = 0;

  constructor(h: EditorPanelHandlers) {
    this.root = el('div', 'editor');

    // --- Barra superior ---
    const top = el('div', 'ed-top panel', this.root);
    this.nameInput = el('input', 'ed-name', top);
    this.nameInput.maxLength = MAX_NAME_LENGTH;
    this.nameInput.placeholder = 'Nom del circuit';
    this.nameInput.addEventListener('input', () => h.rename(this.nameInput.value));
    this.lapsBox = el('div', 'ed-group', top);
    el('span', '', this.lapsBox, 'Voltes');
    button(this.lapsBox, '−', () => h.changeLaps(-1));
    this.lapsLabel = el('span', 'ed-value', this.lapsBox);
    button(this.lapsBox, '+', () => h.changeLaps(1));
    const history = el('div', 'ed-group', top);
    this.undoBtn = button(history, '↶ Desfer', h.undo, 'Ctrl+Z');
    this.redoBtn = button(history, '↷ Refer', h.redo, 'Ctrl+Y');
    button(history, 'Buidar', h.clear);
    const files = el('div', 'ed-group', top);
    button(files, 'Desar', h.save);
    button(files, 'Carregar', h.openLoad);
    button(files, 'Exportar', h.openExport);
    button(files, 'Importar', h.openImport);
    const run = el('div', 'ed-group', top);
    this.testBtn = button(run, '▶ Provar', h.test, 'T');
    this.testBtn.classList.add('primary');
    button(run, 'Sortir', h.exit);

    // --- Paleta i eines ---
    const body = el('div', 'ed-body', this.root);
    const left = el('div', 'ed-left panel', body);
    el('h3', '', left, 'Peces');
    const palette = el('div', 'ed-palette', left);
    PALETTE.forEach((type, i) => {
      const key = i < 9 ? String(i + 1) : i === 9 ? '0' : '';
      const b = button(palette, PIECES[type].label, () => h.selectPiece(type));
      if (key) el('kbd', '', b, key);
      this.pieceButtons.set(type, b);
    });
    el('h3', '', left, 'Eines');
    const tools = el('div', 'ed-group', left);
    this.placeBtn = button(tools, 'Col·locar', () => h.setTool('place'));
    this.eraseBtn = button(tools, 'Esborrar', () => h.setTool('erase'), 'X');
    const rot = el('div', 'ed-group', left);
    button(rot, '⟳ Rotar', h.rotate, 'R');
    this.rotationLabel = el('span', 'ed-value', rot);
    const lvl = el('div', 'ed-group', left);
    el('span', '', lvl, 'Nivell');
    button(lvl, '▼', () => h.changeLevel(-1), 'Q');
    this.levelLabel = el('span', 'ed-value', lvl);
    button(lvl, '▲', () => h.changeLevel(1), 'E');

    // --- Validació ---
    const right = el('div', 'ed-right panel', body);
    el('h3', '', right, 'Validació');
    this.status = el('div', 'ed-status', right);
    this.messages = el('ul', 'ed-messages', right);

    const help = el('div', 'ed-help panel', this.root);
    help.textContent =
      'Clic: col·locar · Clic dret: esborrar · Arrossegar amb el botó dret: girar la vista · ' +
      'Roda: zoom · WASD: moure la vista · R: rotar · Q/E: nivell · Ctrl+Z/Y: desfer/refer · T: provar';

    this.toastEl = el('div', 'ed-toast', this.root);
    this.modal = el('div', 'modal-backdrop', this.root);
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeDialog();
    });
  }

  get dialogOpen(): boolean {
    return this.modal.classList.contains('visible');
  }

  update(s: EditorPanelState): void {
    if (document.activeElement !== this.nameInput) this.nameInput.value = s.name;
    this.lapsLabel.textContent = String(s.laps);
    this.lapsBox.classList.toggle('disabled', !s.lapTrack);
    this.undoBtn.disabled = !s.canUndo;
    this.redoBtn.disabled = !s.canRedo;
    this.testBtn.disabled = !s.validation.valid;
    for (const [type, b] of this.pieceButtons) b.classList.toggle('active', type === s.piece);
    this.placeBtn.classList.toggle('active', s.tool === 'place');
    this.eraseBtn.classList.toggle('active', s.tool === 'erase');
    this.rotationLabel.textContent = `${s.rotation * 90}°`;
    this.levelLabel.textContent = String(s.level);

    const v = s.validation;
    this.status.textContent = v.valid
      ? `Circuit vàlid ✓ (${s.pieceCount} peces)`
      : 'Circuit incomplet';
    this.status.className = `ed-status ${v.valid ? 'ok' : 'bad'}`;
    this.messages.replaceChildren(
      ...v.errors.map((m) => el('li', 'error', undefined, m)),
      ...v.warnings.map((m) => el('li', 'warning', undefined, m)),
    );
  }

  toast(message: string, kind: 'info' | 'error' = 'info'): void {
    this.toastEl.textContent = message;
    this.toastEl.className = `ed-toast visible ${kind}`;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('visible'), 2500);
  }

  closeDialog(): void {
    this.modal.classList.remove('visible');
    this.modal.replaceChildren();
  }

  private openDialog(title: string): HTMLDivElement {
    this.modal.replaceChildren();
    const box = el('div', 'modal panel', this.modal);
    el('h2', '', box, title);
    this.modal.classList.add('visible');
    return box;
  }

  showExport(code: string, link: string): void {
    const box = this.openDialog('Compartir el circuit');
    el('label', '', box, 'Codi');
    const codeArea = el('textarea', 'code', box);
    codeArea.readOnly = true;
    codeArea.value = code;
    el('label', '', box, 'Enllaç');
    const linkInput = el('input', 'code', box);
    linkInput.readOnly = true;
    linkInput.value = link;
    const actions = el('div', 'modal-actions', box);
    button(actions, 'Copiar el codi', () => void this.copy(code, codeArea));
    button(actions, "Copiar l'enllaç", () => void this.copy(link, linkInput));
    button(actions, 'Tancar', () => this.closeDialog());
  }

  showImport(onImport: (text: string) => string | null): void {
    const box = this.openDialog('Importar un circuit');
    el('p', '', box, 'Enganxa un codi de circuit o un enllaç complet.');
    const area = el('textarea', 'code', box);
    const error = el('p', 'error', box);
    const actions = el('div', 'modal-actions', box);
    const go = button(actions, 'Importar', () => {
      const problem = onImport(area.value);
      if (problem) error.textContent = problem;
      else this.closeDialog();
    });
    go.classList.add('primary');
    button(actions, 'Cancel·lar', () => this.closeDialog());
    area.focus();
  }

  showLoad(entries: LoadEntry[]): void {
    const box = this.openDialog('Carregar un circuit');
    const list = el('ul', 'load-list', box);
    if (entries.length === 0) el('li', '', list, 'Encara no hi ha cap circuit desat.');
    for (const entry of entries) {
      const li = el('li', '', list);
      const info = el('div', '', li);
      el('strong', '', info, entry.name);
      el('small', '', info, entry.detail);
      const actions = el('div', 'ed-group', li);
      button(actions, 'Obrir', () => {
        entry.onLoad();
        this.closeDialog();
      });
      if (entry.onDelete) {
        const onDelete = entry.onDelete;
        button(actions, 'Esborrar', () => {
          onDelete();
          li.remove();
        });
      }
    }
    const actions = el('div', 'modal-actions', box);
    button(actions, 'Tancar', () => this.closeDialog());
  }

  private async copy(text: string, field: HTMLInputElement | HTMLTextAreaElement): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast('Copiat al porta-retalls');
    } catch {
      field.select();
      this.toast('Selecciona el text i copia’l amb Ctrl+C', 'error');
    }
  }
}
