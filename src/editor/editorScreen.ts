// Pantalla de l'editor de circuits: connecta el model, la vista 3D, la
// càmera orbital i la interfície.

import * as THREE from 'three';
import { type InputManager, isTextField } from '../core/input';
import { clamp } from '../core/math';
import type { Screen } from '../core/screen';
import { FIRST_CIRCUIT } from '../data/tracks';
import type { SceneRenderer } from '../render/scene';
import { worldCells } from '../track/builder';
import { GRID_HALF, LEVEL, MAX_LEVEL, TILE } from '../track/grid';
import {
  TrackCodeError,
  decodeTrack,
  encodeTrack,
  extractCode,
  trackLink,
} from '../track/serialize';
import type { PieceData, PieceType, Rotation, TrackData } from '../track/types';
import { EditorPanel, type EditorTool, type LoadEntry, PALETTE } from '../ui/editorPanel';
import { EditorModel } from './editorModel';
import { EditorView } from './editorView';
import { OrbitCamera } from './orbitCamera';
import {
  deleteSavedTrack,
  listSavedTracks,
  loadDraft,
  loadSavedTrack,
  saveDraft,
  saveTrack,
} from './savedTracks';
import { type ValidationResult, validateTrack } from './validation';

export interface EditorCallbacks {
  onTest(track: TrackData): void;
  onExit(): void;
}

interface Drag {
  button: number;
  x: number;
  y: number;
  moved: boolean;
}

const DIGIT_KEYS = [
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9',
  'Digit0',
];

