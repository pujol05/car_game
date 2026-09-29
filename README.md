# DRIFT

Joc de curses arcade en 3D, d'estil _low-poly_ i colors vius. Es corre contra el
rellotge i contra el fantasma del teu millor temps, amb derrapades que carreguen el
turbo, salts i loopings. Inclou un editor de circuits sobre una graella (estil
Trackmania) per crear-ne de nous i compartir-los amb un codi o un enllaç.

Tot el que es veu i se sent es genera per codi: cotxes, peces del circuit, decoració,
cel, partícules i so (Web Audio). No hi ha models ni fitxers d'àudio externs.

## Requisits

- [Node.js](https://nodejs.org/) 24 i npm 11
- Un navegador modern amb WebGL (Chrome, Edge o Firefox)

El projecte està pensat per treballar **només en local** amb el servidor de
desenvolupament. No hi ha cap desplegament configurat.

## Com executar-lo en local

Des de la carpeta del projecte (per exemple amb PowerShell):

```bash
npm install
```

```bash
npm run dev
```

Obre <http://localhost:5173> al navegador.

### Altres ordres

| Ordre             | Què fa                                                 |
| ----------------- | ------------------------------------------------------ |
| `npm run dev`     | Servidor de desenvolupament amb recàrrega automàtica   |
| `npm run build`   | Comprovació de tipus (TypeScript) i build de producció |
| `npm run preview` | Serveix en local el build de `dist/`                   |
| `npm test`        | Tests de lògica amb Vitest                             |
| `npm run lint`    | ESLint i comprovació de format amb Prettier            |
| `npm run format`  | Formata el codi amb Prettier                           |

## Controls

| Acció                             | Teclat        | Comandament      |
| --------------------------------- | ------------- | ---------------- |
| Accelerar / frenar i marxa enrere | W / S o ↑ / ↓ | RT / LT          |
| Girar                             | A / D o ← / → | Palanca esquerra |
| Derrapar (fre de mà)              | Espai         | A o RB           |
| Turbo                             | Shift         | X o LB           |
| Reaparèixer a l'últim checkpoint  | R             | Y                |
| Reiniciar la cursa                | Enter         | Back             |
| Pausa                             | Esc           | Start            |

A l'aire, la direcció fa girar el cotxe i accelerador/fre n'inclinen el morro.

## Com es juga

- **Contrarellotge amb voltes.** Cal passar per tots els checkpoints de la volta abans
  de creuar la meta. A cada checkpoint es mostra el temps parcial en **verd** si vas
  més ràpid que el teu rècord i en **vermell** si vas més lent.
- **Derrapada i turbo.** Mantén Espai mentre gires a bona velocitat per derrapar; la
  derrapada omple la barra de turbo, que es gasta amb Shift. Els pads de turbo del
  circuit donen una empenta gratuïta.
- **Reaparició.** Amb R tornes a l'últim checkpoint, aturat i encarat en el sentit de
  la pista. Si el cotxe queda bolcat i quiet, reapareix sol.
- **Fantasma.** El fantasma translúcid és la teva millor cursa en aquell circuit. Es
  grava l'entrada de cada tick i es reprodueix amb la mateixa física determinista.
- **Rècords i medalles.** El millor temps i el fantasma de cada circuit es desen a
  `localStorage`. Als circuits oficials hi ha medalles de bronze, plata, or i autor.

### Cotxes

| Cotxe  | Estil                                                |
| ------ | ---------------------------------------------------- |
| Brisa  | Equilibrat, ideal per començar                       |
| Fletxa | El més ràpid en recta, però amb menys adherència     |
| Grapa  | Molta adherència i bona acceleració, punta més baixa |

### Circuits oficials (de més fàcil a més difícil)

1. **Iniciació**: un rectangle de corbes obertes per aprendre els controls.
2. **Primer Circuit**: pujada, rampa de salt, looping i obstacles.
3. **Serralada**: pujada fins al nivell 2, esses tancades a dalt i baixada cap a un salt.
4. **Tirabuixó**: dos loopings, esses, obstacles i un salt sobre un buit.
5. **Vertigen**: de sortida a meta, fins al nivell 3, amb salts, baixades i un looping.

## Editor de circuits

Des del menú principal, **Editor de circuits**.

- **Peces**: recta, corba tancada i oberta, pujada/baixada, rampa de salt, looping,
  turbo, obstacles, checkpoint, sortida, meta i sortida-meta (per a circuits de voltes).
- **Ratolí**: clic per col·locar, clic dret per esborrar, arrossegar amb el botó dret
  per girar la vista, roda per fer zoom.
- **Teclat**: WASD per moure la vista, R per rotar la peça, Q/E per canviar de nivell,
  1–0 per triar peça, X per canviar a l'eina d'esborrar, Ctrl+Z / Ctrl+Y per desfer i
  refer, T per provar el circuit.
- **Validació**: el panell de la dreta indica si al circuit li falta la sortida, la
  meta o checkpoints, o si el recorregut s'interromp. Només es pot provar un circuit
  vàlid. Una rampa pot enllaçar amb una peça fins a 5 cel·les més enllà (salt amb buit).
- **Provar**: condueix el circuit directament; amb Esc (pausa) tornes a l'editor.
- **Desar / Carregar**: els circuits es desen al navegador i apareixen a la selecció
  de circuits per córrer-hi. Els oficials es poden carregar com a plantilla.
- **Compartir**: _Exportar_ mostra un codi comprimit i un enllaç
  (`http://localhost:5173/#track=...`). Qui obri l'enllaç o enganxi el codi a
  _Importar_ tindrà el circuit a l'editor.

## Opcions

Volum, qualitat gràfica (baixa, mitjana o alta: resolució i ombres), fum/espurnes/marques
de pneumàtics, línies de velocitat amb el turbo i fantasma. L'hora del dia (dia, posta de
sol o nit amb llums) es tria a la selecció de circuit.

## Estructura del projecte

```
src/
  main.ts      punt d'entrada i navegació entre pantalles
  core/        game loop, entrada, matemàtiques, configuració, emmagatzematge
  physics/     vehicle (suspensió per raycasts) i món de col·lisions
  track/       peces, generació de geometria, connectivitat, serialització
  editor/      model de l'editor, validació, vista 3D i càmera orbital
  race/        cursa, fantasma, rècords, medalles i sessió
  render/      escena, cel, càmera, cotxes, decoració, partícules, efectes
  ui/          menús, HUD, pausa, resultats, opcions i interfície de l'editor
  audio/       so sintetitzat amb Web Audio
  data/        cotxes i circuits oficials
tests/         tests de Vitest (inclou un pilot automàtic que recorre els circuits)
docs/          documentació tècnica
```

Més detalls a [docs/arquitectura.md](docs/arquitectura.md).
