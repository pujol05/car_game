// Model de l'editor: peces sobre la graella, amb desfer/refer. No depèn de
// three.js ni del DOM.

import { worldCells } from '../track/builder';
import { MAX_PIECES, cellKey, inGrid } from '../track/grid';
import type { PieceData, TrackData } from '../track/types';

type Command =
  | { kind: 'add'; piece: PieceData }
  | { kind: 'remove'; piece: PieceData }
  | { kind: 'replace'; before: PieceData[]; after: PieceData[] };

const MAX_HISTORY = 200;

function samePiece(a: PieceData, b: PieceData): boolean {
  return a.type === b.type && a.x === b.x && a.y === b.y && a.z === b.z && a.r === b.r;
}

export class EditorModel {
  name = 'Circuit nou';
  author = '';
  laps = 3;
  private list: PieceData[] = [];
  private readonly occupancy = new Map<string, number>();
  private readonly undoStack: Command[] = [];
  private readonly redoStack: Command[] = [];
  /** Es crida després de qualsevol canvi de peces. */
  onChange: (() => void) | null = null;

  get pieces(): readonly PieceData[] {
    return this.list;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Índex de la peça que ocupa una cel·la, o -1. */
  pieceAt(x: number, y: number, z: number): number {
    return this.occupancy.get(cellKey(x, y, z)) ?? -1;
  }

  canPlace(piece: PieceData): boolean {
    if (this.list.length >= MAX_PIECES) return false;
    return worldCells(piece).every(
      ([x, y, z]) => inGrid(x, y, z) && !this.occupancy.has(cellKey(x, y, z)),
    );
  }

  place(piece: PieceData): boolean {
    if (!this.canPlace(piece)) return false;
    this.execute({ kind: 'add', piece: { ...piece } });
    return true;
  }

  removeAt(x: number, y: number, z: number): boolean {
    const index = this.pieceAt(x, y, z);
    if (index < 0) return false;
    this.execute({ kind: 'remove', piece: this.list[index] });
    return true;
  }

  clear(): void {
    if (this.list.length === 0) return;
    this.execute({ kind: 'replace', before: [...this.list], after: [] });
  }

  /** Carrega un circuit sencer (es pot desfer). */
  load(data: TrackData): void {
    this.name = data.name;
    this.author = data.author;
    this.laps = data.laps;
    this.execute({
      kind: 'replace',
      before: [...this.list],
      after: data.pieces.map((p) => ({ ...p })),
    });
  }

  undo(): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    this.apply(this.inverse(cmd));
    this.redoStack.push(cmd);
    this.changed();
  }

  redo(): void {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    this.apply(cmd);
    this.undoStack.push(cmd);
    this.changed();
  }

  toTrackData(): TrackData {
    return {
      name: this.name,
      author: this.author,
      laps: this.laps,
      pieces: this.list.map((p) => ({ ...p })),
    };
  }

  private execute(cmd: Command): void {
    this.apply(cmd);
    this.undoStack.push(cmd);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack.length = 0;
    this.changed();
  }

  private inverse(cmd: Command): Command {
    switch (cmd.kind) {
      case 'add':
        return { kind: 'remove', piece: cmd.piece };
      case 'remove':
        return { kind: 'add', piece: cmd.piece };
      case 'replace':
        return { kind: 'replace', before: cmd.after, after: cmd.before };
    }
  }

  private apply(cmd: Command): void {
    switch (cmd.kind) {
      case 'add':
        this.list.push(cmd.piece);
        break;
      case 'remove':
        this.list = this.list.filter((p) => !samePiece(p, cmd.piece));
        break;
      case 'replace':
        this.list = cmd.after.map((p) => ({ ...p }));
        break;
    }
    this.reindex();
  }

  private reindex(): void {
    this.occupancy.clear();
    this.list.forEach((p, i) => {
      for (const [x, y, z] of worldCells(p)) this.occupancy.set(cellKey(x, y, z), i);
    });
  }

  private changed(): void {
    this.onChange?.();
  }
}