export class EditorScreen implements Screen {
  private readonly model = new EditorModel();
  private readonly editorView = new EditorView();
  private readonly orbit = new OrbitCamera();
  private readonly panel: EditorPanel;
  private piece: PieceType = 'straight';
  private rotation: Rotation = 0;
  private level = 0;
  private tool: EditorTool = 'place';
  private hoverCell: { x: number; y: number; z: number } | null = null;
  private validation: ValidationResult;
  private drag: Drag | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private pointerInside = false;
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hit = new THREE.Vector3();
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly view: SceneRenderer,
    private readonly input: InputManager,
    private readonly ui: HTMLElement,
    private readonly callbacks: EditorCallbacks,
  ) {
    this.panel = new EditorPanel({
      selectPiece: (type) => {
        this.piece = type;
        this.tool = 'place';
        this.refresh();
      },
      setTool: (tool) => {
        this.tool = tool;
        this.refresh();
      },
      rotate: () => this.rotate(1),
      changeLevel: (d) => this.changeLevel(d),
      undo: () => this.model.undo(),
      redo: () => this.model.redo(),
      clear: () => {
        this.model.clear();
        this.panel.toast('Circuit buidat (Ctrl+Z per desfer)');
      },
      changeLaps: (d) => {
        this.model.laps = clamp(this.model.laps + d, 1, 9);
        this.onModelChange();
      },
      rename: (name) => {
        this.model.name = name;
        saveDraft(this.model.toTrackData());
      },
      test: () => this.test(),
      exit: () => this.callbacks.onExit(),
      save: () => this.save(),
      openLoad: () => this.openLoad(),
      openExport: () => this.openExport(),
      openImport: () => this.panel.showImport((text) => this.importCode(text)),
    });

    this.model.onChange = () => this.onModelChange();
    const draft = loadDraft();
    if (draft) this.model.load(draft);
    this.validation = validateTrack(this.model.toTrackData());
    this.editorView.setTrack(this.model.toTrackData());
    this.editorView.setLevel(this.level);
    this.focusOnTrack();
  }

  /** Obre un circuit extern (p. ex. d'un enllaç compartit). */
  openTrack(data: TrackData, message?: string): void {
    this.model.load(data);
    this.focusOnTrack();
    if (message) this.panel.toast(message);
  }

  enter(): void {
    this.input.clearPressed();
    this.view.scene.add(this.editorView.root);
    this.ui.append(this.panel.root);
    this.attachListeners();
    this.refresh();
  }

  exit(): void {
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.panel.closeDialog();
    this.editorView.root.removeFromParent();
    this.panel.root.remove();
    this.drag = null;
  }

  tick(): void {
    if (this.panel.dialogOpen) return;
    const speed = this.orbit.distance * 0.02;
    const { input } = this;
    const forward =
      (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0) -
      (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0);
    const right =
      (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0) -
      (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0);
    if (forward || right) {
      this.orbit.pan(right * speed, forward * speed);
      this.clampTarget();
      this.updateHover();
    }
  }

  render(): void {
    this.orbit.apply(this.view.camera);
    this.view.followTarget(this.orbit.target);
    this.view.render();
  }

  // --- Estat i accions ---

  private onModelChange(): void {
    const data = this.model.toTrackData();
    this.validation = validateTrack(data);
    this.editorView.setTrack(data);
    saveDraft(data);
    this.refresh();
  }

  private refresh(): void {
    const pieces = this.model.pieces;
    this.panel.update({
      piece: this.piece,
      tool: this.tool,
      rotation: this.rotation,
      level: this.level,
      canUndo: this.model.canUndo,
      canRedo: this.model.canRedo,
      laps: this.model.laps,
      lapTrack: pieces.some((p) => p.type === 'startFinish'),
      name: this.model.name,
      pieceCount: pieces.length,
      validation: this.validation,
    });
    this.updatePreview();
  }

  private rotate(delta: number): void {
    this.rotation = ((((this.rotation + delta) % 4) + 4) % 4) as Rotation;
    this.refresh();
  }

  private changeLevel(delta: number): void {
    const next = clamp(this.level + delta, 0, MAX_LEVEL);
    if (next === this.level) return;
    this.orbit.target.y += (next - this.level) * LEVEL;
    this.level = next;
    this.editorView.setLevel(next);
    this.updateHover();
    this.refresh();
  }

  private brush(): PieceData | null {
    const c = this.hoverCell;
    if (!c || this.tool !== 'place') return null;
    return { type: this.piece, x: c.x, y: this.level, z: c.z, r: this.rotation };
  }

  private updatePreview(): void {
    const brush = this.brush();
    const state =
      this.tool === 'erase' ? 'erase' : brush && this.model.canPlace(brush) ? 'ok' : 'blocked';
    this.editorView.setHover(this.hoverCell, brush, state);
  }

  private applyTool(erase: boolean): void {
    const c = this.hoverCell;
    if (!c) return;
    if (erase || this.tool === 'erase') {
      this.model.removeAt(c.x, this.level, c.z);
      return;
    }
    const brush = this.brush();
    if (brush && !this.model.place(brush)) {
      this.panel.toast('La peça no hi cap: toca una altra peça o surt de la graella.', 'error');
    }
  }

  private test(): void {
    if (!this.validation.valid) {
      this.panel.toast(this.validation.errors[0] ?? 'El circuit no és vàlid.', 'error');
      return;
    }
    this.callbacks.onTest(this.model.toTrackData());
  }

  private save(): void {
    const data = this.model.toTrackData();
    if (!data.name.trim()) {
      this.panel.toast('Posa un nom al circuit abans de desar-lo.', 'error');
      return;
    }
    if (saveTrack({ ...data, name: data.name.trim() })) this.panel.toast(`«${data.name}» desat`);
    else this.panel.toast("No s'ha pogut desar (emmagatzematge ple o bloquejat).", 'error');
  }

  private openLoad(): void {
    const entries: LoadEntry[] = listSavedTracks().map((saved) => ({
      name: saved.name,
      detail: `Desat el ${new Date(saved.updated).toLocaleString('ca')}`,
      onLoad: () => {
        const data = loadSavedTrack(saved);
        if (data) this.openTrack(data, `«${saved.name}» carregat`);
        else this.panel.toast('Aquest circuit desat està malmès.', 'error');
      },
      onDelete: () => deleteSavedTrack(saved.id),
    }));
    entries.push({
      name: FIRST_CIRCUIT.name,
      detail: 'Circuit inclòs (com a plantilla)',
      onLoad: () => this.openTrack(FIRST_CIRCUIT, `«${FIRST_CIRCUIT.name}» carregat`),
    });
    this.panel.showLoad(entries);
  }

  private openExport(): void {
    const data = this.model.toTrackData();
    const base = `${location.origin}${location.pathname}`;
    this.panel.showExport(encodeTrack(data), trackLink(data, base));
  }

  /** Retorna un missatge d'error o null si s'ha importat. */
  private importCode(text: string): string | null {
    try {
      const data = decodeTrack(extractCode(text));
      this.openTrack(data, `«${data.name}» importat`);
      return null;
    } catch (e) {
      return e instanceof TrackCodeError ? e.message : 'El codi no és vàlid.';
    }
  }

  /** Centra la càmera sobre el circuit. */
  private focusOnTrack(): void {
    const pieces = this.model.pieces;
    if (pieces.length === 0) {
      this.orbit.target.set(0, this.level * LEVEL, 0);
      this.orbit.distance = 140;
      return;
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of pieces) {
      for (const [x, , z] of worldCells(p)) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
    }
    this.orbit.target.set(
      ((minX + maxX) / 2) * TILE,
      this.level * LEVEL,
      ((minZ + maxZ) / 2) * TILE,
    );
    const span = Math.max(maxX - minX, maxZ - minZ, 4) * TILE;
    this.orbit.distance = clamp(span * 1.1, 60, 600);
  }

  private clampTarget(): void {
    const limit = GRID_HALF * TILE;
    this.orbit.target.x = clamp(this.orbit.target.x, -limit, limit);
    this.orbit.target.z = clamp(this.orbit.target.z, -limit, limit);
  }

  // --- Entrada ---

  private updateHover(): void {
    let cell: { x: number; y: number; z: number } | null = null;
    if (this.pointerInside && !this.panel.dialogOpen) {
      this.raycaster.setFromCamera(this.pointer, this.view.camera);
      this.plane.constant = -this.level * LEVEL;
      if (this.raycaster.ray.intersectPlane(this.plane, this.hit)) {
        const x = Math.round(this.hit.x / TILE);
        const z = Math.round(this.hit.z / TILE);
        if (x >= -GRID_HALF && x < GRID_HALF && z >= -GRID_HALF && z < GRID_HALF) {
          cell = { x, y: this.level, z };
        }
      }
    }
    const c = this.hoverCell;
    if (c?.x === cell?.x && c?.z === cell?.z && c?.y === cell?.y) return;
    this.hoverCell = cell;
    this.updatePreview();
  }

  private listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, fn, options);
    this.cleanups.push(() => target.removeEventListener(type, fn, options));
  }

  private attachListeners(): void {
    const canvas = this.view.renderer.domElement;
    const setPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      this.pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
    };

    this.listen(canvas, 'pointermove', (e) => {
      setPointer(e);
      this.pointerInside = true;
      const d = this.drag;
      if (d) {
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
        if (d.moved) {
          if (d.button === 2) this.orbit.rotate(-dx * 0.006, dy * 0.006);
          if (d.button === 1) {
            const k = this.orbit.distance * 0.002;
            this.orbit.pan(-dx * k, dy * k);
            this.clampTarget();
          }
          d.x = e.clientX;
          d.y = e.clientY;
        }
      }
      this.updateHover();
    });
    this.listen(canvas, 'pointerleave', () => {
      this.pointerInside = false;
      this.updateHover();
    });
    this.listen(canvas, 'pointerdown', (e) => {
      setPointer(e);
      this.pointerInside = true;
      canvas.setPointerCapture(e.pointerId);
      this.drag = { button: e.button, x: e.clientX, y: e.clientY, moved: false };
    });
    this.listen(canvas, 'pointerup', (e) => {
      const d = this.drag;
      this.drag = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (!d || d.moved || this.panel.dialogOpen) return;
      this.updateHover();
      if (d.button === 0) this.applyTool(false);
      else if (d.button === 2) this.applyTool(true);
    });
    this.listen(canvas, 'contextmenu', (e) => e.preventDefault());
    this.listen(
      canvas,
      'wheel',
      (e) => {
        e.preventDefault();
        this.orbit.zoom(Math.exp(e.deltaY * 0.001));
        this.updateHover();
      },
      { passive: false },
    );

    const onKey = (e: KeyboardEvent) => {
      if (isTextField(e.target)) return;
      if (this.panel.dialogOpen) {
        if (e.code === 'Escape') this.panel.closeDialog();
        return;
      }
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) this.model.redo();
        else this.model.undo();
        return;
      }
      if (ctrl && e.code === 'KeyY') {
        e.preventDefault();
        this.model.redo();
        return;
      }
      if (ctrl) return;
      const digit = DIGIT_KEYS.indexOf(e.code);
      if (digit >= 0 && PALETTE[digit]) {
        this.piece = PALETTE[digit];
        this.tool = 'place';
        this.refresh();
        return;
      }
      switch (e.code) {
        case 'KeyR':
          this.rotate(e.shiftKey ? -1 : 1);
          break;
        case 'KeyQ':
        case 'PageDown':
          this.changeLevel(-1);
          break;
        case 'KeyE':
        case 'PageUp':
          this.changeLevel(1);
          break;
        case 'KeyX':
        case 'Delete':
          this.tool = this.tool === 'erase' ? 'place' : 'erase';
          this.refresh();
          break;
        case 'KeyT':
          this.test();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    this.cleanups.push(() => window.removeEventListener('keydown', onKey));
  }
}
