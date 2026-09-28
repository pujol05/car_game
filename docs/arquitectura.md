# Arquitectura de DRIFT

## Principis

- **Timestep fix.** La simulació avança sempre a 60 ticks per segon
  (`src/core/loop.ts`). El render és independent: interpola la posició i la rotació
  entre el tick anterior i l'actual, de manera que es veu fluid a qualsevol freqüència
  de pantalla.
- **Física determinista.** La mateixa seqüència d'entrades produeix exactament la mateixa
  cursa. L'entrada es quantitza (`quantizeInput`) abans d'aplicar-la, i el circuit es
  construeix sempre en un ordre canònic de peces. Això permet gravar els fantasmes com a
  entrades.
- **Lògica sense three.js.** `core/`, `physics/`, `track/` (excepte la conversió a malla),
  `editor/` (model i validació) i `race/` només fan servir les classes pròpies `Vec3` i
  `Quat`. Per això es poden testejar amb Vitest a Node. three.js només apareix a
  `render/`, a la vista de l'editor i a la interfície.

## Física del cotxe (`src/physics/vehicle.ts`)

Cos rígid de massa unitària amb 4 subpassos per tick:

1. **Suspensió**: un raig per roda al llarg de l'eix vertical del cotxe contra el món de
   col·lisions. Molla + amortidor + tope, amb la força aplicada al punt d'ancoratge (això
   dona capcineig i balanceig).
2. **Pneumàtics (arcade)**: la direcció controla directament la velocitat de gir, limitada
   per l'adherència; l'adherència gira el vector velocitat cap al morro sense perdre
   velocitat. La derrapada redueix l'adherència, permet girar més i carrega el turbo.
3. **Aire**: la direcció fa girar el cotxe i accelerador/fre n'inclinen el morro; el cotxe
   tendeix a anivellar-se per aterrar bé.
4. **Col·lisions de la carrosseria**: esferes contra triangles amb impulsos. Les parets
   només empenyen de costat perquè el cotxe no s'hi enfili, i la seva col·lisió és més
   alta que la part visible.

`PHYSICS_VERSION` s'ha d'incrementar quan canviï qualsevol cosa que afecti la simulació:
els fantasmes gravats amb una altra versió es descarten.

## Circuits (`src/track/`)

- Graella de cel·les de 20 m × 20 m amb nivells de 5 m. Cada peça té una cel·la
  d'ancoratge, una rotació (0–3) i dos connectors.
- La geometria de cada peça és un escombrat d'una secció de carretera (calçada, vorades,
  parets i llosa) al llarg d'una corba paramètrica. `GeometryBuilder` genera alhora la
  malla visual (dades planes) i els triangles de col·lisió.
- `connectivity.ts` enllaça connectors (també els salts de rampa amb buit) i calcula el
  recorregut des de la sortida; `editor/validation.ts` el fa servir per validar.

### Format de dades

```ts
interface TrackData {
  name: string;
  author: string;
  laps: number; // 1 en circuits de sortida i meta separades
  pieces: { type: PieceType; x: number; y: number; z: number; r: 0 | 1 | 2 | 3 }[];
  medals?: { author: number; gold: number; silver: number; bronze: number }; // ms
}
```

Per compartir, `serialize.ts` converteix el circuit a un format compacte
(`[tipus, x, y, z, r]` per peça), el passa a JSON i el comprimeix amb
`lz-string` (`compressToEncodedURIComponent`). L'enllaç porta el codi al hash
(`#track=...`). En importar, totes les dades es validen abans d'usar-les.

## Cursa, fantasma i rècords (`src/race/`)

- `RaceTracker`: compte enrere, creuament de línies amb precisió inferior a un tick,
  checkpoints, voltes, meta, reaparició i pads de turbo.
- `RaceSession`: cotxe del jugador + fantasma + gravació. En acabar, desa el rècord si
  millora (temps, parcials i fantasma) a `localStorage`, amb una clau calculada a partir
  del contingut del circuit.
- El fantasma és **la millor cursa completa** (totes les voltes): així arrenca alhora que
  el jugador i es pot comparar parcial a parcial.

## Medalles

El temps d'autor de cada circuit oficial és el millor temps del pilot automàtic dels
tests (`tests/autopilot.ts`). Or, plata i bronze són un 8 %, un 20 % i un 40 % més lents.
Si es modifica la física o un circuit, `npm test` imprimeix el nou millor temps de cada
circuit (`tests/official.test.ts`) per actualitzar `src/data/tracks.ts`.

## Eina de depuració

En mode desenvolupament hi ha `window.__drift` a la consola del navegador:
`__drift.advance(segons)` avança la simulació manualment i `__drift.screens` dona
accés a la pantalla activa.
