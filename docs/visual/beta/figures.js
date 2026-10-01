/* SVG-фигурки персонажей беты (шаг 4). Черновик, свой стиль под доску сценариста: плоские фигуры тёплых тонов, цвет героя — как в index.html.
   Каждая фигурка нарисована в сантиметрах: ноги на y=0, макушка на y=-рост, центр на x=0 — масштаб одинаков для всех, рост виден в пропорциях.
   Рост героев — слова Алексея 1.10 («Габ 190»; Эльф 180, Луциан 170, Нобби 150; «Габриэла тоже 190»). Рост хозяина, задиры, Лизарда и стражи
   каноном не задан — подобран под сцену (README). Внешность — по листам героев (docs/visual/img/*_sheet.webp), ничего не придумано сверх них.
   Реквизит (лук, копьё, щит) помечен prop: в рост не входит. Метки состояния — «ранен», «под столом», «оглушён» — рисуются в пикселях, не в сантиметрах. */
(function (root) {
  'use strict';
  var CS = root.CS = root.CS || {};
  var HEIGHT = { gab: 190, elf: 180, mage: 170, nobby: 150, host: 170, rowdy: 182, lizard: 178, guard: 178 };
  var COLOR = { gab: '#d0604a', elf: '#6fbf80', mage: '#7f9cf0', nobby: '#c095ee', host: '#9a8b72', rowdy: '#8a4a4a', lizard: '#c9a45c', guard: '#5a6a7a' };
  var LABEL = { gab: 'Габ / Габриэла', elf: 'Эллион', mage: 'Луциан / Луциания', nobby: 'Нобби', host: 'хозяин', rowdy: 'задира', lizard: 'капитан Лизард', guard: 'стража' };
  var ORDER = ['gab', 'elf', 'mage', 'nobby', 'host', 'rowdy', 'lizard', 'guard'];
  var SKIN = '#e2b88f', INK = '#1b1410';

  function mix(a, b, t) { var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), o = 0; for (var s = 16; s >= 0; s -= 8) { var x = (pa >> s) & 255, y = (pb >> s) & 255; o |= Math.round(x + (y - x) * t) << s; } return '#' + ('000000' + o.toString(16)).slice(-6); }
  function dark(c, t) { return mix(c, '#000000', t == null ? 0.4 : t); }
  function lite(c, t) { return mix(c, '#ffffff', t == null ? 0.3 : t); }
  function E(cx, cy, rx, ry, f, o) { return Object.assign({ k: 'e', cx: cx, cy: cy, rx: rx, ry: ry, f: f }, o); }
  function P(pts, f, o) { return Object.assign({ k: 'p', pts: pts, f: f }, o); }
  function R(x, y, w, h, rx, f, o) { return Object.assign({ k: 'r', x: x, y: y, w: w, h: h, rx: rx, f: f }, o); }
  function L(x1, y1, x2, y2, s, sw, o) { return Object.assign({ k: 'l', x1: x1, y1: y1, x2: x2, y2: y2, s: s, sw: sw }, o); }
  var PROP = { prop: true };

  // Общий остов: ориентиры и ноги/руки/голова. p: sh плечо, hip таз, wa талия (полуширины, см), arm толщина руки, rx/ry голова (доля роста)
  function frame(h, p) {
    var ry = (p.ry || 0.062) * h, rx = (p.rx || 0.052) * h, f = { h: h, ry: ry, rx: rx };
    f.hy = -h + (p.bald ? ry : 1.1 * ry); f.neck = f.hy + ry; f.sh = f.neck + 0.018 * h; f.hip = -0.5 * h; f.knee = -0.27 * h; f.foot = -0.035 * h; return f;
  }
  function legs(f, p, col, boot) {
    var s = [], hw = p.hip;
    [-1, 1].forEach(function (d) {
      var x0 = d < 0 ? -hw : hw * 0.08, w = hw * 0.92;
      s.push(R(x0, f.hip, w, f.foot - f.hip, 2, col));
      s.push(E(d * hw * 0.55, -0.025 * f.h, 0.05 * f.h, 0.025 * f.h, boot));
    });
    return s;
  }
  function torso(f, p, col) {
    var yw = f.sh + (f.hip - f.sh) * 0.5;
    return P([[-p.sh, f.sh], [p.sh, f.sh], [p.wa, yw], [p.hip, f.hip], [-p.hip, f.hip], [-p.wa, yw]], col);
  }
  function arms(f, p, col, hand, len) {
    var s = [], l = (len || 0.36) * f.h;
    [-1, 1].forEach(function (d) {
      var x0 = d < 0 ? -p.sh - p.arm : p.sh;
      s.push(R(x0, f.sh, p.arm, l, p.arm / 2, col));
      s.push(E(x0 + p.arm / 2, f.sh + l, p.arm * 0.62, p.arm * 0.7, hand));
    });
    return s;
  }
  function head(f, skin, extra) { return [E(0, f.hy, f.rx, f.ry, skin || SKIN)].concat(extra || []); }
  function eyes(f, g) { var y = f.hy + f.ry * 0.1, d = f.rx * 0.38; return [E(-d, y, 1.1, 1.3, INK), E(d, y, 1.1, 1.3, INK)]; }
  function hairCap(f, col, o) { // волосы только над линией лба: дуга сверху, чёлка выше глаз (раньше эллипс закрывал пол-лица, как маска)
    o = o || {}; var w = (o.w || 1.08) * f.rx, pts = [], a;
    for (a = 180; a <= 360; a += 15) pts.push([Math.cos(a * Math.PI / 180) * w, f.hy + Math.sin(a * Math.PI / 180) * 1.1 * f.ry]);
    pts.push([w * 0.97, f.hy - 0.05 * f.ry], [w * 0.7, f.hy - 0.5 * f.ry], [w * 0.3, f.hy - 0.38 * f.ry], [-w * 0.2, f.hy - 0.55 * f.ry], [-w * 0.6, f.hy - 0.42 * f.ry], [-w * 0.97, f.hy - 0.05 * f.ry]);
    return P(pts, col);
  }

  var BUILD = {
    // Габ / Габриэла, 190: русые волосы, меховой воротник, коричневый плащ, серо-синяя туника, щит за спиной, меч — в сундуке (на фигурке нет)
    gab: function (g) {
      var f = frame(190, { ry: 0.060, rx: 0.050 }), m = g === 'm', c = COLOR.gab, hair = '#9a6a3a', cloak = '#6b4a30',
        p = m ? { sh: 27, hip: 20, wa: 22, arm: 9.5 } : { sh: 23.5, hip: 19.5, wa: 17.5, arm: 8.6 }, s = [];
      s.push(E(24, f.sh + 40, 24, 24, '#8a6a42', { prop: true })); s.push(E(24, f.sh + 40, 7, 7, '#c9a45c', { prop: true })); // щит за спиной
      s.push(P([[-p.sh - 4, f.sh], [p.sh + 4, f.sh], [p.hip + 12, -0.12 * f.h], [-p.hip - 12, -0.12 * f.h]], cloak));
      s = s.concat(legs(f, p, '#4a3a2c', '#2a1e16'));
      s.push(torso(f, p, '#5d6b86'));
      s.push(R(-p.wa - 1, f.hip - 0.07 * f.h, 2 * p.wa + 2, 5, 1, dark(c, 0.15)));              // пояс цвета героя
      s = s.concat(arms(f, p, cloak, SKIN));
      s.push(P([[-p.sh - 6, f.sh - 2], [p.sh + 6, f.sh - 2], [p.sh + 3, f.sh + 15], [0, f.sh + 20], [-p.sh - 3, f.sh + 15]], '#a89878')); // меховой воротник
      if (!m) { s.push(E(f.rx + 6, f.hy + 5, 5.5, 10, hair)); s.push(E(f.rx + 9, f.hy + 21, 4.5, 11, hair)); s.push(E(f.rx + 10, f.hy + 36, 3.5, 8, hair)); } // хвост на плечо
      s = s.concat(head(f)); s.push(hairCap(f, hair)); s = s.concat(eyes(f));
      return s;
    },
    // Эллион, 180: серебристые волосы, острые уши, зелёный плащ с капюшоном, кремовое платье, лук в руке
    elf: function (g) {
      var f = frame(180, { ry: 0.060, rx: 0.048 }), m = g === 'm', c = COLOR.elf, cloak = dark(c, 0.45), hair = '#d8dce0',
        p = { sh: m ? 19 : 17.5, hip: 15, wa: m ? 14 : 12, arm: 7 }, s = [];
      s.push(P([[-p.sh - 3, f.sh], [p.sh + 3, f.sh], [p.hip + 20, -0.08 * f.h], [-p.hip - 20, -0.08 * f.h]], cloak));
      if (!m) s.push(P([[-10, f.neck], [10, f.neck], [24, -0.45 * f.h], [-24, -0.45 * f.h]], hair)); else s.push(P([[-9, f.neck], [9, f.neck], [13, f.sh + 14], [-13, f.sh + 14]], hair));
      s = s.concat(legs(f, p, '#5a4632', '#4a3424'));
      if (!m) s.push(P([[-p.wa, f.sh + 6], [p.wa, f.sh + 6], [p.hip + 22, -0.08 * f.h], [-p.hip - 22, -0.08 * f.h]], '#efe6d0')); // платье
      else s.push(torso(f, p, '#efe6d0'));
      s.push(R(-p.wa, f.hip - 0.09 * f.h, 2 * p.wa, 4, 1, '#7a5a3a'));
      s = s.concat(arms(f, p, cloak, SKIN, 0.34));
      s.push(L(-p.sh - 12, f.sh + 4, -p.sh - 12, -6, '#7a5a3a', 2.4, PROP)); s.push(L(-p.sh - 12, f.sh + 4, -p.sh - 3, f.sh + 30, '#7a5a3a', 1.6, PROP)); // лук
      s.push(P([[-p.sh - 9, f.sh + 2], [-p.sh - 9, f.sh + 26], [-p.sh - 18, f.sh + 14]], mix('#7a5a3a', '#000000', 0), PROP));
      s = s.concat(head(f));
      s.push(P([[-f.rx - 1, f.hy], [-f.rx - 9, f.hy - 7], [-f.rx + 1, f.hy - 4]], SKIN)); s.push(P([[f.rx + 1, f.hy], [f.rx + 9, f.hy - 7], [f.rx - 1, f.hy - 4]], SKIN)); // уши
      s.push(P([[-f.rx - 4, f.hy + 3], [-f.rx - 6, f.sh + 4], [f.rx + 6, f.sh + 4], [f.rx + 4, f.hy + 3], [0, f.hy - f.ry * 1.1]], cloak)); // капюшон на плечах
      s = s.concat(head(f)); s.push(P([[-f.rx, f.hy - f.ry * 0.2], [0, f.hy - f.ry * 1.1], [f.rx, f.hy - f.ry * 0.2], [f.rx * 0.5, f.hy - f.ry * 0.6]], hair)); s = s.concat(eyes(f));
      return s;
    },
    // Луциан / Луциания, 170: рыжие вихры, синяя латаная мантия, сумка через плечо и книга на цепочке
    mage: function (g) {
      var f = frame(170, { ry: 0.063, rx: 0.054 }), m = g === 'm', c = COLOR.mage, robe = dark(c, 0.35), hair = '#d9692a',
        p = { sh: m ? 20 : 18, hip: 17, wa: 17, arm: 8 }, s = [];
      s = s.concat(legs(f, p, '#4a3a2c', '#5a4030'));
      s.push(P([[-p.sh, f.sh], [p.sh, f.sh], [p.hip + 18, -0.06 * f.h], [-p.hip - 18, -0.06 * f.h]], robe));
      s.push(P([[-p.sh + 1, f.sh], [-p.sh + 7, f.sh], [p.sh + 1, f.hip + 6], [p.sh - 5, f.hip + 6]], '#7a5a3a'));  // ремень сумки
      s.push(R(p.sh - 8, f.hip - 4, 17, 17, 2, '#6b4a30')); s.push(R(p.sh - 5, f.hip - 1, 11, 9, 1, '#c9a45c'));    // сумка, книга
      s.push(R(-p.wa, f.hip - 0.06 * f.h, 2 * p.wa, 4, 1, '#7a5a3a'));
      s = s.concat(arms(f, p, robe, SKIN, 0.33));
      s.push(P([[-p.sh - 4, f.sh], [p.sh + 4, f.sh], [p.sh, f.sh + 12], [-p.sh, f.sh + 12]], lite(robe, 0.15)));      // капюшон за спиной
      s = s.concat(head(f));
      s.push(hairCap(f, hair, { w: 1.14 })); s.push(E(-f.rx * 0.7, f.hy - f.ry * 0.7, 6, 4, hair)); s.push(E(f.rx * 0.5, f.hy - f.ry * 0.72, 7, 4, hair));
      if (!m) s.push(P([[-f.rx - 2, f.hy - 4], [-f.rx - 5, f.hy + f.ry + 8], [-f.rx + 4, f.hy + f.ry + 4]], hair));      // длиннее прядь
      s = s.concat(eyes(f));
      return s;
    },
    // Нобби, 150: тёмные вихры, красный платок, тёмный жилет, перчатки с когтями
    nobby: function (g) {
      var f = frame(150, { ry: 0.068, rx: 0.056 }), m = g === 'm', c = COLOR.nobby, hair = '#2a2020', skin = '#c99a6e',
        p = { sh: m ? 16 : 14.5, hip: 13, wa: m ? 12 : 11, arm: 6.5 }, s = [];
      s = s.concat(legs(f, p, '#2b2626', '#3a2a22'));
      s.push(torso(f, p, '#4a3c3c')); s.push(P([[-p.sh + 3, f.sh], [-3, f.sh], [0, f.hip + 6], [-p.wa, f.hip + 6]], lite(c, 0.05)));
      s.push(R(-p.wa, f.hip - 4, 2 * p.wa, 3.5, 1, '#6a5040'));
      s = s.concat(arms(f, p, '#6a5348', skin, 0.34));
      [-1, 1].forEach(function (d) { var x = d * (p.sh + p.arm / 2), y = f.sh + 0.34 * f.h; s.push(E(x, y, p.arm * 0.7, p.arm * 0.8, '#3a2e2a')); [-2, 0, 2].forEach(function (k) { s.push(L(x + k * 2, y + 4, x + k * 2.5, y + 11, '#cfd3d8', 1.2, PROP)); }); }); // когти
      s.push(P([[-p.sh * 0.7, f.sh - 1], [p.sh * 0.7, f.sh - 1], [p.sh * 0.5, f.sh + 9], [0, f.sh + 15], [-p.sh * 0.5, f.sh + 9]], '#b8372f')); // платок
      s = s.concat(head(f, skin));
      s.push(hairCap(f, hair, { w: 1.14 })); s.push(P([[f.rx * 0.2, f.hy - f.ry * 1.05], [f.rx * 1.3, f.hy - f.ry * 0.7], [f.rx * 1.1, f.hy - f.ry * 0.1]], hair));
      if (!m) s.push(P([[f.rx * 0.9, f.hy - f.ry * 0.4], [f.rx * 1.6, f.hy + 6], [f.rx * 0.8, f.hy + 2]], hair));
      s = s.concat(eyes(f));
      return s;
    },
    // хозяин: круглый, простоватый, фартук и полотенце на плече
    host: function () {
      var f = frame(170, { ry: 0.066, rx: 0.060, bald: true }), c = COLOR.host, p = { sh: 22, hip: 21, wa: 22, arm: 9 }, s = [];
      s = s.concat(legs(f, p, '#4a3c30', '#3a2c22'));
      s.push(torso(f, p, '#7a6248'));
      s.push(P([[-p.wa + 2, f.sh + 12], [p.wa - 2, f.sh + 12], [p.hip, -0.1 * f.h], [-p.hip, -0.1 * f.h]], '#d8cfb8')); // фартук
      s = s.concat(arms(f, p, '#7a6248', '#d9a77f', 0.33));
      s.push(R(p.sh - 5, f.sh - 1, 9, 26, 2, '#efe8d8'));                                                              // полотенце
      s = s.concat(head(f, '#dba983'));
      s.push(E(-f.rx * 0.55, f.hy + f.ry * 0.35, 5, 3.4, '#d98a7a')); s.push(E(f.rx * 0.55, f.hy + f.ry * 0.35, 5, 3.4, '#d98a7a'));
      s.push(P([[-f.rx - 1, f.hy - 2], [-f.rx - 3, f.hy + 4], [-f.rx + 1, f.hy + 3]], '#8a7a66')); s.push(P([[f.rx + 1, f.hy - 2], [f.rx + 3, f.hy + 4], [f.rx - 1, f.hy + 3]], '#8a7a66')); // остатки волос
      s = s.concat(eyes(f));
      return s;
    },
    // задира: здоровый, небритый, красно-бурая рубаха
    rowdy: function () {
      var f = frame(182, { ry: 0.060, rx: 0.053 }), c = COLOR.rowdy, p = { sh: 26, hip: 20, wa: 22, arm: 10 }, s = [];
      s = s.concat(legs(f, p, '#3a3228', '#2a2018'));
      s.push(torso(f, p, c)); s.push(R(-p.wa, f.hip - 5, 2 * p.wa, 4, 1, '#2a2018'));
      s = s.concat(arms(f, p, mix(c, '#000000', 0.2), '#d9a77f', 0.34));
      s = s.concat(head(f, '#d9a77f'));
      s.push(hairCap(f, '#2a2218', { w: 1.08 })); s.push(P([[-f.rx * 0.9, f.hy + f.ry * 0.35], [f.rx * 0.9, f.hy + f.ry * 0.35], [f.rx * 0.6, f.hy + f.ry * 0.95], [-f.rx * 0.6, f.hy + f.ry * 0.95]], '#7a6450')); // щетина только на подбородке
      s.push(L(-f.rx * 0.6, f.hy - f.ry * 0.12, -f.rx * 0.15, f.hy - f.ry * 0.02, INK, 1.4)); s.push(L(f.rx * 0.15, f.hy - f.ry * 0.02, f.rx * 0.6, f.hy - f.ry * 0.12, INK, 1.4)); // хмурые брови
      s = s.concat(eyes(f));
      return s;
    },
    // капитан Лизард — человек: тёмно-синий мундир с золотом, фуражка, закрученные усы
    lizard: function () {
      var f = frame(178, { ry: 0.060, rx: 0.050 }), c = COLOR.lizard, p = { sh: 22, hip: 18, wa: 17, arm: 8.2 }, s = [], coat = '#2e3a56';
      s = s.concat(legs(f, p, '#262c3c', '#14100c'));
      s.push(torso(f, p, coat)); s.push(R(-3, f.sh + 4, 6, f.hip - f.sh - 4, 1, c)); s.push(R(-p.wa, f.hip - 5, 2 * p.wa, 4, 1, c));   // планка и пояс
      s = s.concat(arms(f, p, coat, SKIN, 0.35));
      s.push(R(-p.sh - 3, f.sh - 1, 12, 5, 1, c)); s.push(R(p.sh - 9, f.sh - 1, 12, 5, 1, c));                                         // эполеты
      s = s.concat(head(f));
      s.push(R(-f.rx * 1.12, f.hy - f.ry * 1.1, f.rx * 2.24, f.ry * 0.62, 3, coat));                                                    // фуражка
      s.push(R(-f.rx * 1.2, f.hy - f.ry * 0.55, f.rx * 2.4, 2.4, 1, '#14100c'));
      s.push(E(0, f.hy - f.ry * 0.8, 3, 3, c));
      s.push(P([[-1, f.hy + f.ry * 0.38], [-f.rx * 1.05, f.hy + f.ry * 0.3], [-f.rx * 1.25, f.hy + f.ry * 0.05], [-f.rx * 0.9, f.hy + f.ry * 0.5]], '#3a2a1c')); // усы
      s.push(P([[1, f.hy + f.ry * 0.38], [f.rx * 1.05, f.hy + f.ry * 0.3], [f.rx * 1.25, f.hy + f.ry * 0.05], [f.rx * 0.9, f.hy + f.ry * 0.5]], '#3a2a1c'));
      s = s.concat(eyes(f));
      return s;
    },
    // стража: шлем, серо-синий табард, копьё
    guard: function () {
      var f = frame(178, { ry: 0.060, rx: 0.050 }), c = COLOR.guard, p = { sh: 24, hip: 19, wa: 20, arm: 9 }, s = [];
      s.push(L(30, 0, 30, -h2() - 22, '#7a5a3a', 2.4, PROP)); s.push(P([[30, -h2() - 22], [26, -h2() - 8], [34, -h2() - 8]], '#cfd3d8', PROP));    // копьё
      s = s.concat(legs(f, p, '#3a4048', '#1c1814'));
      s.push(torso(f, p, c)); s.push(R(-p.wa, f.hip - 4, 2 * p.wa, 4, 1, '#2a2018'));
      s.push(P([[-p.wa + 3, f.sh + 6], [p.wa - 3, f.sh + 6], [p.wa - 5, f.hip + 6], [-p.wa + 5, f.hip + 6]], lite(c, 0.18)));                      // табард
      s = s.concat(arms(f, p, dark(c, 0.15), SKIN, 0.35));
      s = s.concat(head(f));
      s.push(P([[-f.rx * 1.1, f.hy + 2], [-f.rx * 1.05, f.hy - f.ry * 0.7], [0, f.hy - f.ry * 1.1], [f.rx * 1.05, f.hy - f.ry * 0.7], [f.rx * 1.1, f.hy + 2], [f.rx * 0.8, f.hy + 2], [f.rx * 0.8, f.hy - f.ry * 0.3], [-f.rx * 0.8, f.hy - f.ry * 0.3], [-f.rx * 0.8, f.hy + 2]], '#aeb4bc')); // шлем
      s = s.concat(eyes(f));
      return s;
      function h2() { return 178; }
    }
  };

  // ---- рамка по данным (без реквизита) ---------------------------------------------------
  function bboxOf(shapes, withProps) {
    var b = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
    function add(x, y) { b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y); }
    shapes.forEach(function (s) {
      if (s.prop && !withProps) return;
      if (s.k === 'e') { add(s.cx - s.rx, s.cy - s.ry); add(s.cx + s.rx, s.cy + s.ry); }
      else if (s.k === 'p') s.pts.forEach(function (q) { add(q[0], q[1]); });
      else if (s.k === 'r') { add(s.x, s.y); add(s.x + s.w, s.y + s.h); }
      else if (s.k === 'l') { add(s.x1, s.y1); add(s.x2, s.y2); }
    });
    return b;
  }
  function flat(a, out) { out = out || []; a.forEach(function (x) { if (Array.isArray(x)) flat(x, out); else out.push(x); }); return out; }
  function shapes(id, g) { return flat(BUILD[id](g || 'm')); }
  function n(v) { return Math.round(v * 100) / 100; }
  function shapeSVG(s, K) {
    var st = ' stroke="' + INK + '" stroke-opacity=".55" stroke-width="' + n(0.9 / K) + '"';
    if (s.k === 'e') return '<ellipse cx="' + n(s.cx) + '" cy="' + n(s.cy) + '" rx="' + n(s.rx) + '" ry="' + n(s.ry) + '" fill="' + s.f + '"' + st + '/>';
    if (s.k === 'p') return '<polygon points="' + s.pts.map(function (q) { return n(q[0]) + ',' + n(q[1]); }).join(' ') + '" fill="' + s.f + '"' + st + ' stroke-linejoin="round"/>';
    if (s.k === 'r') return '<rect x="' + n(s.x) + '" y="' + n(s.y) + '" width="' + n(s.w) + '" height="' + n(s.h) + '" rx="' + n(s.rx) + '" fill="' + s.f + '"' + st + '/>';
    return '<line x1="' + n(s.x1) + '" y1="' + n(s.y1) + '" x2="' + n(s.x2) + '" y2="' + n(s.y2) + '" stroke="' + s.s + '" stroke-width="' + n(s.sw) + '" stroke-linecap="round"/>';
  }
  // Метки состояния — в пикселях, над головой / поверх фигурки; k — пикселей на сантиметр, hpx — рост в пикселях
  function markSVG(kind, id, hpx) {
    var cid = ' id="mark-' + kind + '-' + id + '" class="mark mark-' + kind + '"';
    if (kind === 'wound') return '<g' + cid + ' transform="translate(9,' + n(-hpx * 0.62) + ')"><circle r="4.6" fill="#c0392b" stroke="#fff" stroke-width="1"/><path d="M-2.6,0H2.6M0,-2.6V2.6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></g>';
    if (kind === 'stun') return '<g' + cid + ' transform="translate(0,' + n(-hpx - 5) + ')" fill="#f5d04a" stroke="#7a5a10" stroke-width=".5"><path d="M-7,0 l1.1,2.2 2.4,.3 -1.8,1.7 .5,2.4 -2.2,-1.2 -2.2,1.2 .5,-2.4 -1.8,-1.7 2.4,-.3z" transform="translate(0,-1)"/><path d="M0,-5 l1.1,2.2 2.4,.3 -1.8,1.7 .5,2.4 -2.2,-1.2 -2.2,1.2 .5,-2.4 -1.8,-1.7 2.4,-.3z"/><path d="M7,0 l1.1,2.2 2.4,.3 -1.8,1.7 .5,2.4 -2.2,-1.2 -2.2,1.2 .5,-2.4 -1.8,-1.7 2.4,-.3z" transform="translate(0,-1)"/></g>';
    if (kind === 'hide') return '<g' + cid + '><rect x="-13" y="' + n(-hpx * 0.46) + '" width="26" height="5" rx="1.5" fill="#7a5430" stroke="#2a1a0c" stroke-width=".6"/><rect x="-11" y="' + n(-hpx * 0.46 + 5) + '" width="2.4" height="' + n(hpx * 0.46 - 5) + '" fill="#5a3c20"/><rect x="8.6" y="' + n(-hpx * 0.46 + 5) + '" width="2.4" height="' + n(hpx * 0.46 - 5) + '" fill="#5a3c20"/></g>';
    return '';
  }

  // Фигурка как SVG-группа с id. opt: x, y (ноги), k (пикселей на сантиметр, по умолчанию 0.232 = 44 px на 190 см), g (пол), marks, pc, label, color
  function svg(id, opt) {
    opt = opt || {}; var h = HEIGHT[id], K = opt.k || 0.232, g = opt.g || 'm', col = opt.color || COLOR[id], marks = opt.marks || [], hpx = h * K, uid = opt.uid || id;
    var body = shapes(id, g).map(function (s) { return shapeSVG(s, K); }).join('');
    var hid = marks.indexOf('hide') >= 0;
    var ring = '<ellipse cx="0" cy="0" rx="' + n(opt.pc ? 17 : 14) + '" ry="' + n(opt.pc ? 6 : 5) + '" fill="' + col + '" fill-opacity="' + (opt.pc ? 0.55 : 0.4) + '" stroke="' + (opt.pc ? '#fff' : col) + '" stroke-width="' + (opt.pc ? 1.4 : 0.8) + '"/>';
    var mk = marks.map(function (m) { return markSVG(m, uid, hpx); }).join('');
    return '<g id="fig-' + uid + '" class="figure" data-fig="' + id + '" data-h="' + h + '" data-g="' + g + '" data-k="' + K + '" data-px="' + n(hpx) + '" transform="translate(' + n(opt.x || 0) + ',' + n(opt.y || 0) + ')">' +
      ring + '<g class="body" transform="scale(' + K + ')"' + (hid ? ' opacity=".55"' : '') + '>' + body + '</g>' + mk +
      (opt.label ? '<text class="nm" y="' + n(hpx * -1 - 2) + '" text-anchor="middle">' + opt.label + '</text>' : '') + '</g>';
  }

  CS.Figs = { HEIGHT: HEIGHT, COLOR: COLOR, LABEL: LABEL, ORDER: ORDER, shapes: shapes, bbox: function (id, g, withProps) { return bboxOf(shapes(id, g), withProps); }, svg: svg, mark: markSVG, mix: mix };
})(typeof globalThis !== 'undefined' ? globalThis : this);
