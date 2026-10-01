/* Сетка локации «Таверна» (бета, шаг 4). Черновик расстановки: по плану на доске
   (docs/visual/locations.html, #tavern-plan), текст сцены — game.js и dialogue_s1_tavern_martin.md.
   Клетка = «A1»: буква — столбец слева направо (A–J), число — ряд сверху вниз (1–8).
   Клетка занята одним объектом (мебель, не проходится) ИЛИ одной фигуркой.
   Покрытия (проходятся): пол, лавка, дверь (проём в стене; героям — только в страже, не раньше), «за стойкой» (место хозяина).
   Позиции в состоянии: по одному знаку на фигуру (индекс клетки → знак из ALPHA), '.' — на сетке нет. */
(function (root) {
  'use strict';
  var CS = root.CS = root.CS || {};
  var COLS = 'ABCDEFGHIJ', W = 10, H = 8;
  // 91 знак без « " » и « \ » и без « . » (точка — «нет на сетке»): индекс клетки 0..79 → знак
  var ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,-/:;<=>?@[]^_`{|}~';

  // Объекты-мебель (клетки не проходятся). label — подпись на карте.
  var OBJECTS = [
    { id: 'table',   label: 'большой стол',     cells: ['B1', 'B2'] },
    { id: 'table2',  label: 'соседний стол',    cells: ['B4', 'B5'] },
    { id: 'table3',  label: 'стол эльфа',       cells: ['E5', 'F5'] },
    { id: 'table4',  label: 'стол',             cells: ['I4'] },
    { id: 'table5',  label: 'стол',             cells: ['I6'] },
    { id: 'bar',     label: 'стойка',           cells: ['F2', 'G2', 'H2', 'I2', 'J2'] },
    { id: 'barrel',  label: 'бочка',            cells: ['E1'] },
    { id: 'milk',    label: 'миска молока',     cells: ['F3'] },
    { id: 'chest',   label: 'сундук',           cells: ['C7'] },
    { id: 'hearth',  label: 'очаг',             cells: ['J7'] },
    { id: 'window',  label: 'окно',             cells: ['F8'] }
  ];
  // Покрытия кроме обычного пола
  var BENCH = ['A1', 'A2', 'A3', 'A4', 'A5'];                 // лавки у западной стены (Габ — A2, спиной к стене)
  var BACK = ['F1', 'G1', 'H1', 'I1', 'J1'];                  // за стойкой — только хозяин
  var DOOR = 'B8';                                            // проём в южной стене
  // Ряд 8 — стена, кроме двери и окна (они — отдельные клетки)

  // Зоны: «где ты» для текста и для старого движка (door / corner / bar / hall); прямоугольники [c0, r0, c1, r1], ряды 1–8
  var ZONES = [
    ['corner', 0, 1, 3, 3],
    ['bar', 4, 1, 9, 3],
    ['door', 0, 6, 3, 8]
  ];
  // Якорь зоны (для «иду в зал», «в угол», «к двери», «к стойке») и дом фигур по зонам
  var ANCHOR = { door: 'B7', corner: 'C2', bar: 'G3', hall: 'E6' };
  var HOME = {
    gab: { corner: 'A2', door: 'A6', bar: 'E3', hall: 'E6' },
    elf: { hall: 'D5', bar: 'G3' },
    nobby: { hall: 'E4', bar: 'G3' },
    mage: { door: 'A7' },
    host: { door: 'D7', bar: 'H1' },
    rowdy: { hall: 'H5', bar: 'H3' },
    lizard: { hall: 'F7' },
    g1: { door: 'B8' }, g2: { door: 'B7' }, g3: { door: 'A7' }
  };

  var OBJ = {}, BLOCK = {}, i;
  function idxOf(name) { return (parseInt(name.slice(1), 10) - 1) * W + COLS.indexOf(name.charAt(0)); }
  function nameOf(ix) { return COLS.charAt(ix % W) + (Math.floor(ix / W) + 1); }
  OBJECTS.forEach(function (o) { o.ix = o.cells.map(idxOf); OBJ[o.id] = o; o.ix.forEach(function (c) { BLOCK[c] = o.id; }); });
  var TERRAIN = {};
  for (i = 0; i < W * H; i++) TERRAIN[i] = (Math.floor(i / W) === H - 1) ? 'wall' : 'floor';
  TERRAIN[idxOf(DOOR)] = 'door';
  BENCH.forEach(function (n) { TERRAIN[idxOf(n)] = 'bench'; });
  BACK.forEach(function (n) { TERRAIN[idxOf(n)] = 'back'; });
  OBJECTS.forEach(function (o) { if (o.id === 'window') TERRAIN[o.ix[0]] = 'wall'; });

  var MOVE = { costPerStep: 0 }; // цена клетки в ходах: правил движения Алексей не называл (1.10), решат Механики; 0 = фишка идёт бесплатно

  function walkable(ix, who) { // who: 'hero' | 'host' | 'guard'
    if (BLOCK[ix] != null) return false;
    var t = TERRAIN[ix];
    if (t === 'wall') return false;
    if (t === 'back') return who === 'host';
    if (t === 'door') return who === 'guard';
    return true;
  }
  function zoneOf(ix) {
    var c = ix % W, r = Math.floor(ix / W) + 1;
    for (var k = 0; k < ZONES.length; k++) { var z = ZONES[k]; if (c >= z[1] && r >= z[2] && c <= z[3] && r <= z[4]) return z[0]; }
    return 'hall';
  }
  function cheb(a, b) { return Math.max(Math.abs(a % W - b % W), Math.abs(Math.floor(a / W) - Math.floor(b / W))); }
  function neighbors(ix, who) {
    var c = ix % W, r = Math.floor(ix / W), out = [];
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      var nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= W || nr >= H) continue;
      var n = nr * W + nc; if (!walkable(n, who)) continue;
      if (dr && dc && (BLOCK[r * W + nc] != null || BLOCK[nr * W + c] != null)) continue; // по диагонали сквозь угол мебели не ходят
      out.push(n);
    }
    return out;
  }
  // Кратчайшие пути от клетки from: { dist, prev } (занятые клетки — стены, кроме целей); occ — множество занятых
  function bfs(from, who, occ) {
    var dist = {}, prev = {}, q = [from]; dist[from] = 0;
    for (var h = 0; h < q.length; h++) {
      var cur = q[h];
      neighbors(cur, who).forEach(function (n) { if (dist[n] != null || (occ && occ[n])) return; dist[n] = dist[cur] + 1; prev[n] = cur; q.push(n); });
    }
    return { dist: dist, prev: prev };
  }
  function pathTo(res, to) { var p = [to]; while (res.prev[p[0]] != null) p.unshift(res.prev[p[0]]); return p; }
  // Свободные клетки рядом (≤1 по Чебышёву) с клетками цели cells, куда можно дойти из from; ближайшая первой. Нет — null.
  function nearCells(cells, from, who, occ) { // фигурки друг друга пропускают (протискиваются), но встать можно только в свободную клетку
    var res = bfs(from, who, null), best = null;
    var cand = {};
    cells.forEach(function (t) { for (var d = 0; d < W * H; d++) if (cheb(d, t) <= 1 && d !== t && walkable(d, who) && !(occ && occ[d]) && res.dist[d] != null && !(cells.indexOf(d) >= 0 && BLOCK[d] != null)) cand[d] = 1; });
    Object.keys(cand).map(Number).sort(function (a, b) { return res.dist[a] - res.dist[b] || a - b; }).forEach(function (d) { if (best == null) best = d; });
    return best == null ? null : { cell: best, path: pathTo(res, best) };
  }
  // Ближайшая свободная клетка зоны к якорю (для расстановки по сюжету); who — вид фигуры
  function freeInZone(zone, anchorIx, who, occ) {
    var best = null, bd = 1e9;
    for (var d = 0; d < W * H; d++) {
      if (!walkable(d, who) || (occ && occ[d]) || zoneOf(d) !== zone) continue;
      var k = cheb(d, anchorIx) * 100 + d;
      if (k < bd) { bd = k; best = d; }
    }
    return best;
  }
  function enc(ix) { return ix == null || ix < 0 ? '.' : ALPHA.charAt(ix); }
  function dec(ch) { var k = ALPHA.indexOf(ch); return k < 0 ? -1 : k; }

  CS.Grid = {
    W: W, H: H, COLS: COLS, ALPHA: ALPHA, OBJECTS: OBJECTS, OBJ: OBJ, BLOCK: BLOCK, TERRAIN: TERRAIN, ZONES: ZONES, ANCHOR: ANCHOR, HOME: HOME, MOVE: MOVE, DOOR: idxOf(DOOR),
    idx: idxOf, name: nameOf, walkable: walkable, zoneOf: zoneOf, cheb: cheb, neighbors: neighbors, bfs: bfs, path: pathTo, near: nearCells, freeInZone: freeInZone, enc: enc, dec: dec
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
