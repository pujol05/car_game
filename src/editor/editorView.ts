// Objectes 3D de l'editor: el circuit, la graella del nivell actual, la
// cel·la sota el cursor i la previsualització de la peça a col·locar.

import * as THREE from 'three';
import { TrackView } from '../render/trackView';
import { buildTrack } from '../track/builder';
import { GRID_HALF, LEVEL, TILE } from '../track/grid';
import type { PieceData, TrackData } from '../track/types';

export class EditorView {
  readonly root = new THREE.Group();
  private trackView: TrackView | null = null;
  private readonly grid: THREE.GridHelper;
  private readonly hover: THREE.LineSegments;
  private preview: TrackView | null = null;
  private previewKey = '';

  constructor() {
    const size = GRID_HALF * 2 * TILE;
    this.grid = new THREE.GridHelper(size, GRID_HALF * 2, 0xffffff, 0xffffff);
    const gridMat = this.grid.material as THREE.Material;
    gridMat.transparent = true;
    gridMat.opacity = 0.35;
    gridMat.depthWrite = false;
    // Les línies han d'anar a les vores de les cel·les, no als centres.
    this.grid.position.set(-TILE / 2, 0, -TILE / 2);
    this.root.add(this.grid);

    const box = new THREE.BoxGeometry(TILE, LEVEL, TILE);
    this.hover = new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({ color: 0xffe14d }),
    );
    box.dispose();
    this.hover.visible = false;
    this.root.add(this.hover);
  }

  setTrack(data: TrackData): void {
    this.trackView?.dispose();
    this.trackView = new TrackView(buildTrack(data));
    this.root.add(this.trackView.root);
  }

  setLevel(level: number): void {
    this.grid.position.y = level * LEVEL + 0.05;
  }

  /** Cel·la sota el cursor i previsualització de la peça (o null per amagar-les). */
  setHover(
    cell: { x: number; y: number; z: number } | null,
    brush: PieceData | null,
    state: 'ok' | 'blocked' | 'erase',
  ): void {
    this.hover.visible = cell !== null;
    if (cell) {
      this.hover.position.set(cell.x * TILE, cell.y * LEVEL + LEVEL / 2, cell.z * TILE);
      const color = state === 'ok' ? 0x7dff9b : state === 'erase' ? 0xff5c5c : 0xffb03a;
      (this.hover.material as THREE.LineBasicMaterial).color.setHex(color);
    }

    const key = brush ? `${brush.type},${brush.x},${brush.y},${brush.z},${brush.r},${state}` : '';
    if (key === this.previewKey) return;
    this.previewKey = key;
    this.preview?.dispose();
    this.preview = null;
    if (!brush) return;
    this.preview = new TrackView(buildTrack({ name: '', author: '', laps: 1, pieces: [brush] }));
    const tint = new THREE.Color(state === 'ok' ? 0xbfffcf : 0xff6060);
    this.preview.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const mat = o.material as THREE.MeshStandardMaterial;
      mat.transparent = true;
      mat.opacity = 0.55;
      mat.depthWrite = false;
      mat.color.copy(tint);
      o.castShadow = false;
      o.receiveShadow = false;
    });
    this.root.add(this.preview.root);
  }

  dispose(): void {
    this.trackView?.dispose();
    this.preview?.dispose();
    this.trackView = null;
    this.preview = null;
    this.previewKey = '';
    this.root.removeFromParent();
  }
}
