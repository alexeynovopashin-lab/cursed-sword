/* Движок беты «Таверна» (серия 1, черновик).
   Состояние — простой JSON: его можно снимать, откатывать и сравнивать.
   Механика — упрощённая D&D (d20 + модификатор против порога). Игрок видит историю;
   числа, разбор и изменения мира уходят в запись хода для панели движка. */
(function (root) {
  'use strict';
  var CS = root.CS = root.CS || {};

  // ---- герои ------------------------------------------------------------
  var HEROES = {
    gab:   { role: 'мечник',  names: { m: 'Габриэль', f: 'Габриэла' }, short: 'Габ',    def: 'm', hp: 14, mods: { str: 4, dex: 1, int: 0, cha: 0 }, weapon: 'sword', color: '#d0604a' },
    elf:   { role: 'лучник',  names: { m: 'Эллион',   f: 'Эллион' },   short: 'Эллион', def: 'm', hp: 9,  mods: { str: 0, dex: 4, int: 1, cha: 1 }, weapon: 'bow',   color: '#6fbf80' },
    mage:  { role: 'маг',     names: { m: 'Луциан',   f: 'Луциания' }, short: null,     def: 'm', hp: 8,  mods: { str: -1, dex: 0, int: 3, cha: 1 }, weapon: 'knife', color: '#7f9cf0' },
    nobby: { role: 'вор',     names: { m: 'Нобби',    f: 'Нобби' },    short: 'Нобби',  def: 'm', hp: 7,  mods: { str: -1, dex: 4, int: 0, cha: 1 }, weapon: 'knife', color: '#c095ee' }
  };
  var ORDER = ['gab', 'elf', 'mage', 'nobby'];
  var PLACES = { door: 'у двери', hall: 'в зале', corner: 'в углу', bar: 'у стойки' };
  var PLACE_OF = { hall: 'hall', corner: 'corner', door: 'door', chest: 'door', window: 'hall', hearth: 'hall', stool: 'hall', tables: 'hall', mug: 'hall', fork: 'hall', floor: 'hall', wall: 'hall', bar: 'bar', barrel: 'bar', milk: 'bar', table: 'corner', beer: 'bar', crumbs: 'bar' };
  var NAMES = {
    door: 'дверь', chest: 'сундук', sword: 'меч', knife: 'нож', bow: 'лук', claws: 'перчатки с когтями', purse: 'кошелёк', coins: 'золотой',
    book: 'книга на цепочке', mug: 'кружка', beer: 'пиво', milk: 'миска молока', fork: 'вилка', stool: 'табурет', table: 'большой дубовый стол',
    tables: 'столики', bar: 'стойка', barrel: 'бочка', hearth: 'очаг', window: 'окно', floor: 'пол', wall: 'стена', snow: 'улица', cloak: 'одежда',
    crumbs: 'закуска', rumor: 'разговоры', weapon: 'оружие', host: 'хозяин', rowdy: 'задира', lizard: 'капитан Лизард', guard: 'стража', crowd: 'посетители',
    gab: 'Габ', elf: 'Эллион', mage: 'маг', nobby: 'Нобби', self: 'ты'
  };
  var ITEM_ICON = { sword: 'меч', knife: 'нож', bow: 'лук', mug: 'кружка', fork: 'вилка', stool: 'табурет', milk: 'миска молока', coins: 'золотой', purse: 'кошелёк', book: 'книга', chest: 'сундук', table: 'стол' };

  // ---- утилиты -----------------------------------------------------------
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function rngNext(S) { // mulberry32
    S.rng = (S.rng + 0x6D2B79F5) >>> 0;
    var t = S.rng; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function flatten(o, pre, out) {
    out = out || {}; pre = pre || '';
    if (o && typeof o === 'object') {
      if (Array.isArray(o)) { out[pre] = JSON.stringify(o); return out; }
      Object.keys(o).forEach(function (k) { flatten(o[k], pre ? pre + '.' + k : k, out); });
    } else out[pre] = o;
    return out;
  }
  var DIFF_SKIP = { rng: 1, turn: 1 };
  function diffState(a, b) {
    var fa = flatten(a), fb = flatten(b), out = [];
    Object.keys(fb).forEach(function (k) {
      if (DIFF_SKIP[k]) return;
      if (fa[k] !== fb[k]) out.push({ path: k, from: fa[k], to: fb[k] });
    });
    return out;
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // ---- игра --------------------------------------------------------------
  function Game(cfg) { this.cfg = cfg || {}; this.reset(); }

  Game.prototype.reset = function (keepSeed) {
    var c = this.cfg, g = {};
    ORDER.forEach(function (h) { g[h] = (c.genders && c.genders[h]) || HEROES[h].def; });
    var seed = c.seed != null ? c.seed : ((Math.random() * 4294967296) >>> 0);
    this.cfg.seed = seed;
    var pc = c.pc || 'gab';
    var S = {
      rng: seed >>> 0, turn: 0, phase: 'evening', pc: pc, genders: g, names: c.names || {},
      at: 'corner', held: null, last: null, pending: null, queue: [], ended: false,
      t: 0, beat: 0, sub: 0,
      inv: [], armed: false, weaponIn: false,
      hp: { gab: 14, elf: 9, mage: 8, nobby: 7 }, mana: 3, hidden: false, shield: false,
      pos: { gab: 'corner', elf: 'hall', mage: 'door', nobby: 'hall', lizard: 'hall', rowdy: 'hall', host: 'bar' },
      w: {
        door: { open: false, prop: 0, bolt: false },
        chest: { at: 'door', lid: false, has: ['sword'] },
        stools: 6, mugs: 8, forks: 5, milk: 'bar', purse: 'gab', book: 'mage', tableUp: false,
        lizard: { hp: 10, wet: 0, moustache: false, milk: false, fork: false, table: false, down: false },
        rowdy: { hp: 8, down: false, gone: false, mood: 0 },
        host: { mood: 0, cudgel: false },
        guards: false
      },
      b: { round: 0, ally: 0, guardsAt: 5, done: {}, held: null, sigQueue: [] },
      f: {}
    };
    if (pc === 'gab') { S.inv = []; S.armed = false; S.weaponIn = true; S.at = 'corner'; S.phase = 'evening'; S.w.chest.has = ['sword']; S.w.purse = 'gab'; }
    else {
      S.phase = 'door'; S.at = 'door'; S.armed = true; S.pos[pc] = 'door';
      S.inv = [HEROES[pc].weapon];
      if (pc === 'nobby') S.inv.push('claws');
      if (pc === 'elf') S.inv.push('coins');
      if (pc === 'mage') S.inv.push('book');
      S.w.chest.has = ['sword'];
      if (pc === 'mage') S.pos.mage = 'door';
    }
    if (pc === 'gab') S.inv = ['purse'];
    this.S = S; this.history = []; this.turns = []; this.log = [];
    this.trace = null;
    this.intro = this.buildIntro();
  };

  // ---- имена и шаблоны ---------------------------------------------------
  Game.prototype.gname = function (h) {
    var S = this.S; if (S.names[h]) return S.names[h];
    if (h === 'gab') return 'Габ';
    if (h === 'elf') return 'Эллион';
    return HEROES[h].names[S.genders[h]];
  };
  Game.prototype.T = function (str) {
    var S = this.S, self = this;
    var map = { g: 'gab', e: 'elf', l: 'mage', n: 'nobby', p: S.pc };
    str = str.replace(/\{([gelnp]):([^|}]*)\|([^}]*)\}/g, function (m, k, a, b) { return S.genders[map[k]] === 'f' ? b : a; });
    str = str.replace(/%(gab|elf|mage|nobby|pc)([+~])?%/g, function (m, k, c) { return self.decl(k === 'pc' ? S.pc : k, c); });
    return str;
  };
  Game.prototype.decl = function (h, c) { // + винительный/родительный, ~ дательный
    var n = this.gname(h), S = this.S; if (!c || h === 'nobby') return n;
    if (n === 'Габ') return c === '+' ? 'Габа' : 'Габу';
    if (n === 'Эллион') return c === '+' ? 'Эллиона' : 'Эллиону';
    if (n === 'Луциан') return c === '+' ? 'Луциана' : 'Луциану';
    if (n === 'Луциания') return c === '+' ? 'Луцианию' : 'Луциании';
    if (n === 'Габриэль') return c === '+' ? 'Габриэля' : 'Габриэлю';
    if (n === 'Габриэла') return c === '+' ? 'Габриэлу' : 'Габриэле';
    return n;
  };
  Game.prototype.isPC = function (h) { return this.S.pc === h; };
  Game.prototype.pick = function (arr) { return arr[Math.floor(rngNext(this.S) * arr.length)]; };

  // ---- броски (простая D&D) ---------------------------------------------
  Game.prototype.roll = function (label, hero, stat, dc, opt) {
    opt = opt || {};
    var S = this.S, die, note = [];
    if (hero === 'elf' && opt.attack && !S.f.elfMissed) { die = 18 + Math.floor(rngNext(S) * 3); note.push('до встречи с мечом кубик эльфийки 18–20'); }
    else die = 1 + Math.floor(rngNext(S) * 20);
    var mod = (HEROES[hero] ? HEROES[hero].mods[stat] || 0 : 0) + (opt.bonus || 0);
    if (opt.adv) { var d2 = 1 + Math.floor(rngNext(S) * 20); note.push('преимущество: ' + die + '/' + d2); die = Math.max(die, d2); }
    var total = die + mod, r = { label: label, hero: hero, stat: stat, die: die, mod: mod, dc: dc, total: total, ok: total >= dc || die === 20, crit: die === 20, fumble: die === 1, note: note.join('; ') };
    if (die === 1) r.ok = false;
    if (opt.bonusWhy) r.bonusWhy = opt.bonusWhy;
    this.rolls.push(r); return r;
  };
  // бросок, который по сюжету удаётся при любом кубике: в панели «по сюжету», а не «провал»
  Game.prototype.story = function (r, why) {
    r.ok = true; r.forced = true; r.fumble = false; r.crit = false;
    r.note = (r.note ? r.note + '; ' : '') + 'кубик не решает: по сюжету ' + why;
    return r;
  };
  // действие без броска (навык героя): строка в панели «без броска», кубика нет
  Game.prototype.auto = function (label, why) {
    this.rolls.push({ label: label, auto: true, die: null, mod: null, dc: null, total: null, ok: true, note: why });
  };
  Game.prototype.dmg = function (label, sides, bonus) {
    var n = 1 + Math.floor(rngNext(this.S) * sides);
    this.rolls.push({ label: label, die: n, mod: bonus || 0, dc: null, total: n + (bonus || 0), dmg: true, sides: sides });
    return Math.max(0, n + (bonus || 0));
  };

  // ---- вступление --------------------------------------------------------
  Game.prototype.buildIntro = function () {
    var S = this.S, T = this.T.bind(this), t;
    if (S.pc === 'gab') {
      t = 'Винтербург, первый иней. Таверна гудит, и, похоже, это будет самый весёлый вечер года. Только в углу один пьёт — ты. Меч, как у всех, лежит в зачарованном сундуке у двери. За соседним столом шепчут:\n— Это Проклятый Меч. Кто с ним пошёл — не вернулся.\nПрошли годы. Был отряд. Отряда нет. Есть таверна в Винтербурге и кружка.';
    } else if (S.pc === 'elf') {
      t = 'Дорога ведёт в человеческий город Винтербург. Говорят, там варят пиво, от которого даже гномы поют. Кошелёк полон — повод угощать всех.\nДверь таверны. За ней гудит зал. У порога — большой сундук, а рядом хозяин, и вид у него такой, будто он говорит это каждому.\n— Оружие — в сундук. Достать сможет только тот, кто положил. И не забудьте забрать свои вещи на выходе: с каждым годом сундук тяжелеет.';
    } else if (S.pc === 'mage') {
      t = 'Если это пророчество, то тебя ждёт избранный. Если несварение — таверна тоже подойдёт. Снег на крыше, слово «Винтербург» — всё как в видении. Ты у двери таверны.\nУ порога — большой сундук, а рядом хозяин.\n— Оружие — в сундук. Достать сможет только тот, кто положил. И не забудьте забрать свои вещи на выходе: с каждым годом сундук тяжелеет.';
    } else {
      t = 'Вечер. Голодно. В таверне гуляет эльф{e:ийка|ийка} и угощает всех. А в углу один пьёт кто-то с мечом и очень полным кошельком.\nТы на пороге. У двери — большой сундук, рядом хозяин.\n— Оружие — в сундук. Достать сможет только тот, кто положил. И не забудьте забрать свои вещи на выходе: с каждым годом сундук тяжелеет.';
    }
    return T(t);
  };

  // ---- ход ---------------------------------------------------------------
  Game.prototype.input = function (text) {
    var before = clone(this.S), rec = { n: this.turns.length + 1, input: text, text: [], rolls: [], trace: null, diff: [], phaseFrom: this.S.phase };
    this.rolls = rec.rolls; this.out = rec.text; this.cost = 0; this.mark = null; this.acted = 0;
    var S = this.S;
    var p = CS.parse(text);
    rec.trace = { meta: p.meta, clauses: [], unknown: p.unknown.slice(), corrections: p.corrections };
    var self = this;

    if (S.ended) { this.say('Серия закончилась. Можно откатиться на любой ход или начать заново.'); return this.finish(rec, before, true); }

    if (p.meta) {
      this.meta(p.meta, rec);
    } else if (!p.clauses.length) {
      this.say(this.pick(['Ты молчишь, и таверна молчит в ответ. (Напиши, что делаешь.)', 'Пустая строка — не действие. Напиши, что делаешь: «беру кружку», «иду к стойке».']));
    } else {
      var clauses = p.clauses.slice(), carried = null, prevVerb = null, prevObj = null;
      // очередь «дальше»
      var done = 0;
      for (var i = 0; i < clauses.length; i++) {
        if (done >= 3) {
          S.queue = clauses.slice(i).map(function (c) { return c.raw; });
          this.say('(Три действия за ход — больше не успеть. Осталось: «' + S.queue.join(', ') + '». Напиши «дальше», если ещё нужно.)');
          break;
        }
        var c = clauses[i], tr = { text: c.raw, verb: c.verb, args: c.args.map(function (a) { return a.role + ':' + a.id; }), neg: c.neg, resolved: null, note: '' };
        rec.trace.clauses.push(tr);
        if (c.neg && c.verb) { tr.note = 'отрицание — действие пропущено'; this.say(this.pick(['Ты решаешь не торопиться.', 'Нет так нет.'])); continue; }
        var res = this.execClause(c, tr, prevVerb, prevObj);
        if (res && res.done) { done++; prevVerb = res.verb || prevVerb; if (res.obj) prevObj = res.obj; }
        if (this.mark === 'stop') break;
      }
    }
    // вопрос без ответа хранится до следующего хода
    return this.finish(rec, before);
  };

  Game.prototype.finish = function (rec, before, skipTick) {
    var S = this.S;
    if (this.cost > 0 && !skipTick && !S.ended) this.tick();
    if (this.cost > 0 || this.acted) S.turn++;
    rec.diff = diffState(before, this.S);
    rec.phaseTo = S.phase; rec.ended = S.ended;
    this.history.push({ before: JSON.stringify(before), rec: rec });
    this.turns.push(rec);
    return rec;
  };

  Game.prototype.say = function (s) { this.out.push(this.T(s)); };
  Game.prototype.spend = function (n) { this.cost = Math.max(this.cost, n == null ? 1 : n); this.acted++; };

  // ---- откат и перезапуск -----------------------------------------------
  Game.prototype.rollback = function (n) { // вернуть состояние до хода n (1-based); ходы n… удаляются
    if (n < 1 || n > this.history.length) return false;
    this.S = JSON.parse(this.history[n - 1].before);
    this.history = this.history.slice(0, n - 1); this.turns = this.turns.slice(0, n - 1);
    return true;
  };
  Game.prototype.restart = function (newSeed) {
    if (newSeed) this.cfg.seed = (Math.random() * 4294967296) >>> 0; this.reset(true);
  };

  // ---- мета-команды ------------------------------------------------------
  Game.prototype.meta = function (m, rec) {
    var S = this.S;
    if (m === 'help') return this.say(this.hints());
    if (m === 'inv') return this.say(this.invText());
    if (m === 'look') return this.look(null);
    if (m === 'ack') {
      if (S.queue.length) { var q = S.queue.join(', '); S.queue = []; this.say('Ты продолжаешь: «' + q + '».'); var sub = CS.parse(q); var self = this; var d = 0;
        sub.clauses.forEach(function (c) { if (d >= 3) return; var tr = { text: c.raw, verb: c.verb, args: c.args.map(function (a) { return a.role + ':' + a.id; }), note: 'из очереди' }; rec.trace.clauses.push(tr); if (self.execClause(c, tr).done) d++; });
        return; }
      if (S.pending) return this.say(S.pending.ask);
      this.spend(1); return this.say('Ты ждёшь и смотришь по сторонам.');
    }
    if (m === 'debug') return this.say('(Панель движка включается кнопкой справа сверху.)');
    if (m === 'restart') return this.say('(Перезапуск — кнопка «Сцена заново» в панели.)');
  };

  Game.prototype.hints = function () {
    var S = this.S, h = S.pc;
    var base = 'Пиши, что делаешь, своими словами: «толкаю дверь, беру сундук и подпираю». Можно цепочкой — до трёх действий за ход.';
    var ex = {
      gab: '«иду к стойке», «беру стол», «закрываюсь столом», «бью капитана табуреткой».',
      elf: '«кладу лук в сундук», «угощаю всех», «бросаю вилку в капитана», «прячусь под стол».',
      mage: '«кладу нож в сундук», «подсаживаюсь к меченосцу», «жгу усы капитану», «лечу Габа».',
      nobby: '«кладу нож в сундук», «жду», «срезаю кошелёк», «швыряю миску молока в капитана».'
    }[h];
    var ph = { door: ' Сначала правило таверны: оружие — в сундук.', evening: ' Пока вечер — присмотрись, послушай, поговори.', brawl: ' Сейчас драка: у каждого свой приём.', arrest: ' Стража. Что скажешь?' }[S.phase] || '';
    return base + ' Примеры: ' + ex + ph + ' Ещё: «осмотреться», «что у меня».';
  };
  Game.prototype.invText = function () {
    var S = this.S, arr = [];
    S.inv.forEach(function (i) { arr.push(NAMES[i] || i); });
    var t = arr.length ? 'При тебе: ' + arr.join(', ') + '.' : 'При тебе ничего нет.';
    if (S.held) t += ' В руках: ' + (NAMES[S.held] || S.held) + '.';
    if (S.weaponIn) t += ' Оружие — в сундуке у двери.';
    return t;
  };

  // ---- разбор клаузы в действие -----------------------------------------
  Game.prototype.resolveId = function (id) {
    var S = this.S;
    if (id === '@it') return S.last;
    if (id === 'guard' && !S.w.guards) return 'lizard';
    if (id === S.pc) return 'self';
    return id;
  };
  Game.prototype.slots = function (c) {
    var self = this, S = this.S, A = { item: null, item2: null, person: null, target: null, dst: null, src: null, with: null, behind: null, company: null, self: false, raw: c.args, speech: c.speech, manner: c.manner };
    c.args.forEach(function (a) {
      var id = self.resolveId(a.id); if (!id) return;
      if (id === 'self') { A.self = true; return; }
      var isP = id === 'host' || id === 'rowdy' || id === 'lizard' || id === 'guard' || id === 'crowd' || ORDER.indexOf(id) >= 0;
      var r = a.role;
      if (isP) {
        if (r === 'with') A.company = id;
        else if (r === 'in' || r === 'on' || r === 'to' || r === 'near') { A.target = A.target || id; }
        else if (r === 'from') A.src = id;
        else if (!A.person) A.person = id; else A.target = A.target || id;
      } else {
        if (r === 'with') A.with = A.with || id;
        else if (r === 'in' || r === 'on' || r === 'to' || r === 'near' || r === 'through') { A.dst = A.dst || id; }
        else if (r === 'from') A.src = A.src || id;
        else if (r === 'behind' || r === 'under') A.behind = A.behind || id;
        else if (!A.item) A.item = id; else A.item2 = A.item2 || id;
      }
    });
    // наблюдатель — сам игрок: «маг жжёт» — лишний субъект
    if (A.person === S.pc) A.person = null;
    return A;
  };

  Game.prototype.execClause = function (c, tr, prevVerb, prevObj) {
    var S = this.S, verb = c.verb, A = this.slots(c);
    // у глагола нет — наследуем от предыдущего действия / замены / ожидающего вопроса
    if (!verb) {
      if (c.replaces && c.replaces.verb) verb = c.replaces.verb;
      else if (S.pending && (A.item || A.person || A.with || A.dst)) verb = S.pending.verb;
      else if (prevVerb && (c.args.length)) verb = prevVerb;
      if (verb) tr.note = 'глагол взят из контекста: ' + verb;
    }
    if (S.pending && S.pending.verb === verb) { // дополняем прежний вопрос
      var P = S.pending.A; ['item', 'person', 'target', 'dst', 'with'].forEach(function (k) { if (!A[k] && P[k]) A[k] = P[k]; }); S.pending = null;
    } else if (S.pending && verb && verb !== S.pending.verb) S.pending = null;
    if (c.pre === 'go' && verb === 'take' && !A.item) { /* «иду брать» */ }
    if (verb === 'fight') verb = 'hit';
    if (verb === 'close' && (A.self || A.person) && !A.item && !A.dst) verb = 'cover';
    if (verb === 'push' && A.person) verb = 'shove';
    if (verb === 'climb' && A.behind && !A.dst) verb = 'hide';
    if (verb === 'use' && (A.person || A.target) && (A.item === 'milk' || (!A.item && S.held === 'milk'))) { A.item = 'milk'; A.target = A.target || A.person; verb = 'pour'; }
    else if (verb === 'use' && (A.person || A.target) && S.held && !A.item) { A.item = S.held; A.target = A.target || A.person; verb = 'throw'; }
    if (S.phase === 'arrest' && !S.ended && CALM_WORDS.test(c.raw || '')) { verb = 'wait'; tr.note = 'арест: жест покорности по словам'; }
    if (!verb) {
      tr.note = 'глагол не найден';
      var known = c.args.map(function (a) { var rid = this.resolveId(a.id); return rid ? (NAMES[rid] || rid) : null; }, this).filter(Boolean);
      if (!known.length && c.args.length) this.say('Про кого или про что ты? Назови, например, «капитана» или «дверь».');
      else if (known.length) { this.say('«' + cap(known[0]) + '»… и что ты хочешь с этим сделать?'); S.last = this.resolveId(c.args[0].id) || S.last; S.pending = { verb: null, A: A, ask: 'Что сделать?' }; }
      else this.say(this.pick(['Не понял{p:|а} тебя. Скажи иначе — например, «беру кружку» или «иду к стойке».', 'Это слишком загадочно даже для таверны. Опиши действие проще: что делаешь и с чем.']));
      return { done: false };
    }
    if (S.phase === 'arrest' && !S.ended && verb !== 'look' && verb !== 'inv') return this.arrestAct(verb, A, c, tr);
    // цель по умолчанию
    tr.resolved = { verb: verb, item: A.item, person: A.person, target: A.target, dst: A.dst, with: A.with, src: A.src };
    var h = this['h_' + verb];
    if (!h) { tr.note += ' (нет обработчика)'; this.say('Ты пробуешь: «' + c.raw + '» — но таверна не понимает, что это значит.'); return { done: false }; }
    var r = h.call(this, A, c, tr) || {};
    if (A.item) S.last = A.item; else if (A.person) S.last = A.person; else if (A.dst) S.last = A.dst;
    return { done: r.ok !== false && !r.refuse, verb: verb, obj: A.item || A.person };
  };

  // ---- перемещение -------------------------------------------------------
  Game.prototype.placeOf = function (id) {
    var S = this.S;
    if (S.pos[id]) return S.pos[id];
    if (id === 'purse') return S.w.purse === 'gab' ? S.pos.gab : null;
    if (id === 'book') return S.pos.mage;
    return PLACE_OF[id] || null;
  };
  Game.prototype.approach = function (id) { // подойти по необходимости; вернуть false, если нельзя
    var S = this.S, pl = this.placeOf(id);
    if (!pl || pl === S.at) return true;
    if (S.phase === 'door') { this.say(this.T('Хозяин перекрывает вход рукой: — С оружием — нельзя. Сначала сундук.')); return false; }
    if (S.phase === 'arrest') { return true; }
    S.at = pl; this.moved = true;
    this.say('Ты идёшь ' + { door: 'к двери', hall: 'в зал', corner: 'в угол', bar: 'к стойке' }[pl] + '.');
    return true;
  };

  // ---- обработчики -------------------------------------------------------
  function isPerson(id) { return id === 'host' || id === 'rowdy' || id === 'lizard' || id === 'guard' || id === 'crowd' || ORDER.indexOf(id) >= 0; }
  Game.prototype.weaponId = function () { return HEROES[this.S.pc].weapon; };
  // оружие под рукой? меч/нож/лук — только если лежит у героя; в сундуке — нет (правило таверны)
  Game.prototype.hasInHand = function (it) {
    var S = this.S;
    if (it !== 'sword' && it !== 'knife' && it !== 'bow' && it !== 'claws') return true;
    return S.inv.indexOf(it) >= 0 || S.held === it;
  };
  Game.prototype.refuseNoWeapon = function (it) { // ТЕКСТ (черновик Беты, ждёт Диалоги/Геймплей)
    this.spend(0);
    this.say(NAMES[it] === 'меч' || it === this.weaponId() ? 'Оружие осталось в сундуке у двери — достать его можно только на выходе.' : 'У тебя такого нет.');
    return { refuse: true };
  };

  Game.prototype.look = function (id) {
    var S = this.S, w = S.w, T = this.T.bind(this), t;
    if (!id || id === 'floor' || id === 'wall' || id === 'snow') {
      if (id === 'floor') return this.say('Пол липкий от пролитого пива. Пиво, судя по запаху, пролито не сегодня.');
      if (id === 'wall') return this.say('Стены в тёмных балках; на одной — оленьи рога, на другой — пятно, форму которого лучше не разглядывать.');
      if (id === 'snow') return this.say('За дверью — первый иней Винтербурга. Холодно, тихо и почему-то пахнет жареным луком.');
      var lines = ['Таверна Винтербурга: длинный зал, тёмные балки, очаг, за столами — люди, которые пьют так, будто завтра отменят.'];
      if (S.phase === 'door') lines.push('Ты у входа. Рядом с тобой зачарованный сундук; хозяин следит, чтобы в зал никто не прошёл с оружием.');
      else if (S.phase === 'brawl') lines.push('В зале драка: летают кружки, табуреты и слова, которых лучше не запоминать.');
      else if (S.phase === 'arrest') lines.push('В зале стража. Тесно и мокро.');
      else {
        lines.push('В углу за большим дубовым столом сидит ' + (S.pc === 'gab' ? 'ты' : 'здоровяк с кружкой — тот самый, про которого шепчутся') + '. У окна — усатый человек в дорогом мундире без сабли.');
        lines.push('У стойки — хозяин, миска молока и бочонок. У двери — сундук.');
      }
      if (S.phase !== 'door') lines.push('Народу много, табуретов хватает, кружек — тоже.');
      return this.say(lines.join(' '));
    }
    var d = {
      door: 'Дверь тяжёлая, дубовая, с ржавым засовом. ' + (w.door.open ? 'Сейчас она приоткрыта, в щель тянет холодом.' : 'Закрыта.') + (w.door.prop ? ' Подпёрта.' : ''),
      chest: 'Зачарованный сундук: тёмный дуб, железные скобы. ' + (S.weaponIn || w.chest.has.length > 1 ? 'В нём уже лежат чьи-то вещи.' : 'Пока почти пуст.') + ' Сундук будто чуть тяжелее, чем должен быть.',
      sword: S.pc === 'gab' ? 'Твой меч: тусклый клинок с надписями на древнем языке, простая рукоять, никаких камней. Лежит в сундуке.' : 'Тусклый меч без камней, надписи на древнем языке. Лежит в сундуке — среди топоров он выглядит странно тихим.',
      host: 'Хозяин: широкий, усталый, смотрит на мир так, будто уже видел всё и ничего хорошего.',
      lizard: 'Усатый человек в добротном мундире, без сабли (саблю он сдал в сундук). Судя по выражению лица, он привык, чтобы вставали, когда он входит. Пьёт за чужой счёт.',
      rowdy: 'Здоровый, небритый, глаза мутные, пахнет чужим пивом. Ищет, к кому бы прицепиться.',
      gab: 'Здоровяк с открытым, простым лицом. Пьёт медленно, спиной к стене, лицом к двери.',
      elf: 'Слишком красивое лицо для таверны, плащ дорогой, без герба, волосы колышутся сами. Смотрит на всё так, будто это подарок.',
      mage: 'Рыжий, круглолицый, брови опалены — одна короче другой. К поясу на цепочке привязана толстая книга; он проверяет, на месте ли она.',
      nobby: 'Метр с кепкой, зелёные глаза, волосы чуть дыбом. Перчатки с когтями. Лакает молоко из миски, что смешит всех, кроме него.',
      milk: 'Миска молока у стойки. Единственное молоко в заведении, где пьют иное.',
      table: 'Большой дубовый стол у дальней стены. Тяжёлый, как ворота; за ним всегда сидит кто-то, кого лучше не беспокоить.',
      stool: 'Обычные деревянные табуреты. Их шесть, и они сами хотят кого-нибудь ударить.',
      mug: 'Пивные кружки — тяжёлые, глиняные, пока полные.',
      fork: 'Простые вилки: три зубца, никакой магии.',
      hearth: 'Очаг: угли, дрова, тепло.',
      window: 'Узкое окно, снег на подоконнике. Через него не уйти — а вот увидеть, что снаружи, можно: стражи там нет.',
      purse: S.pc === 'gab' ? 'Твой кошелёк — тяжёлый: деньги с продажи лошади и ещё что-то, про что ты не любишь думать.' : 'Кошелёк у пояса Габа — тяжёлый, хорошо набитый. Бесхозная жадность.',
      book: 'Толстая книга на цепочке — лечебник. Последняя страница заклеена чужой рукой. На цепочку глаз положил не один вор.',
      coins: 'Золотой: для эльфа — ценность в простых вещах, для остальных — деньги.',
      knife: 'Нож: небольшой, для трав или для того, что поближе.',
      bow: 'Простой дубовый лук с рынка Винтербурга. Куплен за деньги: «Представляешь?»',
      claws: 'Перчатки с когтями. Хозяин недоволен, но нож это или не нож — спор философский.',
      tables: 'Столики: круглые, липкие, на них удобно танцевать.',
      bar: 'Стойка, за которой хозяин. Под ней, говорят, лежит дубинка.',
      barrel: 'Бочонок пива. Слышно, как оно булькает.',
      crowd: 'Посетители: рабочие, матросы, пара торговцев. Все делают вид, что не слушают.',
      guard: 'Стража его светлости: копья, мундиры, важность.',
      weapon: 'Оружие сдаётся в сундук. Это правило таверны.',
      crumbs: 'Закуска тут — хлеб и сыр. Больше рассказывать нечего.',
      rumor: 'Разговоры за соседним столом: «Это Проклятый Меч. Кто с ним пошёл — не вернулся».'
    };
    if (id === 'self') return this.say(this.invText());
    this.say(d[id] || 'Ничего особенного.');
  };

  Game.prototype.h_look = function (A) {
    var id = A.item || A.person || A.dst || A.target || A.with || A.behind || (A.self ? 'self' : null);
    if (id && !isPerson(id) && id !== 'self') { this.look(id); }
    else this.look(id);
    return { ok: true };
  };
  Game.prototype.h_listen = function (A) {
    var S = this.S; this.spend(1);
    var r = ['— Это Проклятый Меч. Кто с ним пошёл — не вернулся, — шепчут за соседним столом.', 'Слышно, как шепчутся: «Говорят, с ним никто не остаётся долго».', 'Из общего гула: «…золотой, целый золотой, за одну кружку…», «…капитан-то опять за чужой счёт…»'];
    this.say(this.pick(r));
  };
  Game.prototype.h_inv = function () { this.say(this.invText()); };

  Game.prototype.h_wait = function () {
    var S = this.S; this.spend(1);
    if (S.phase === 'door') return this.say('Хозяин смотрит на тебя, ты — на сундук. Кто-то из вас должен пошевелиться.');
    this.say(this.pick(['Ты ждёшь. Таверна ждёт вместе с тобой.', 'Ты немного выжидаешь. Мир продолжает делать своё дело.', 'Ты замираешь и наблюдаешь.']));
  };
  Game.prototype.h_emote = function (A, c) { this.spend(1); this.say(this.pick(['Ты не сдерживаешься; вокруг — ни один человек не удивлён: в таверне видали и не такое.', 'Получается выразительно. Кто-то за соседним столом отвечает тем же.'])); };
  Game.prototype.h_eat = function () { this.spend(1); this.say('Закуска тут — хлеб и сыр, и того и другого мало. Перекусываешь — и снова готов{p:|а}.'); };
  Game.prototype.h_sleep = function () { this.spend(1); this.say('Ты закрываешь глаза. Через мгновение кто-то роняет кружку, и сон кончается.'); };
  Game.prototype.h_smell = function () { this.say('Пахнет пивом, жареным луком и мокрой шерстью.'); };
  Game.prototype.h_count = function () { this.say('Считать тут можно долго: кружки, табуреты, спины. Главное — не всё сразу.'); };
  Game.prototype.h_fix = function () { this.say('Чинить тут нечего. Разве что настроение.'); };
  Game.prototype.h_read = function (A) {
    var S = this.S;
    if (S.pc === 'mage' && (A.item === 'book' || !A.item)) { this.spend(1); return this.say(this.T('Ты раскрываешь книгу. Страницы пахнут лекарствами и учителем. Последняя страница склеена — «рано», говорит его почерк.')); }
    if (S.pc !== 'mage' && A.item === 'book') return this.say('Книга не твоя. Кроме того, на цепочке.');
    this.say('Читать здесь нечего: меню написано мелом и с ошибками.');
  };

  Game.prototype.h_go = function (A, c) {
    var S = this.S, tgt = A.dst || A.person || A.target || A.item || A.behind || A.src;
    if (!tgt) {
      var w = c.raw; if (/двер|выход/.test(w)) tgt = 'door'; else if (/стойк|бар/.test(w)) tgt = 'bar'; else if (/угол|углу/.test(w)) tgt = 'corner'; else if (/зал|середин|центр/.test(w)) tgt = 'hall';
    }
    if (!tgt) { this.say('Куда?'); S.pending = { verb: 'go', A: A, ask: 'Куда?' }; return { ok: false }; }
    if (tgt === 'door' && S.at === 'door' && S.phase !== 'door') { this.say('Ты и так у двери.'); return {}; }
    if (S.phase === 'door') {
      var pl0 = this.placeOf(tgt); if (pl0 && pl0 !== 'door') { this.say('Хозяин перекрывает вход рукой: — С оружием — нельзя. Сначала сундук.'); this.spend(0); return { refuse: true }; }
      this.say('Ты и так у двери; дальше — только после сундука.'); return {};
    }
    var pl = this.placeOf(tgt);
    if (pl === 'corner') S.f.satWithGab = true;
    if (!pl) { this.say('Туда не пройти.'); return { ok: false }; }
    if (S.at === pl) { this.say('Ты и так там.'); return {}; }
    S.at = pl; this.spend(1);
    this.say(this.pick(['Ты пробираешься ', 'Ты идёшь ', 'Ты протискиваешься ']) + { door: 'к двери', hall: 'в середину зала', corner: 'в угол, к большому столу', bar: 'к стойке' }[pl] + '.');
    if (S.phase === 'brawl') this.say('Мимо пролетает табурет. Ты успеваешь пригнуться.');
    return {};
  };
  Game.prototype.h_sit = function (A) {
    var S = this.S;
    if (S.phase === 'door') return this.h_go(A, { raw: '' });
    var tgt = A.target || A.person || A.dst || A.item || 'table';
    var pl = this.placeOf(tgt) || 'corner';
    S.at = pl; this.spend(1);
    if (S.pc === 'mage' && S.beat === 0 && S.sub === 1) { S.f.satWithGab = true; return {}; }
    if (tgt === 'gab' || tgt === 'table' || pl === 'corner') this.say(S.pc === 'gab' ? 'Ты сидишь у себя в углу, спиной к стене. Всё как обычно.' : 'Ты подсаживаешься к большому столу в углу. Здоровяк не поднимает глаз, но кружку придвигает к себе.');
    else this.say('Ты садишься там, где удобнее наблюдать за залом.');
    S.f.satWithGab = (pl === 'corner');
    return {};
  };
  Game.prototype.h_stand = function () { this.spend(0); this.say('Ты и так на ногах.'); };
  Game.prototype.h_climb = function (A) {
    this.spend(1);
    if (A.dst === 'table' || A.item === 'table' || A.behind === 'table') return this.say('Ты залезаешь на стол — на секунду ты выше всех. Потом кто-то дёргает за ногу.');
    if (A.item === 'stool' || A.dst === 'stool') return this.say('Табурет подо мной покачивается, но держит. Вид — лучше.');
    this.say('Лезть тут некуда: потолок далеко, а окно узкое.');
  };
  Game.prototype.h_flee = function (A) {
    var S = this.S;
    if (S.phase === 'door') { this.say('Ты можешь уйти хоть сейчас — но тогда зачем ты здесь? Зачем-то тебя сюда привела дорога.'); this.spend(0); return; }
    if (S.phase === 'evening') { this.say('Дверь — вот она. Но ты пришёл{p:|ла} сюда не для того, чтобы уйти до конца вечера.'); this.spend(0); return; }
    if (S.phase === 'brawl') {
      this.spend(1);
      if (S.w.door.prop) return this.say('Дверь подпёрта — снаружи стучат. Уйти через неё не получится: она теперь и защита, и клетка.');
      this.say('Ты кидаешься к двери — и упираешься в спины стражи, которая как раз входит. Далеко не убежишь.');
      S.b.round = Math.max(S.b.round, S.b.guardsAt - 1);
      return;
    }
    this.say('Бежать некуда — вокруг стража.'); this.spend(1);
  };
  Game.prototype.h_hide = function (A) {
    var S = this.S; this.spend(1);
    var r = this.roll('спрятаться', S.pc, 'dex', 11, { bonus: S.pc === 'nobby' || S.pc === 'elf' ? 2 : 0, bonusWhy: 'ловкость/скрытность' });
    S.hidden = r.ok;
    if (S.phase === 'brawl') { S.b.ally -= 0; }
    if (r.ok) this.say('Ты ныряешь под стол — и ты часть тени. Мимо проносятся сапоги.');
    else this.say('Ты ныряешь под стол — и встречаешь там чьё-то колено и чей-то нос. Тут тесно.');
  };
  Game.prototype.h_block = function (A) {
    var S = this.S; this.spend(1);
    var it = A.with || A.item || A.behind || S.held;
    if (it === 'table') {
      if (S.pc === 'gab') { S.w.tableUp = true; S.shield = true; S.b.done.table = true; S.w.lizard.table = true;
        this.say('Ты одной рукой поднимаешь дубовый стол, как ворота, и закрываешься им. Столешница гудит от ударов — и держит.'); S.b.ally += 1; return; }
      this.say('Стол размером с тебя, двое тебя. Ты его пробуешь — стол не согласен.'); return;
    }
    if (it === 'stool') { S.shield = true; return this.say('Ты выставляешь перед собой табурет. Оборона — так себе, но лучше, чем кулаки.'); }
    if (it === 'chest') { if (S.pc === 'gab') { S.shield = true; return this.say('Ты держишь сундук перед собой, как щит. Сундук тяжёл, зато надёжен.'); } }
    if (S.pc === 'gab' && S.phase === 'brawl') { S.shield = true; return this.say('Ты сдвигаешься, закрывая товарищей корпусом. Удары щёлкают по плечам.'); }
    S.shield = true;
    this.say('Ты закрываешься, чем можешь — руками, плащом, воспоминаниями об уроках.');
  };
  Game.prototype.h_cover = function (A) {
    var S = this.S; this.spend(1);
    var who = A.person && A.person !== 'crowd' ? A.person : (A.self ? S.pc : null);
    if (S.pc === 'gab') { S.shield = true; S.b.ally += (S.phase === 'brawl' ? 1 : 0); this.say(who && who !== 'gab' ? this.T('Ты встаёшь между %' + who + '+% и летящим табуретом. Табурет принимает на себя твоё плечо — тебе-то что.') : 'Ты становишься так, чтобы товарищи оказались за спиной. Как учил Бернар: «Держись рядом».'); return; }
    this.say(who ? this.T('Ты пытаешься закрыть %' + who + '+%, но ростом не вышел — тебе остаётся надеяться, что удача любит смелых.') : 'Ты пытаешься закрыть кого-нибудь собой — но получается, что закрываешься сам{p:|а}.');
  };
  Game.prototype.h_shove = function (A) {
    var S = this.S; this.spend(1);
    var id = A.person; if (id === 'gab' || id === 'elf' || id === 'mage' || id === 'nobby' || id === 'host') { this.say(this.T('Ты толкаешь %' + id + '+%. Он молча смотрит на тебя, ждёт объяснений.'.replace('%host%', 'хозяина'))); if (id === 'host') S.w.host.mood--; return; }
    return this.h_hit({ person: id, with: A.with, manner: A.manner });
  };
  Game.prototype.h_push = function (A) {
    var S = this.S, w = S.w, it = A.item || A.dst;
    if (!it) { this.say('Что толкнуть?'); S.pending = { verb: 'push', A: A, ask: 'Что толкнуть?' }; return { ok: false }; }
    if (it === 'door') {
      if (!this.approach('door')) return { refuse: true };
      this.spend(1);
      if (S.phase === 'door') { this.say('Ты толкаешь дверь: она послушно скрипит, но хозяин уже стоит в проходе. — Сначала сундук.'); return; }
      if (w.door.prop || w.door.bolt) { this.say('Дверь не поддаётся — ' + (w.door.prop ? 'её держит подпёртая тяжесть.' : 'засов задвинут.')); return; }
      if (!w.door.open) { w.door.open = true; this.say('Дверь открывается наружу; в зал вползает холод и пара снежинок. На улице пусто и тихо.'); }
      else this.say('Дверь и так открыта. Ты просто толкаешь воздух.');
      return;
    }
    if (it === 'chest') {
      this.approach('chest'); this.spend(1);
      this.say('Ты толкаешь сундук — он ползёт по полу, как обиженный кабан. Тяжёлый.'); return;
    }
    if (it === 'table' || it === 'tables' || it === 'stool' || it === 'barrel') {
      this.approach(it); this.spend(1);
      this.say(it === 'stool' ? 'Ты пинаешь табурет — он катится и врезается в чью-то ногу. Не смертельно.' : 'Ты толкаешь ' + NAMES[it] + ' — он сдвигается на ладонь и возвращается.'); return;
    }
    this.spend(1); this.say('Ты толкаешь ' + (NAMES[it] || 'это') + ', но ничего не происходит.');
  };
  Game.prototype.h_pull = function (A) { return this.h_take(A); };
  Game.prototype.h_open = function (A) {
    var S = this.S, w = S.w, it = A.item || A.dst;
    if (!it) { this.say('Что открыть?'); S.pending = { verb: 'open', A: A, ask: 'Что открыть?' }; return { ok: false }; }
    if (it === 'door') return this.h_push(A);
    if (it === 'chest') {
      if (!this.approach('chest')) return { refuse: true };
      this.spend(1);
      if (S.phase === 'door' || S.phase === 'evening') { w.chest.lid = true; this.say('Крышка откидывается легко: внутри топоры, ножи, ржавая поварёшка и один тусклый меч без камней, с надписями на древнем языке. Сундук слегка гудит.'); return; }
      w.chest.lid = true; this.say('Ты откидываешь крышку. Внутри груда оружия: топоры, кинжалы, поварёшка и тусклый меч.'); return;
    }
    this.spend(0); this.say('Открывать ' + (NAMES[it] || 'это') + ' нечего.');
  };
  Game.prototype.h_close = function (A) {
    var S = this.S, w = S.w, it = A.item || A.dst;
    if (it === 'door') { if (!this.approach('door')) return; this.spend(1); if (w.door.open) { w.door.open = false; return this.say('Ты закрываешь дверь. В зале сразу теплее.'); } return this.say('Дверь и так закрыта.'); }
    if (it === 'chest') { w.chest.lid = false; this.spend(1); return this.say('Крышка сундука щёлкает сама, будто довольна.'); }
    this.say('Закрывать нечего.');
  };
  Game.prototype.h_lock = function (A) {
    var S = this.S, w = S.w, it = A.item || A.dst || 'door';
    if (it !== 'door') { this.say('Запереть можно дверь. Остальное придётся охранять руками.'); return; }
    if (!this.approach('door')) return;
    this.spend(1);
    if (w.door.bolt) return this.say('Засов уже задвинут.');
    w.door.open = false; w.door.bolt = true;
    this.say('Ты задвигаешь тяжёлый засов. Не барьер для стражи — но им придётся постучать погромче.');
  };
  Game.prototype.h_prop = function (A, c, tr) {
    var S = this.S, w = S.w;
    var tgt = (A.item === 'door' || A.dst === 'door') ? 'door' : ((A.item && A.item !== 'chest' && A.item !== 'stool' && A.item !== 'table') ? A.item : 'door');
    var tool = A.with || ((A.item && A.item !== 'door') ? A.item : null) || (S.held) || (A.dst && A.dst !== 'door' ? A.dst : null);
    if (tgt !== 'door') { this.say('Подпирать тут особо нечего — кроме двери.'); return; }
    if (!tool) {
      this.say('Чем подпереть дверь? Напиши: «подпираю сундуком» или «беру табурет и подпираю».');
      S.pending = { verb: 'prop', A: { item: 'door' }, ask: 'Чем подпереть дверь?' }; this.spend(0); return { ok: false };
    }
    if (!this.approach('door')) return { refuse: true };
    if (tool !== S.held && tool !== 'stool' && tool !== 'chest' && tool !== 'table') { this.say('Этим дверь не подпереть.'); return; }
    if (tool === 'chest' && S.held !== 'chest') {
      this.spend(1);
      if (!this.liftChest()) { this.say('Ты упираешься в сундук плечом — он сдвигается на ладонь и замирает. Тяжёлый. Нужно ещё усилие (или другой способ).'); S.pending = { verb: 'prop', A: { item: 'door', with: 'chest' }, ask: 'Ещё раз?' }; return; }
      S.held = 'chest'; S.w.chest.at = 'held';
    }
    if (tool === 'table' && S.pc !== 'gab') { this.spend(1); this.say('Стол не поддаётся — он размером с тебя, вдвое тяжелее.'); return; }
    if (tool === 'stool') { S.w.stools = Math.max(0, w.stools - 1); }
    this.spend(1);
    if (tool === S.held) { S.held = null; }
    if (tool === 'chest' && w.chest.at !== 'door') w.chest.at = 'door';
    w.door.open = false; w.door.prop = (tool === 'chest' || tool === 'table') ? 2 : 1;
    S.f.prop = tool;
    this.say(tool === 'chest' ? 'Ты вставляешь сундук под ручку двери — он встаёт враспор, как приколоченный. Теперь дверь придётся ломать.'
      : tool === 'table' ? 'Ты приваливаешь стол к двери. Он весит, как совесть.' : 'Ты подпираешь дверь табуретом. Хилый заслон, но лучше, чем ничего.');
    S.b.guardsAt += (S.w.door.prop === 2 ? 2 : 1);
  };

  Game.prototype.liftChest = function () {
    var S = this.S, tries = S.f.chestTries || 0;
    if (S.held === 'chest') return true;
    if (S.pc === 'gab') { this.auto('поднять сундук', 'Габ поднимает сундук без броска: сила 4 — самая большая в отряде'); return true; }
    var r = this.roll('поднять сундук', S.pc, 'str', 12, { bonus: tries * 2, bonusWhy: tries ? 'каждая попытка — на два легче (уже расшатал)' : '' });
    if (!r.ok) S.f.chestTries = tries + 1;
    return r.ok;
  };
  Game.prototype.h_take = function (A, c, tr) {
    var S = this.S, w = S.w, it = A.item || A.dst;
    if (A.item && A.dst && (A.dst === 'chest' || A.src === 'chest')) { /* достаю из сундука */ }
    if (!it) { this.say('Что взять?'); S.pending = { verb: 'take', A: A, ask: 'Что взять?' }; return { ok: false }; }
    if (A.src === 'chest' && (it === 'knife' || it === 'bow' || it === 'sword' || it === 'weapon')) it = (it === 'weapon' ? this.weaponId() : it);
    if (it === 'weapon') it = this.weaponId();
    // достать своё из сундука
    if ((it === 'sword' || it === 'knife' || it === 'bow') && S.weaponIn && it === this.weaponId()) {
      if (!this.approach('chest')) return { refuse: true };
      this.spend(1);
      if (S.phase !== 'end') { this.say(this.pick(['Хозяин, не глядя, качает головой: — На выходе. Правило одно для всех.', 'Ты тянешься к крышке — и замечаешь, что хозяин следит за твоей рукой. — На выходе, — напоминает он. Навыки при тебе, а оружие пусть отдыхает.'])); return; }
      if (S.phase === 'door') { this.say('Ты тянешься к своему оружию, но хозяин качает головой: — Уже сдал{p:|а}. Достанешь на выходе.'); return; }
      S.weaponIn = false; S.armed = true; S.inv.push(it); S.w.chest.has = S.w.chest.has.filter(function (x) { return x !== it; });
      this.say('Ты достаёшь из сундука ' + (it === 'sword' ? 'меч' : it === 'bow' ? 'лук' : 'нож') + '. Крышка захлопывается с довольным звуком.');
      return;
    }
    if (it === 'sword' && !(this.isPC('gab') && S.weaponIn)) { this.approach('chest'); this.say('Чужой меч: достать его может только тот, кто положил. Сундук не даёт — рука проходит сквозь груду железа, как сквозь воду.'); this.spend(1); return; }
    if (it === 'knife' || it === 'bow' || it === 'claws' || it === 'coins') {
      if (S.inv.indexOf(it) >= 0 && S.held !== it) { S.held = it; this.spend(1); return this.say('Ты берёшь ' + NAMES[it] + ' в руки.'); }
      this.say('У тебя такого нет.'); return;
    }
    if (it === 'purse') {
      if (S.pc === 'nobby') return this.steal_purse(A);
      if (S.pc === 'gab') { this.spend(0); return this.say(S.w.purse === 'gab' ? 'Кошелёк и так при тебе.' : 'Кошелька уже нет.'); }
      this.say('Чужой кошелёк лучше не трогать — не то время.'); return;
    }
    if (it === 'book') { if (S.pc === 'mage') { this.say('Книга и так у тебя. На цепочке.'); return; } if (S.pc === 'nobby') return this.steal_book(A); this.say('Книга на цепочке — чужая.'); return; }
    if (it === 'chest') {
      if (!this.approach('chest')) return { refuse: true };
      this.spend(1);
      var okL = this.liftChest();
      if (okL) { S.held = 'chest'; S.w.chest.at = 'held'; this.say(S.pc === 'gab' ? 'Ты подхватываешь сундук, как ящик с луком. «С каждым годом тяжелеет», — бормочет хозяин.' : 'Сундук как будто радуется, что его берут, а потом сообщает всем своим весом: он тяжёлый. Но ты его поднял{p:|а}.'); }
      else this.say('Сундук не сдвинуть — он тяжелее, чем выглядит. «С каждым годом», — напоминает хозяин.');
      return;
    }
    if (it === 'table') {
      this.approach('table'); this.spend(1);
      if (S.pc === 'gab') { S.held = 'table'; S.w.tableUp = true; return this.say('Ты одной рукой поднимаешь дубовый стол. Кружки катятся по полу. Хозяин закрывает лицо ладонью.'); }
      return this.say('Стол размером с ' + (S.pc === 'nobby' ? 'двух Нобби' : 'тебя') + '. Ты пробуешь — стол не согласен.');
    }
    if (it === 'stool') { if (S.w.stools < 1) return this.say('Табуреты кончились.'); this.approach('stool'); S.held = 'stool'; this.spend(1); return this.say('Ты берёшь табурет. Тяжёлый, крепкий — вполне аргумент.'); }
    if (it === 'mug') { if (S.w.mugs < 1) return this.say('Кружек не осталось.'); this.approach('mug'); S.held = 'mug'; this.spend(1); return this.say('Ты берёшь кружку. Полная — жалко.'); }
    if (it === 'fork') { if (S.w.forks < 1) return this.say('Вилок больше нет.'); this.approach('fork'); S.held = 'fork'; this.spend(1); return this.say('Ты берёшь вилку. Три зубца, приятный вес.'); }
    if (it === 'milk') {
      if (S.w.milk === 'gone') { this.say('Миска уже пустая.'); return; }
      this.approach('milk'); S.held = 'milk'; this.spend(1); return this.say(S.pc === 'nobby' ? 'Ты берёшь миску молока. Ты никогда не лакаешь на людях. Ну, почти никогда.' : 'Ты берёшь миску молока. Все смотрят: что за нужда.');
    }
    if (it === 'beer') { this.approach('bar'); S.held = 'mug'; this.spend(1); return this.say('Ты берёшь кружку пива.'); }
    if (isPerson(it)) { this.say('Хватать людей здесь неприлично. Но если очень надо — можно ударить или сказать что-нибудь.'); return { ok: false }; }
    this.say('Взять ' + (NAMES[it] || 'это') + ' нельзя: оно слишком большое, слишком дальнее или слишком стена.');
  };

  Game.prototype.h_put = function (A, c, tr) {
    var S = this.S, w = S.w, it = A.item || S.held, dst = A.dst, self = this;
    if (it === 'weapon' || (!it && S.phase === 'door')) it = this.weaponId();
    if (!it) { this.say('Что положить?'); S.pending = { verb: 'put', A: A, ask: 'Что положить?' }; return { ok: false }; }
    if (it === 'weapon') it = this.weaponId();
    // «положить в сундук»
    if (it === 'chest' && dst) { this.say('Сундук в сундук не положишь.'); return; }
    if (!dst && it !== 'chest') {
      if ((it === 'sword' || it === 'knife' || it === 'bow') && S.inv.indexOf(it) >= 0 && S.phase === 'door') dst = 'chest';
    }
    // на голову капитану: «надеваю миску на голову»
    if (A.target && (it === 'milk')) return this.h_pour({ item: 'milk', target: A.target, manner: A.manner });
    if (dst === 'chest' || (!dst && S.held && S.held === it && S.phase !== 'door' && false)) {
      if (!this.approach('chest')) return { refuse: true };
      var isW = (it === this.weaponId() || it === 'claws');
      if (it === 'claws') { this.spend(1); return this.say('Хозяин смотрит на перчатки: — Это что? — Перчатки. — С когтями. — Это ногти. Хозяин подумывает возразить, но устал. — Ногти стричь, — ворчит он. И пропускает.'); }
      if (isW && S.inv.indexOf(it) >= 0) {
        this.spend(1);
        S.inv = S.inv.filter(function (x) { return x !== it; }); S.weaponIn = true; S.armed = false; if (S.held === it) S.held = null;
        S.w.chest.has.push(it); S.w.chest.lid = false;
        S.pos[S.pc] = 'door';
        var extra = '';
        if (S.pc === 'mage') { S.f.mageDeposit = true; }
        this.say(it === 'sword' ? 'Ты кладёшь меч в сундук.' : it === 'bow' ? 'Ты кладёшь лук и колчан в сундук. Крышка щёлкает, замок доволен.' : 'Ты кладёшь нож в сундук. Крышка щёлкает, замок доволен.');
        if (S.phase === 'door') {
          S.phase = 'evening'; S.t = 0;
          if (S.pc === 'mage') this.beatChestStage1(true);
          else this.say('Хозяин кивает и убирает руку с дверного проёма: — Добро пожаловать. И помните про вещи на выходе. Ты входишь в зал — тёплый, шумный, липкий. За соседним столом шепчут: «Это Проклятый Меч. Кто с ним пошёл — не вернулся».');
        }
        return;
      }
      // другие предметы в сундук — почему бы нет
      if (S.inv.indexOf(it) >= 0 || S.held === it) {
        this.spend(1); S.inv = S.inv.filter(function (x) { return x !== it; }); if (S.held === it) S.held = null; S.w.chest.has.push(it);
        return this.say('Ты кладёшь ' + NAMES[it] + ' в сундук. Он принимает и это.');
      }
      this.say('У тебя такого нет.'); return;
    }
    if (dst === 'door' || dst === 'window') { this.say('Ты не знаешь, как положить это на дверь.'); return; }
    if (S.held === it || S.inv.indexOf(it) >= 0 || it === 'stool' || it === 'mug' || it === 'fork' || it === 'milk' || it === 'table') {
      this.spend(1); if (S.held === it) S.held = null;
      var where = dst === 'table' ? 'на стол' : dst === 'bar' ? 'на стойку' : dst === 'floor' ? 'на пол' : 'рядом с собой';
      if (it === 'chest') { S.w.chest.at = 'door'; if (S.held === 'chest') S.held = null; }
      if (it === 'table') { S.w.tableUp = false; }
      this.say('Ты ставишь ' + NAMES[it] + ' ' + where + '.');
      return;
    }
    this.say('Положить нечего.');
  };

  Game.prototype.h_drink = function (A) {
    var S = this.S, it = A.item || A.dst || S.held;
    this.spend(1);
    if (it === 'milk') {
      if (S.w.milk === 'gone') return this.say('Миска пустая.');
      if (S.pc === 'nobby') { return this.say('Ты лакаешь молоко из миски — быстро, аккуратно и с достоинством. За соседним столом кто-то фыркает. Волосы на затылке у тебя чуть дыбом. Ты этого не забудешь.'); }
      if (S.pc === 'gab') return this.say('Ты пьёшь молоко. Не хочется, но иногда надо.');
      return this.say('Ты пьёшь молоко. На вкус — молоко. Окружающие смотрят с подозрением.');
    }
    if (it === 'mug' || it === 'beer' || !it) {
      if (S.w.mugs < 1) return this.say('Пусто.');
      this.approach('bar');
      if (S.pc === 'elf') return this.say('Ты пьёшь пиво. Горькое, тёплое, пенится — Восхитительно! Потом — ещё раз, для науки.');
      if (S.pc === 'mage') return this.say('Ты делаешь глоток. Голова слегка светлеет; видения обещают вернуться.');
      if (S.pc === 'gab') return this.say('Ты делаешь глоток. Хорошее пиво — единственная честная вещь в этой таверне.');
      return this.say('Ты отпиваешь пиво. Пиво как пиво, но в таверне оно почему-то вкуснее.');
    }
    this.say('Пить это не стоит.');
  };

  Game.prototype.h_treat = function (A) {
    var S = this.S;
    if (S.pc !== 'elf') {
      if (S.pc === 'gab') { this.spend(1); return this.say('Ты угощаешь соседа кружкой. Он не понимает, к чему это, но пьёт.'); }
      this.spend(0); return this.say('Ты бы угостил{p:|а} весь зал, но денег на всех нет. Кто-то другой сегодня платит за всех.'); }
    if (S.phase === 'door') { this.spend(0); return this.say('Сначала дело: оружие — в сундук.'); }
    if (S.beat > 1) { this.spend(1); return this.say('Ты кладёшь ещё один золотой на стойку. Зал ревёт, но счастливее уже быть не может.'); }
    this.beatTreat(true);
  };
  Game.prototype.h_give = function (A) {
    var S = this.S, it = A.item || S.held, to = A.person || A.target;
    if (!it) { this.say('Что дать?'); S.pending = { verb: 'give', A: A, ask: 'Что дать?' }; return { ok: false }; }
    if (!to) { this.say('Кому?'); S.pending = { verb: 'give', A: A, ask: 'Кому?' }; return { ok: false }; }
    if (it === 'coins' && S.pc === 'elf' && (to === 'host' || to === 'crowd')) return this.h_treat(A);
    this.spend(1);
    if (S.inv.indexOf(it) < 0 && S.held !== it) return this.say('У тебя такого нет.');
    if (to === 'host') return this.say('Хозяин принимает подарок, оценивающе прикусывает. — Спасибо. Сундук сегодня довольнее.');
    this.say('Ты протягиваешь ' + NAMES[it] + ' — %' + (ORDER.indexOf(to) >= 0 ? to : 'gab') + '% берёт, кивает.');
    if (S.held === it) S.held = null;
  };

  Game.prototype.h_talk = function (A, c) {
    var S = this.S, to = A.person || A.target || A.company, speech = (c.speech || '').toLowerCase(), self = this;
    if (S.phase === 'arrest' && (!to || to === 'guard' || to === 'crowd' || to === 'host')) to = 'lizard';
    if (!to) { to = (S.phase === 'brawl') ? 'crowd' : 'host'; if (S.phase === 'evening') to = 'crowd'; }
    this.spend(1);
    var about = { sword: /меч/.test(speech + ' ' + c.raw), gold: /золот|денег|монет/.test(speech + ' ' + c.raw), name: /имя|зовут|кто ты/.test(speech + ' ' + c.raw), sorry: /извин|прости/.test(speech + ' ' + c.raw), dream: /сон|виде/.test(speech + ' ' + c.raw) };
    if (to === 'gab' && S.pc === 'mage' && S.beat === 0 && S.sub === 1) { S.f.satWithGab = true; return; }
    if (S.phase === 'arrest' && S.pc === 'elf' && (A.self || about.name || /назов|титул|принц|королев|наслед|эльфийск/.test(c.raw + ' ' + speech))) { this.say(this.T('Слова уже во рту: «Я — наследни{e:к|ца} эльфийского трона…» Ты видишь: дворец, тишину, мастера-лучника, стрелу номер сто девятнадцать, мишень, которая не двигается. — И закрываешь рот.')); return; }
    var T = this.T.bind(this), say = this.say.bind(this);
    var pcLine = speech ? ' — «' + speech + '»' : '';
    if (to === 'host') {
      S.w.host.mood++;
      if (about.sword) return say('Хозяин: — Меч в сундуке. Чей — не моё дело. Моё дело — чтоб на выходе забрали.');
      if (about.gold) return say('Хозяин: — Платят вперёд. Эль — за монету, молоко — за две. Не спрашивайте.');
      return say(this.pick(['Хозяин: — Пить будете или разговаривать?', 'Хозяин, не отрываясь от кружки, которую полирует: — Правила висят у двери. Правила — это сундук.', 'Хозяин: — Драку затеете — платите сами. Меня не трогать.']));
    }
    if (to === 'rowdy') {
      if (S.phase === 'arrest') return say('Задиры нигде не видно.');
      S.w.rowdy.mood++;
      if (about.sorry) return say('Задира: — Извинения в глотку засунь. Ухмыляется, но кулак пока не поднимает.');
      return say(this.pick(['Задира: — Чё смотришь? Или тоже за счёт ушастого гуляешь?', 'Задира лениво щурится: — А я тебя не звал. Но ладно, говори, пока цел.', 'Задира: — Умный? Умных я люблю. Быстро вытряхиваешь карманы — быстро становишься дураком.']));
    }
    if (to === 'lizard') {
      if (S.phase === 'arrest' || S.w.guards) return say('Капитан Лизард (мокрый, с выцветшими усами): — Молчать! Вы подняли руку на капитана его светлости! Виселица — слишком мягко!');
      return say(this.pick(['Капитан Лизард приосанивается: — Я капитан стражи его светлости, и я не на службе. Так что не мешайте.', 'Капитан Лизард: — Кто позволил обращаться? Впрочем, если платишь — можешь стоять рядом.', 'Капитан не поднимает глаз от кружки, которую ему поставили за чужой счёт: — Сброд нынче наглый. Ничего, разберёмся.']));
    }
    if (to === 'gab') {
      if (S.pc === 'gab') return say('Ты говоришь сам с собой. Никто не спорит.');
      return say(about.sword ? 'Габ: — Меч как меч. — Он смотрит в кружку. — Все про него спрашивают.' : this.pick(['Габ: — Угу.', 'Габ, не поднимая глаз: — Слева двое. Или мне кажется.', 'Габ: — Не за что. Правда не за что.']));
    }
    if (to === 'elf') {
      if (S.pc === 'elf') return say('Ты говоришь сам{e:|а} с собой. Восхитительно, но бессмысленно.');
      return say(this.pick(['Эллион улыбается, как будто ему подарили лето: — Восхитительно! Ты знаешь, что пиво пьют, чтобы было весело? А потом грустно!', 'Эллион записывает что-то в тетрадку: — «Разговаривать с незнакомыми — обычай». Восхитительно.']));
    }
    if (to === 'mage') {
      if (S.pc === 'mage') return say('Ты говоришь вслух с собой. «Это знак», — думаешь ты. Знак чего — неясно.');
      return say(this.pick(['%mage% (проверяя, на месте ли книга): — Это знак! Ты видел{l:|а}? Нет? Ну ладно.', '%mage%: — Судьба привела меня сюда. — Возможно, — вставляет кто-то. — Скорее пиво.']));
    }
    if (to === 'nobby') {
      if (S.pc === 'nobby') return say('Ты бормочешь про себя: «Мурр». Больше ты сегодня ничего не выдаёшь.');
      return say(this.pick(['Нобби прищуривается: — Я вам не мышь, чтоб со мной так разговаривать. Мурр.', 'Нобби: — Слушай, котёнок, у меня дела. Если что — я не при чём.']));
    }
    if (to === 'crowd' || to === 'guard') {
      if (S.phase === 'brawl') return say('Твои слова тонут в грохоте. Кто-то вежливо тебя не слышит — он занят.');
      return say(this.pick(['Ты говоришь в зал. Зал делает вид, что не слушает.', 'Ты произносишь пару слов; за ближайшим столом переглядываются — и возвращаются к пиву.']));
    }
    say('Ты говоришь — никто не отвечает.');
  };

  // ---- воровство ---------------------------------------------------------
  Game.prototype.h_steal = function (A) {
    var S = this.S, it = A.item || A.src || A.person;
    if (!it || it === 'purse' || it === 'gab') { if (S.pc === 'nobby') return this.steal_purse(A); }
    if (it === 'book') return this.steal_book(A);
    this.spend(1);
    if (S.pc === 'nobby') return this.say('Ты примериваешься, но тут воровать нечего — или слишком заметно.');
    this.say('Ты как-то не создан{p:|а} для этого. Стыдно.');
  };
  Game.prototype.steal_purse = function (A) {
    var S = this.S;
    if (S.phase === 'door') { this.spend(0); return this.say('Сначала пройди в зал: хозяин не пустит с оружием.'); }
    if (S.beat > 2) { this.spend(0); return this.say('Кошелёк уже у тебя. Его надо беречь.'); }
    this.approach('corner');
    this.beatPurse(true, A);
  };
  Game.prototype.steal_book = function (A) {
    var S = this.S;
    this.spend(1);
    if (S.pc !== 'nobby') return this.say('Нет.');
    var r = this.roll('потянуться к книге — не выдать себя', 'nobby', 'dex', 16, { bonus: A.manner && A.manner.careful ? 2 : 0, bonusWhy: 'осторожно' });
    r.note = 'книгу не украсть: «ещё не время» (по сюжету); бросок решает только — заметит ли маг';
    if (r.ok) { this.say('Нобби, ты знаешь себя: цепочка звякает — и маг рефлекторно хватается за книгу. Ты отдёргиваешь руку. Ещё не время.'); }
    else this.say('Ты касаешься цепочки — маг бледнеет и хватается за книгу: — Это знак! — Ты отходишь с невинным видом. «Пока не сегодня», — решает Нобби.');
    S.f.eyeBook = true;
  };

  // ---- броски бойцов -----------------------------------------------------
  Game.prototype.h_hit = function (A, c) {
    var S = this.S, tgt = A.person || A.target || A.company || null, item = A.with || (A.item && !isPerson(A.item) ? A.item : null);
    if (A.item && !isPerson(A.item) && !A.with) item = A.item;
    if (item === 'weapon') item = this.weaponId();
    if (item && !this.hasInHand(item) && S.phase !== 'door') return this.refuseNoWeapon(item);
    if (!tgt) {
      tgt = (S.phase === 'brawl' || S.phase === 'arrest') ? (S.w.lizard.down ? 'rowdy' : 'lizard') : null;
      if (!tgt) { this.say('Кого бить? Пока никто не заслужил. Или заслужил, но по-тихому.'); S.pending = { verb: 'hit', A: A, ask: 'Кого?' }; return { ok: false }; }
    }
    if (S.phase === 'door') { this.spend(0); return this.say('У двери драться нельзя — хозяин смотрит. Сначала сундук.'); }
    if (S.phase === 'evening') {
      if (tgt === 'crowd' || tgt === 'rowdy' || tgt === 'lizard' || tgt === 'host') {
        this.spend(1); this.approach(tgt);
        this.say(this.T('Ты замахиваешься — и в этот момент чья-то рука ловит тебя за запястье. — Тихо, — говорит хозяин. — Драка в таверне — платят все. Сначала — вечер, потом — что будет.'));
        S.w.host.mood--; return { ok: false };
      }
      this.spend(1); return this.say(this.T('Ты бьёшь ' + (NAMES[tgt] || tgt) + '. Он не удивляется: он ждёт, что скажешь ты.'));
    }
    if (S.phase === 'arrest') { this.spend(1); this.say('Ты пытаешься ударить — и в тот же миг древко копья подсекает тебе ноги. Драка кончилась.'); return; }
    this.spend(1);
    return this.brawlAttack(S.pc, tgt, item, A, c, 'hit');
  };
  Game.prototype.h_kick = function (A, c) { A.with = A.with || 'foot'; return this.h_hit(A, c); };
  Game.prototype.h_swing = function (A, c) { return this.h_hit(A, c); };

  Game.prototype.h_throw = function (A, c) {
    var S = this.S, it = A.item || S.held, tgt = A.dst || A.target || A.person || null;
    if (A.person && !A.target && A.item) tgt = A.person;
    if (it && isPerson(it)) { tgt = tgt || it; it = S.held; }
    if (!it) { this.say('Что бросить?'); S.pending = { verb: 'throw', A: A, ask: 'Что бросить?' }; return { ok: false }; }
    if (it === 'weapon') it = this.weaponId();
    if (!this.hasInHand(it) && S.phase !== 'door' && S.phase !== 'evening') return this.refuseNoWeapon(it);
    if (!tgt) tgt = (S.phase === 'brawl') ? (S.w.lizard.down ? 'rowdy' : 'lizard') : null;
    if (!tgt) { this.say('Куда бросать? Здесь пока никто не заслужил.'); S.pending = { verb: 'throw', A: A, ask: 'Куда?' }; return { ok: false }; }
    if (S.phase === 'door' || S.phase === 'evening') { this.spend(0); return this.say('Ты пока не в драке. Метать вещи в таверне без повода — плохая примета: и для вещей, и для хозяина.'); }
    // взять по месту, если не в руках
    if (S.held !== it && S.inv.indexOf(it) < 0) {
      var pool = { stool: S.w.stools, mug: S.w.mugs, fork: S.w.forks };
      if (it in pool) { if (pool[it] < 1) return this.say('Таких вещей больше нет.'); this.approach(it); S.held = it; }
      else if (it === 'milk') { if (S.w.milk === 'gone') return this.say('Миска уже пустая.'); this.approach('milk'); S.held = 'milk'; }
      else if (it === 'table') { if (S.pc !== 'gab') return this.say('Стол — не то, что можно бросить.'); S.held = 'table'; }
      else if (it === 'chest') { if (S.pc !== 'gab') return this.say('Сундук слишком тяжёл.'); S.held = 'chest'; }
      else { this.say('У тебя такого нет.'); return; }
    }
    this.spend(1);
    return this.brawlAttack(S.pc, tgt, it, A, c, 'throw');
  };
  Game.prototype.h_shoot = function (A, c) {
    var S = this.S;
    if (S.pc === 'elf') {
      if (S.weaponIn && S.inv.indexOf('bow') < 0) {
        var alt = A.item && A.item !== 'bow' ? A.item : 'fork';
        this.say('Лук лежит в сундуке. «Меткий стрелок меткий даже вилкой». Ты берёшь вилку.');
        A.item = 'fork'; S.held = 'fork';
        return this.h_throw(A, c);
      }
      A.item = A.item || 'bow';
    }
    if (S.pc !== 'elf') { this.spend(0); return this.say('Стрелять тут не из чего. Разве что глазами.'); }
    return this.h_throw({ item: 'fork', target: A.target || A.person, manner: A.manner }, c);
  };
  Game.prototype.h_pour = function (A, c) {
    var S = this.S, it = A.item || S.held, tgt = A.target || A.person || A.dst;
    if (it !== 'milk' && it !== 'beer' && it !== 'mug') { this.say('Лить нечего.'); return; }
    if (!tgt && S.phase === 'brawl') tgt = 'lizard';
    if (!tgt) { this.say('На что лить?'); S.pending = { verb: 'pour', A: A, ask: 'На что лить?' }; return { ok: false }; }
    return this.h_throw({ item: it, target: tgt, manner: A.manner }, c);
  };
  Game.prototype.h_break = function (A) {
    var S = this.S; this.spend(1);
    var it = A.item || S.held;
    if (it === 'mug') { S.w.mugs = Math.max(0, S.w.mugs - 1); S.held = null; return this.say('Кружка разлетается вдребезги — и заодно чей-то вечер.'); }
    if (it === 'stool') { S.w.stools = Math.max(0, S.w.stools - 1); S.held = null; return this.say('Табурет ломается пополам. Отдельно — уже два оружия.'); }
    this.say('Ломать это не стоит. Сначала выясни, чьё оно.');
  };
  Game.prototype.h_cast = function (A, c) {
    var S = this.S, tgt = A.person || A.target || A.dst || A.item;
    if (S.pc !== 'mage') { this.spend(0); return this.say('Ты не умеешь. Могла бы получиться искорка — но получается только жест.'); }
    if (S.phase === 'door') { this.spend(0); return this.say('Не при хозяине! Правило таверны не о магии, но хозяин может расширить толкование.'); }
    if (S.phase === 'evening' && (!tgt || tgt === 'hearth')) { this.spend(1); return this.say('Ты подкидываешь искру в очаг — пламя вспыхивает голубым и тут же успокаивается. Хозяин не заметил.'); }
    if (S.phase === 'evening' && (tgt === 'lizard' || tgt === 'host' || tgt === 'rowdy' || tgt === 'crowd')) { this.spend(0); return this.say('Колдовать в тихой таверне на посетителей — плохая идея. Подожди, пока станет шумнее.'); }
    if (S.mana < 1) { this.spend(1); return this.say('Ты тянешься к силе — но её нет. Запас кончился, пока не отдохнёшь.'); }
    if (!tgt) tgt = 'lizard';
    if (isPerson(tgt) || tgt === 'door') {
      this.spend(1);
      return this.brawlAttack('mage', tgt, 'fire', A, c, 'cast');
    }
    this.spend(1); this.say('Огонь на ' + (NAMES[tgt] || 'это') + ': нет, ты рядом с книгой — она дороже.');
  };
  Game.prototype.h_heal = function (A) {
    var S = this.S, who = A.person || (A.self ? S.pc : S.pc);
    if (S.pc !== 'mage') { this.spend(1); return this.say('Ты перевязываешь свою царапину плащом. Спасибо и на том.'); }
    if (S.mana < 1) { this.spend(1); return this.say('Силы кончились.'); }
    this.spend(1); S.mana--;
    this.auto('лечение', 'навык мага, без броска: лечит всегда, тратит 1 силу');
    var h = HEROES[who] ? HEROES[who].hp : 8;
    if (HEROES[who] && S.hp[who] < h) { var d = this.dmg('лечит', 6, 2); S.hp[who] = Math.min(h, S.hp[who] + d); }
    this.say(who === 'mage' ? 'Ты кладёшь руки на ушибленное плечо — тепло. Тише. Дыши.' : this.T('Ты кладёшь руки на %' + who + '+% — тепло. «Тише. Дыши. Я здесь». %' + who + '% удивлённо моргает.'));
  };
  Game.prototype.h_use = function (A) { this.spend(1); this.say('Ты пробуешь использовать ' + (NAMES[A.item] || 'это') + ' — но здесь не совсем то место.'); };
  Game.prototype.h_cover_dummy = function () {};

  // ---- ядро драки --------------------------------------------------------
  Game.prototype.brawlAttack = function (hero, tgt, item, A, c, mode) {
    var S = this.S, w = S.w, self = this, T = this.T.bind(this);
    var meleeTgt = tgt;
    if (tgt === 'crowd') meleeTgt = w.lizard.down ? 'rowdy' : 'lizard';
    if (tgt === 'self') { this.say('Бить себя незачем — жизнь бьёт лучше.'); return; }
    if (hero === S.pc && (tgt === 'gab' || tgt === 'elf' || tgt === 'mage' || tgt === 'nobby')) { this.say('Ты бросаешь взгляд на ' + this.gname(tgt) + ' и передумываешь. Свои.'); return; }
    if (tgt === 'host') { w.host.mood -= 2; w.host.cudgel = true; S.b.ally -= 1; this.say('Хозяин достаёт из-под стойки дубинку: — В моём заведении дерутся гости! Сегодня — не я. Ты отступаешь.'); return; }
    if (tgt === 'door') { this.say('Ты бьёшь дверь — что она тебе сделала? Дверь держится.'); return; }
    if (tgt === 'guard') tgt = meleeTgt = 'lizard';
    if (item === 'foot') item = null;
    var lizard = w.lizard, rowdy = w.rowdy, res, sig = null;

    // ловкость/сила/интеллект
    var stat = (mode === 'hit') ? 'str' : (mode === 'cast' ? 'int' : 'dex');
    if (hero === 'nobby' && mode === 'hit') stat = 'dex';
    if (hero === 'elf' && mode === 'hit') stat = 'dex';
    var bonus = 0, why = '';
    if (item === 'stool' && mode === 'hit') { bonus += 1; why = 'табурет'; }
    if (item === 'table' && S.pc === 'gab') { bonus += 2; why = 'стол'; }
    if (A && A.manner && A.manner.hasty) { bonus -= 1; why += ' торопливо'; }
    if (A && A.manner && (A.manner.careful)) { bonus += 1; why += ' осторожно'; }
    var isElf = hero === 'elf';
    if (hero === 'mage' && mode !== 'cast' && mode !== 'throw' && !item) bonus -= 1;
    var ac = tgt === 'lizard' ? (mode === 'cast' ? 10 : 11) : 11;
    var lbl = (mode === 'cast' ? 'заклинание' : mode === 'throw' ? 'бросок' : 'удар') + ' → ' + (tgt === 'lizard' ? 'капитан' : (NAMES[tgt] || tgt));
    if (item) lbl += ' (' + (item === 'fire' ? 'огонь' : (NAMES[item] || item)) + ')';
    res = this.roll(lbl, hero, stat, ac, { attack: isElf && (mode === 'throw' || mode === 'hit'), bonus: bonus, bonusWhy: why });
    if (mode === 'cast') S.mana--;
    var nm = hero === S.pc ? 'Ты' : this.gname(hero);
    var vict = tgt === 'lizard' ? 'капитана' : tgt === 'rowdy' ? 'задиру' : (NAMES[tgt] || 'кого-то');
    if (item === 'milk') { S.w.milk = 'gone'; if (S.held === 'milk') S.held = null; }
    else if (item === 'fork') { S.w.forks = Math.max(0, S.w.forks - 1); if (S.held === 'fork') S.held = null; }
    else if (item === 'mug') { S.w.mugs = Math.max(0, S.w.mugs - 1); if (S.held === 'mug') S.held = null; }
    else if (item === 'stool') { if (mode === 'throw') { S.w.stools = Math.max(0, S.w.stools - 1); if (S.held === 'stool') S.held = null; } }

    if (!res.ok) {
      S.b.ally -= 1;
      if (item === 'milk') { this.say('Миска описывает красивую дугу, не долетает и бесславно разливается на чужой сапог. Молока жалко.'); return; }
      this.say(this.pick([nm === 'Ты' ? 'Ты промахиваешься: ' + (tgt === 'rowdy' ? 'задира' : 'капитан') + ' ныряет в толпу, и твой удар достаётся воздуху.' : nm + ' промахивается.', nm === 'Ты' ? 'Мимо. Кто-то толкает тебя под локоть.' : 'Мимо, и это видят все.']));
      return;
    }
    S.b.ally += 1;
    var d = this.dmg('урон', item === 'table' ? 6 : item === 'stool' ? 4 : 3, item === 'stool' ? 1 : (hero === 'gab' ? 2 : 0));
    var target = tgt === 'rowdy' ? rowdy : lizard;
    if (tgt === 'lizard' || tgt === 'rowdy') { target.hp -= d; if (target.hp <= 0) { target.down = true; target.hp = 0; } }
    // фирменные приёмы
    if (tgt === 'lizard') {
      lizard.wet += (item === 'mug' || item === 'milk') ? 1 : 0;
      if (item === 'milk' && !lizard.milk) { lizard.milk = true; S.b.done.milk = true; sig = 'milk'; }
      if (item === 'fork' && !lizard.fork) { lizard.fork = true; S.b.done.fork = true; sig = 'fork'; }
      if (item === 'fire' && !lizard.moustache) { lizard.moustache = true; S.b.done.fire = true; sig = 'fire'; }
      if (item === 'table' && !lizard.table) { lizard.table = true; S.b.done.table = true; sig = 'table'; }
      if (item === 'mug') lizard.wet += 0;
    }
    if (sig) return this.sigText(hero, sig, res);
    var t;
    if (tgt === 'rowdy') { t = nm === 'Ты' ? 'Ты бьёшь задиру — он отлетает к бочке, встаёт, ухмыляется и снова лезет в свалку.' : nm + ' бьёт задиру — тот скользит по полу.'; }
    else if (item === 'stool') t = nm + ' ' + (nm === 'Ты' ? 'бьёшь' : 'бьёт') + ' капитана табуретом — тот складывается пополам и требует прекратить безобразие.';
    else if (item === 'mug') t = nm + ' ' + (nm === 'Ты' ? 'швыряешь' : 'швыряет') + ' кружку — она разбивается о капитанское плечо; мундир пахнет пивом.';
    else if (mode === 'cast') t = nm + ' жж' + (nm === 'Ты' ? 'ёшь' : 'ёт') + ' капитану воротник — пламя серое, лёгкое, обжигающее самолюбие.';
    else if (item === 'table') t = nm + ' ' + (nm === 'Ты' ? 'обрушиваешь' : 'обрушивает') + ' стол на капитана; тот исчезает под столешницей и умолкает.';
    else if (mode === 'throw') t = nm + ' ' + (nm === 'Ты' ? 'бросаешь' : 'бросает') + ' ' + (item === 'fork' ? 'вилку' : item === 'mug' ? 'кружку' : item === 'stool' ? 'табурет' : (NAMES[item] || 'что подвернулось')) + ' — попадание: ' + this.pick(['капитан охает и отшатывается', 'капитан хрипит, что это бунт', 'капитан приседает, потирая скулу']) + '.';
    else t = nm + ' ' + (nm === 'Ты' ? 'бьёшь' : 'бьёт') + ' ' + vict + (item ? ' — ' + (NAMES[item] || item) : '') + ' — капитан ' + this.pick(['охает и отшатывается', 'хрипит, что это бунт', 'приседает, потирая скулу']) + '.';
    this.say(t);
    if (lizard.down && tgt === 'lizard') this.say('Капитан Лизард оседает на пол, оглушённый, и сидит так, моргая: усы, мундир и достоинство — всё в беспорядке.');
  };

  Game.prototype.sigText = function (hero, sig, res) {
    var S = this.S, pcTxt = hero === S.pc;
    var who = hero === S.pc ? 'Ты' : this.gname(hero);
    var t = {
      table: pcTxt ? 'Ты одной рукой подхватываешь дубовый стол — он огромен, как ворота — и закрываешься им, как щитом. Капитан Лизард с разбегу врезается в столешницу и отлетает к стойке.' : this.T('%gab% одной рукой подхватывает дубовый стол — огромный, как ворота — и закрывается им, как щитом. Капитан Лизард с разбегу врезается в столешницу и отлетает к стойке.'),
      fire: pcTxt ? 'Ты щёлкаешь пальцами — над усами капитана вспыхивает огонёк. Усы дымятся. — Прости! — кричишь ты. — Это было лечение… почти!' : this.T('%mage% щёлкает пальцами — над усами капитана вспыхивает огонёк. Усы дымятся. — Прости! — кричит %mage%. — Это было лечение… почти!'),
      milk: pcTxt ? 'Миска молока летит по дуге — и садится капитану на голову, как шляпа. Молоко течёт по мундиру. Ты уже под столом: «Мурр».' : this.T('Миска молока взлетает — и садится капитану на голову, как шляпа. Молоко течёт по мундиру. %nobby% уже под столом: «Мурр».'),
      fork: pcTxt ? 'Вилка свистит через весь зал и втыкается в стену, аккуратно проколов воротник капитана. Он висит на стене, как афиша. Ты: — Я не мажу.' : this.T('Вилка свистит через весь зал и втыкается в стену, аккуратно проколов воротник капитана. Тот висит на стене, как афиша. %elf% смотрит на свою работу: — Восхитительно.')
    }[sig];
    this.say(t);
    if (this.pairLineDone !== true) this.pairLine();
  };
  Game.prototype.pairLine = function () {
    var S = this.S; if (S.f.pair) return; S.f.pair = true;
    var gg = S.genders.gab, ge = S.genders.elf, t;
    if (gg === 'm' && ge === 'm') t = this.T('%gab% и %elf% оказываются спина к спине. — Этот мой, — бросает %gab%. — Уже нет, — отвечает %elf%.');
    else if (gg === 'f' && ge === 'f') t = this.T('Спина к спине: %gab% сбивает табурет, %elf% — второй. — Я уложила троих, — говорит %gab%. — А ты?');
    else t = this.T('Их взгляды встречаются поверх опрокинутого стола. — Ты неплохо дерёшься, — говорит %gab%. — Для ' + (ge === 'f' ? 'принцессы' : 'принца') + '. — %elf% замирает на полсекунды.');
    this.say(t);
  };

  // ---- события (биты) ----------------------------------------------------
  Game.prototype.tick = function () {
    var S = this.S;
    if (S.phase === 'evening') {
      S.t++;
      var due = [1, 3, 5][S.beat];
      var force = (S.pc === 'mage' && S.beat === 0) ? false : true;
      // ожидание ответа героя на бит: если PC — актёр, ждём его дольше
      var actorIsPC = (S.beat === 0 && S.pc === 'mage') || (S.beat === 1 && S.pc === 'elf') || (S.beat === 2 && S.pc === 'nobby');
      if (S.beat === 0 && S.sub === 1 && S.pc === 'mage') { // второй этап видения — подойти
        if (S.t >= 2 || S.f.satWithGab) this.beatChestStage2(true);
        return;
      }
      if (S.beat === 0 && S.sub === 0 && S.pc === 'mage') return; // ждём нож
      if (S.beat === 0) { this.beatChest(false); return; }
      if (S.beat === 1) { if (S.t >= (actorIsPC ? 3 : 2)) this.beatTreat(false); else if (actorIsPC && S.t === 2) this.say('(Кошелёк полон — самое время угостить всех.)'); return; }
      if (S.beat === 2) { if (S.t >= (S.pc === 'nobby' ? 4 : S.pc === 'elf' ? 3 : 2)) this.beatPurse(false); else if (actorIsPC && S.t === 3) this.say('(Кошелёк Габа звякает слева. Три монеты — Филу, одна — тебе. Фила нет: все четыре — твои.)'); return; }
      if (S.beat === 3) { this.beatBrawl(); return; }
    } else if (S.phase === 'brawl') { this.brawlRound(); }
    else if (S.phase === 'arrest') { this.arrestEnd(); }
  };

  Game.prototype.beatChestStage1 = function (byPC) {
    var S = this.S; S.sub = 1; S.f.chestSeen = true; S.t = 0;
    this.say('Хозяин кивает и убирает руку с дверного проёма. Крышка откидывается сама, и среди топоров, ножей и ржавой поварёшки виден меч. Тусклый, без камней, с надписями на древнем языке. Тот самый, из видения. Сердце бьётся быстрее.\n— Чей? — шепчешь ты хозяину. Хозяин кивает в угол: там, у стены, сидит здоровяк с кружкой. Все вокруг говорят шёпотом: «Это Проклятый Меч. Кто с ним пошёл — не вернулся».');
    S.phase = 'evening'; S.at = 'door'; S.pos.mage = 'door';
  };
  Game.prototype.beatChestStage2 = function (byPC) {
    var S = this.S; S.beat = 1; S.t = 0; S.sub = 0; S.pos.mage = 'corner'; S.at = 'corner'; S.f.chestDone = true;
    this.say(this.T('Ты подсаживаешься к здоровяку. — Я тебя видел{l:|а}. Во сне.\nМечник не поднимает глаз от кружки: — Все так говорят, а потом просят денег.'));
    this.spend(1);
  };
  Game.prototype.beatChest = function () {
    var S = this.S; S.beat = 1; S.t = 0; S.f.chestDone = true; S.pos.mage = 'corner';
    if (S.pc === 'gab') this.say(this.T('У двери %mage% кладёт нож для трав в сундук — крышка откидывается сама, и среди топоров лежит меч. Твой. %mage% замирает, смотрит на сундук, на тебя, потом подходит к твоему столу и садится, без приглашения.\n— Я тебя видел{l:|а}. Во сне.\nТы не поднимаешь глаз от кружки: — Все так говорят, а потом просят денег.'));
    else this.say(this.T('У двери %mage% кладёт нож для трав в сундук — крышка откидывается сама, и среди топоров лежит меч, которого не может быть: тусклый, без камней, с надписями на древнем языке. %mage% замирает, потом кивает на сундук хозяину: «Чей?» Хозяин показывает подбородком в угол. %mage% подсаживается к здоровяку: — Я тебя видел{l:|а}. Во сне. — Все так говорят, а потом просят денег, — отвечает мечник, не поднимая глаз.'));
  };
  Game.prototype.beatTreat = function (byPC) {
    var S = this.S; S.beat = 2; S.t = 0; S.f.treat = true; S.pos.elf = 'bar';
    if (byPC) { S.at = 'bar'; this.spend(1);
      this.say(this.T('Ты подходишь к стойке и кладёшь на неё золотой. — Всем! — Зал ревёт. За одну монету — целый зал друзей. — Восхитительно!\nХозяин пробует монету на зуб, кивает и наливает. Ты чувствуешь себя частью человечества.'));
    } else this.say(this.T('Золотой звенит о стойку. — Всем! — говорит %elf%, и зал взрывается. %elf% в восторге: за одну монету — целый зал друзей. — Восхитительно!'));
    this.say(this.T((S.pc === 'elf' ? 'К тебе' : 'К эльф{e:у|ийке}') + ' у стойки протискивается задира — здоровый, небритый, пахнет чужим пивом. — Ты чё, ушастый, самый богатый? — Он хватает за плащ.'));
    S.pos.rowdy = 'bar';
  };
  Game.prototype.beatPurse = function (byPC, A) {
    var S = this.S, w = S.w; S.beat = 3; S.t = 0; S.f.purse = true;
    S.pos.nobby = 'hall'; w.purse = 'nobby';
    S.inv = S.inv.filter(function (x) { return x !== 'purse'; });
    if (S.pc === 'nobby') S.inv.push('purse');
    if (byPC) {
      this.spend(1);
      var careful = S.t > 0 || (A && A.manner && A.manner.careful);
      var r = this.roll('срезать кошелёк — тихо?', 'nobby', 'dex', 12, { adv: !!(A && A.manner && A.manner.careful), bonus: (A && A.manner && A.manner.hasty) ? -2 : 0, bonusWhy: A && A.manner && A.manner.hasty ? 'торопливо' : (A && A.manner && A.manner.careful ? 'осторожно' : '') });
      S.f.purseClean = r.ok;
      r.note = (r.note ? r.note + '; ' : '') + 'кошелёк срезан в любом случае (по сюжету); бросок решает — тихо или шумно';
      var line;
      if (r.ok) line = 'Ты скользишь между столами, как тёплый сквозняк. Раз — и кошелёк исчез вместе с ремешком; мечник даже не моргнул.';
      else line = 'Ты срезаешь кошелёк — и слишком громко: мечник хмурится и поворачивает голову. Ты уже в двух шагах, уже под чужой рукой, уже бежишь.';
      this.say(line);
    } else this.say(this.T('Пока задира сопит в лицо, что-то маленькое с зелёными глазами скользит между столами. Раз — и кошелёк мечника исчез вместе с ремешком.'));
    // спасение
    var rowdyLine = S.pc === 'elf' ? 'Задира замахивается на тебя — и внезапно спотыкается о нечто маленькое: Нобби пролетает под его рукой и сбивает его с ног. Задира падает на скамью и не успевает ударить.' : 'Задира замахивается на эльфа — и внезапно падает: %nobby% пролетает под его рукой и сбивает его с ног, не останавливаясь. Драка отложена. Эльф смотрит на вора так, будто ему подарили лето: — Я твой должник.';
    if (S.pc === 'nobby') rowdyLine = 'Ты пролетаешь под рукой задиры, который занёс кулак на красивого эльфа, и сбиваешь его с ног — просто потому, что он на дороге. Эльф смотрит на тебя, как на подарок лета: — Я твой должник.';
    if (S.pc === 'elf') rowdyLine += ' Ты смотришь ему вслед: — Я твой должник.';
    this.say(this.T(rowdyLine));
    if (S.pc === 'nobby') this.say(this.T('Пробегая мимо мага, ты замечаешь книгу на цепочке — тяжёлую, толстую, дорогую. «Книжка-то дороже кошелька», — думаешь ты.'));
    else if (S.pc !== 'mage') this.say(this.T('Пробегая мимо мага, %nobby% косится на книгу: — Книжка-то дороже кошелька.'));
    else this.say(this.T('Мимо тебя пролетает воришка, косится на книгу: — Книжка-то дороже кошелька, — бросает он на бегу. Ты хватаешься за цепочку — на месте.'));
    S.rowdyDown = true; w.rowdy.down = true;
    this.beatBrawlStart();
  };
  Game.prototype.beatBrawlStart = function () {
    var S = this.S; S.phase = 'brawl'; S.b.round = 0; S.beat = 4; S.b.guardsAt = 5 + (S.w.door.prop ? (S.w.door.prop === 2 ? 2 : 1) : 0);
    S.w.rowdy.down = false;
    // подготовим очередь фирменных приёмов остальных
    S.b.sigQueue = ['gab', 'mage', 'nobby', 'elf'].filter(function (h) { return h !== S.pc; });
    this.say(this.T('Задира вскакивает, показывает пальцем на вора: — Держи вора! — И будто невзначай толкает в спину усатого человека у окна — в мундире, но без сабли. Кружка капитана летит на пол. — А этот ему помогал! Стража, называется!\nЗал взрывается. Капитан Лизард — судя по мундиру, капитан стражи его светлости, и он не на службе, — обливается пивом, багровеет и орёт: — Кто посмел?! Я — капитан стражи!\nМечник встаёт: рука на поясе — кошелька нет. Табурет проносится над головами. Начинается драка.'));
  };
  Game.prototype.beatBrawl = function () { /* запасной: не должен вызываться */ };

  // ---- раунды драки ------------------------------------------------------
  Game.prototype.brawlRound = function () {
    var S = this.S, b = S.b, w = S.w, self = this;
    b.round++;
    // ход NPC-героя: фирменный приём
    var sq = b.sigQueue, who;
    while (sq.length && ((who = sq[0]) && ((who === 'gab' && b.done.table) || (who === 'mage' && b.done.fire) || (who === 'nobby' && b.done.milk) || (who === 'elf' && b.done.fork)))) sq.shift();
    // миска в руках у героя — Нобби дожидается, пока её бросят (одна миска на всех)
    var blocked = function (h) { return h === 'nobby' && S.held === 'milk'; };
    for (var bi = 0; bi < sq.length && blocked(sq[0]); bi++) sq.push(sq.shift());
    if (sq.length && b.round < b.guardsAt && !blocked(sq[0])) {
      who = sq.shift();
      var kind = { gab: 'table', mage: 'fire', nobby: 'milk', elf: 'fork' }[who];
      var sigs = { table: 'str', fire: 'int', milk: 'dex', fork: 'dex' }[kind];
      var r = this.roll(this.gname(who) + ' — приём', who, sigs, 10, { attack: who === 'elf', bonusWhy: 'приём героя' });
      if (!r.ok) this.story(r, 'приём удаётся');
      if (kind === 'table') { w.lizard.table = true; b.done.table = true; S.w.tableUp = true; }
      if (kind === 'fire') { w.lizard.moustache = true; b.done.fire = true; if (who === S.pc) S.mana--; }
      if (kind === 'milk') { w.lizard.milk = true; b.done.milk = true; w.milk = 'gone'; }
      if (kind === 'fork') { w.lizard.fork = true; b.done.fork = true; w.forks = Math.max(0, w.forks - 1); }
      b.ally += r.ok ? 1 : 0;
      this.sigText(who, kind, r);
    } else if (b.round < b.guardsAt) {
      this.say(this.pick(['Кружка пролетает над головой и разбивается о стену. Хозяин закрывает лицо руками.', 'Где-то справа кто-то падает, кто-то кого-то поднимает и опять роняет.', 'Табурет описывает дугу и исчезает в толпе. Приземляется в чьём-то пиве.', 'Капитан Лизард что-то орёт про закон и уважение, но его никто не слушает.', 'Посетители делятся на тех, кто дерётся, и тех, кто ставит на дерущихся.']));
    }
    // предупреждение: стража на подходе
    if (b.round === b.guardsAt - 1) this.say(S.w.door.prop ? 'За дверью тяжёлые шаги и стук: — Именем его светлости! Открывайте! Дверь дрожит, но держит.' : 'За дверью тяжёлые шаги. Кто-то орёт: — Именем его светлости!');
    if (b.round >= b.guardsAt) this.guardsEnter();
  };
  Game.prototype.guardsEnter = function () {
    var S = this.S, w = S.w, b = S.b, t;
    w.guards = true; S.phase = 'arrest'; S.hidden = false; S.pos.guard = 'door'; w.door.open = true; w.rowdy.gone = true; S.pos.rowdy = null;
    var held = b.ally >= 3;
    b.result = held ? 'held' : 'lost';
    var door = w.door.prop ? (w.door.prop === 2 ? 'Дверь трещит, сундук ползёт по полу, как обиженный зверь, — и уступает. Стража вламывается по одной, красная от усилий.' : 'Табурет, подпирающий дверь, хрустит — и стража вламывается через обломки.') : 'Дверь распахивается: в зал врывается стража с копьями.';
    this.say(door + ' — Именем его светлости!');
    this.say(held ? 'К этому моменту посреди зала стоят четверо — а остальные лежат, сидят, сползли под столы. Драка выиграна, и это, кажется, не радует никого.' : 'К этому моменту вы четверо сидите на полу в куче табуреток и не очень понимаете, кто победил. Скорее всего — табуреты.');
    var bits = [];
    if (w.lizard.table) bits.push('стол пролетел мимо');
    var cap = (w.lizard.down ? (w.lizard.fork ? 'Капитан Лизард сидит под стеной, оглушённый: ' : 'Капитан Лизард сидит на полу, оглушённый: ')
      : (w.lizard.fork ? 'Капитан Лизард у стены: ' : 'Капитан Лизард стоит посреди зала: ')); var pieces = [];
    pieces.push('весь мокрый');
    if (w.lizard.moustache) pieces.push('усы дымятся и подпалены');
    if (w.lizard.milk) pieces.push('по мундиру течёт молоко');
    if (w.lizard.fork) pieces.push('воротник проколот вилкой и приколот к стене');
    if (w.lizard.table) pieces.push('на плечах — отпечаток столешницы');
    this.say(cap + pieces.join(', ') + '. — Взять их! Всех! — Он тычет пальцем, как заряженный арбалет. — Они подняли руку на капитана его светлости! Виселица!');
    this.say('Стража хватает всех четверых. Задира? Задиры в суматохе нигде нет. Их вещи остаются в сундуке у двери, но сейчас не до вещей.');
    var pcSpec = {
      elf: '«Ты — наследник эльфийского трона. Достаточно назвать себя, и стража вытянется в струнку. Но тогда — обратно во дворец, где библиотекарю тысяча лет, а мишень не двигается». Ты молчишь.',
      gab: 'Ты не сопротивляешься: у тебя нет ни меча, ни настроения. Кошелька, кстати, тоже нет — но об этом потом.',
      mage: 'Ты открываешь рот, чтобы сказать «это знак», и передумываешь: стража знаков не любит.',
      nobby: 'Кошелёк лежит у тебя за пазухой и, кажется, тяжелеет с каждым шагом. Ты стараешься не дышать.'
    }[S.pc];
    this.say(this.T(pcSpec));
    this.say('(Что ты скажешь или сделаешь?)');
    S.sub = 9;
  };
  // Арест: один выбор игрока решает, как их уведут. Серия кончается так же (крючок про герцога), но исход разный.
  // ТЕКСТ — черновик Беты: строки ARREST ждут Диалоги; крючок и реплики капитана — из season1.md.
  var ARREST_KIND = {
    hit: 'resist', kick: 'resist', swing: 'resist', throw: 'resist', shoot: 'resist', cast: 'resist', shove: 'resist', pour: 'resist', fight: 'resist', break: 'resist',
    flee: 'run', hide: 'run', climb: 'run', go: 'run', push: 'run', pull: 'run',
    talk: 'plead', give: 'plead', treat: 'plead',
    wait: 'calm', put: 'calm', sit: 'calm', stand: 'calm', block: 'calm', cover: 'calm', lock: 'calm', close: 'calm'
  };
  var CALM_WORDS = /сда[юё]сь|подним\S* рук|руки (вверх|поднял)|на колен|не сопротивл|без (боя|сопротивл)|иду с (ними|вами|стражей)|веди(те)?\b/i;
  var ARREST = {
    calm: 'Ты не мешаешь — так быстрее и всем проще. Стража ведёт вас, не толкая.',
    resist: 'Тебя скручивают, не церемонясь, и ведут; плечо ноет до самой решётки.',
    run: 'Копьё в спину быстро объясняет, куда идти. Вас связывают одной верёвкой на всех.',
    plead: 'Слова пропадают впустую: капитан орёт громче. Вас уводят, не дослушав.',
    idle: 'Стража не даёт отвлекаться: копьё упирается тебе в плечо. (Что ты скажешь или сделаешь? Можно сдаться, сказать слово, дёрнуться или бежать.)'
  };
  Game.prototype.arrestAct = function (verb, A, c, tr) {
    var S = this.S, kind = ARREST_KIND[verb] || 'idle';
    if (S.f.arrest) return { ok: false }; // решение уже принято в этом ходу: первое действие в цепочке решает
    if (verb === 'go' && A.company) kind = 'calm';
    tr.note = (tr.note ? tr.note + '; ' : '') + 'арест: ' + kind;
    tr.resolved = { verb: verb, arrest: kind };
    if (kind === 'idle') {
      S.f.arrestIdle = (S.f.arrestIdle || 0) + 1;
      if (S.f.arrestIdle < 3) { this.say(ARREST.idle); return { ok: false }; }
      kind = 'calm';
    }
    S.f.arrest = kind; this.spend(1);
    if (kind === 'resist') {
      this.say('Ты пытаешься ударить — и в тот же миг древко копья подсекает тебе ноги. Драка кончилась.');
      S.hp[S.pc] = Math.max(1, S.hp[S.pc] - 2);
    } else if (kind === 'plead') {
      this.h_talk(A, c);
    } else if (kind === 'run') {
      this.say('Ты кидаешься прочь — и упираешься в копья: бежать некуда, вокруг стража.');
    }
    return { done: true, verb: verb };
  };
  Game.prototype.arrestEnd = function () {
    var S = this.S; S.ended = true; S.phase = 'end';
    this.say(ARREST[S.f.arrest || 'calm']);
    this.say(this.T('Решётка лязгает. Кошелёк так и лежит у Вора за пазухой. Где-то наверху стражник говорит:\n— Герцог хочет их видеть. Лично.'));
    this.say('— конец серии 1 «Таверна» —');
  };

  Game.prototype.viewState = function () {
    var S = this.S, w = S.w, self = this;
    var figs = [];
    ORDER.forEach(function (h) { figs.push({ id: h, name: self.gname(h), place: h === S.pc ? S.at : S.pos[h], pc: h === S.pc, color: HEROES[h].color, hp: S.hp[h], hpMax: HEROES[h].hp }); });
    ['host', 'lizard', 'rowdy'].forEach(function (id) { if (S.pos[id] && !(id === 'rowdy' && w.rowdy.gone)) figs.push({ id: id, name: NAMES[id], place: S.pos[id], color: id === 'lizard' ? '#c9a45c' : id === 'host' ? '#9a8b72' : '#8a4a4a', hp: id === 'lizard' ? w.lizard.hp : id === 'rowdy' ? w.rowdy.hp : null }); });
    if (w.guards) figs.push({ id: 'guard', name: 'стража', place: 'door', color: '#5a6a7a' });
    return { figs: figs, at: S.at, phase: S.phase, inv: S.inv.slice(), held: S.held, mana: S.pc === 'mage' ? S.mana : null, hp: S.hp[S.pc], hpMax: HEROES[S.pc].hp, ended: S.ended, weaponIn: S.weaponIn, door: w.door, stools: w.stools, mugs: w.mugs, chestHas: w.chest.has };
  };

  Game.HEROES = HEROES; Game.ORDER = ORDER; Game.NAMES = NAMES; Game.PLACES = PLACES;
  CS.Game = Game;
})(typeof window !== 'undefined' ? window : globalThis);
