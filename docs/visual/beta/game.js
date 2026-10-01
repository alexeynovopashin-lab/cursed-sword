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
    elf:   { role: 'лучник',  names: { m: 'Эллион',   f: 'Эллион' },   short: 'Эллион', def: 'f', hp: 9,  mods: { str: 0, dex: 4, int: 1, cha: 1 }, weapon: 'bow',   color: '#6fbf80' },
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
  var STUB = '[ТЕКСТ] '; // строка-заглушка: слов у Диалогов ещё нет (записка в SESSIONS_CHAT)
  var MAX_REPLY = 1024; // знаков в одной реплике навыка Алисы
  var MAX_INPUT = 300; // знаков в одной фразе: голос и так короче, а ответ должен уложиться в 1024
  var MAX_QUEUE = 240; // знаков в очереди «дальше» (состояние Алисы ≤ 1 КБ)
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
      f: {}, players: (c.players && c.players.length ? c.players.slice() : [pc])
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
    if (n === 'Эллион') return S.genders.elf === 'f' ? n : (c === '+' ? 'Эллиона' : 'Эллиону');
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
      t = 'Винтербург, первый иней. Таверна гудит: {e:эльф|эльфийка} платит за всех, и это самый весёлый вечер года. А ты сидишь в углу, спиной к стене, и пьёшь один. За соседним столом шепчутся и косятся на тебя:\n— Это Проклятый Меч. {g:Наёмник|Наёмница}. Кто с {g:ним|ней} пошёл — не вернулся.';
    } else if (S.pc === 'elf') {
      t = 'Дорога ведёт в человеческий город Винтербург. Говорят, там варят пиво, от которого даже гномы поют. Кошелёк полон — повод угощать всех.\nДверь таверны. За ней гудит зал. У порога — большой сундук, а рядом хозяин, и вид у него такой, будто он говорит это каждому.\n— Оружие — в сундук. Достать сможет только тот, кто положил. И не забудьте забрать свои вещи на выходе: с каждым годом сундук тяжелеет.';
    } else if (S.pc === 'mage') {
      t = 'Если это пророчество, то тебя ждёт избранный. Если несварение — таверна тоже подойдёт. Снег на крыше, слово «Винтербург» — всё как в видении. Ты у двери таверны.\nУ порога — большой сундук, а рядом хозяин.\n— Оружие — в сундук. Достать сможет только тот, кто положил. И не забудьте забрать свои вещи на выходе: с каждым годом сундук тяжелеет.';
    } else {
      t = 'Вечер. Голодно. В таверне гуляет {e:эльф|эльфийка} и угощает всех. А в углу один пьёт кто-то с мечом и очень полным кошельком.\nТы на пороге. У двери — большой сундук, рядом хозяин.\n— Оружие — в сундук. Достать сможет только тот, кто положил. И не забудьте забрать свои вещи на выходе: с каждым годом сундук тяжелеет.';
    }
    return T(t);
  };

  // ---- ход ---------------------------------------------------------------
  Game.prototype.input = function (text) {
    var before = clone(this.S), rec = { n: this.turns.length + 1, input: text, text: [], rolls: [], trace: null, diff: [], phaseFrom: this.S.phase };
    this.rolls = rec.rolls; this.out = rec.text; this.cost = 0; this.mark = null; this.acted = 0; this.refused = false; this.notes = []; this.idleTurn = false; this.S.f.arrestDone = false;
    var S = this.S, tooLong = false;
    if (text.length > MAX_INPUT) { text = text.slice(0, MAX_INPUT); rec.input = text; tooLong = true; }
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
          var q = [], qn = 0; clauses.slice(i).forEach(function (c) { if (qn + c.raw.length <= MAX_QUEUE) { q.push(c.raw); qn += c.raw.length + 2; } });
          S.queue = q;
          var shown = S.queue.join(', '); if (shown.length > 120) shown = shown.slice(0, 117) + '…';
          if (S.queue.length) this.say('(Три действия за ход — больше не успеть. Осталось: «' + shown + '». Напиши «дальше», если ещё нужно.)');
          break;
        }
        var c = clauses[i], tr = { text: c.raw, verb: c.verb, args: c.args.map(function (a) { return a.role + ':' + a.id; }), neg: c.neg, resolved: null, note: '' };
        rec.trace.clauses.push(tr);
        var inArrest = S.phase === 'arrest' && !S.ended;
        if (c.refusal && !c.verb && !inArrest) { tr.note = 'отказ без глагола'; if (!this.refused) this.say(STUB + 'От чего ты отказываешься?'); this.refused = true; continue; }
        if (c.neg && c.verb && !inArrest) {
          tr.note = 'отрицание — действие пропущено';
          if (!this.refused) { // несколько отказов за ход — одна строка (О2.3)
            if (S.phase === 'brawl') { this.spend(1); this.say(STUB + 'Ты стоишь в стороне и смотришь, как дерутся другие.'); } // Р5: отказ в драке — ход
            else this.say(this.pick(['Ты решаешь не торопиться.', 'Нет так нет.']));
          }
          this.refused = true; continue;
        }
        var res = this.execClause(c, tr, prevVerb, prevObj);
        if (res && res.done) { done++; prevVerb = res.verb || prevVerb; if (res.obj) prevObj = res.obj; }
        if (this.mark === 'stop') break;
      }
    }
    if (tooLong) this.say(this.pick(['Длинно. Беру первую часть, остальное скажи следующим ходом.', 'Это целая речь. Слушаю начало, остальное потом.']));
    // вопрос без ответа хранится до следующего хода
    return this.finish(rec, before);
  };

  Game.prototype.finish = function (rec, before, skipTick) {
    var S = this.S;
    if (this.cost > 0 && !skipTick && !S.ended) this.tick();
    if (this.cost > 0 || this.acted) S.turn++;
    rec.diff = diffState(before, this.S);
    rec.phaseTo = S.phase; rec.ended = S.ended; rec.notes = this.notes || [];
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
    if (S.phase === 'arrest' && !S.ended && (m === 'help' || m === 'inv' || m === 'look' || m === 'ack')) {
      if (m === 'ack' && S.pending) { /* не бывает в аресте */ }
      if (m !== 'ack' && this.arrestFree()) return m === 'look' ? this.look(null) : this.say(m === 'help' ? HELPLINE : this.invText());
      return this.arrestAct(null, {}, { raw: m, tokens: [], neg: false, manner: {} }, { note: '', resolved: null });
    }
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
    if (S.weaponIn) t += ' Оружие ждёт в сундуке у двери.';
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
    var PV = { distract: 1, hit: 1, talk: 1, heal: 1, touch: 1, shove: 1, thanks: 1, kiss: 1, kick: 1, steal: 1, cast: 1, bribe: 1 };
    c.args.forEach(function (a) {
      var id = a.id === '@it' && PV[c.verb] && S.f.lastP ? S.f.lastP : self.resolveId(a.id); if (!id) return;
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
    var verbal = c.unknown.some(function (u) { return /(ть|ться|тись|ти|чь|ю|юсь|ешь|ет|ут|ют|ят|ем)$/.test(u); });
    if (!verb && S.pending && verbal) S.pending = null; // П5: фраза с неопознанным глаголом не достраивает висящий вопрос
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
    if (verb === 'read' && A.item === 'spell') { verb = 'cast'; A.item = null; tr.note = 'читаю заклинание = колдую'; }
    if (verb === 'take' && A.person && !A.item && S.phase !== 'arrest') verb = 'grab';
    if (verb === 'take' && !A.item && !A.dst && A.src && A.src !== 'chest' && !isPerson(A.src)) { A.item = A.src; A.src = null; }
    if (verb === 'sound') verb = 'emote';
    if (S.phase !== 'arrest' || S.ended) { var rf = this.refuseUnknown(verb, c, A); if (rf) { tr.resolved = { verb: verb, refuse: rf }; return { done: false }; } }
    if (verb === 'close' && (A.self || A.person) && !A.item && !A.dst) verb = 'cover';
    if (verb === 'push' && A.person) verb = 'shove';
    if (verb === 'climb' && A.behind && !A.dst) verb = 'hide';
    if (verb === 'use' && (A.person || A.target) && (A.item === 'milk' || (!A.item && S.held === 'milk'))) { A.item = 'milk'; A.target = A.target || A.person; verb = 'pour'; }
    else if (verb === 'use' && (A.person || A.target) && S.held && !A.item) { A.item = S.held; A.target = A.target || A.person; verb = 'throw'; }
    if (!verb && S.phase === 'arrest' && !S.ended) { tr.note = 'глагол не найден'; return this.arrestAct(null, A, c, tr); }
    if (!verb) {
      tr.note = 'глагол не найден';
      var known = c.args.map(function (a) { var rid = this.resolveId(a.id); return rid ? (NAMES[rid] || rid) : null; }, this).filter(Boolean);
      if (!known.length && c.args.length) this.say('Про кого или про что ты? Назови, например, «капитана» или «дверь».');
      else if (known.length) { this.say('«' + cap(known[0]) + '»… и что ты хочешь с этим сделать?'); S.last = this.resolveId(c.args[0].id) || S.last; S.pending = { verb: null, A: A, ask: 'Что сделать?' }; }
      else this.say(this.pick(['Не понял{p:|а} тебя. Скажи иначе — например, «беру кружку» или «иду к стойке».', 'Это слишком загадочно даже для таверны. Опиши действие проще: что делаешь и с чем.']));
      return { done: false };
    }
    if (S.phase === 'arrest' && !S.ended && !((verb === 'look' || verb === 'inv') && this.arrestFree())) return this.arrestAct(verb, A, c, tr);
    // цель по умолчанию
    tr.resolved = { verb: verb, item: A.item, person: A.person, target: A.target, dst: A.dst, with: A.with, src: A.src };
    var h = this['h_' + verb];
    if (!h) { tr.note += ' (нет обработчика)'; this.say('Ты пробуешь: «' + c.raw + '» — но таверна не понимает, что это значит.'); return { done: false }; }
    var r = h.call(this, A, c, tr) || {};
    if (A.item) S.last = A.item; else if (A.person) S.last = A.person; else if (A.dst) S.last = A.dst;
    if (A.person && A.person !== 'self') S.f.lastP = A.person;
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
    if (NAMES[it] === 'меч' || it === this.weaponId()) this.say(this.S.phase === 'brawl' ? this.pick(['Твоё оружие лежит в сундуке до самого выхода. Зато вокруг полно табуреток.', 'Оружие в сундуке. Под рукой только табуретки.']) : this.pick(['Хозяин: — Оружие в сундуке. Сундук открывается на выходе. Ты уже уходишь?', 'Хозяин: — Достать может только тот, кто положил. И только на выходе.', 'Хозяин: — На выходе.']));
    else this.say('У тебя такого нет.');
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
        lines.push('В углу за большим дубовым столом сидит ' + (S.pc === 'gab' ? 'ты' : '{g:здоровяк|силачка} с кружкой, спиной к стене. Лавки вокруг пустые: шепчутся как раз про {g:него|неё}') + '. У окна — усатый человек в дорогом мундире без сабли.');
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
      rumor: STUB + 'За соседним столом шепчутся, поглядывая в угол.'
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
    var r = ['Слышно, как шепчутся: «Говорят, с ним никто не остаётся долго».', 'Из общего гула: «…золотой, целый золотой, за одну кружку…», «…капитан-то опять за чужой счёт…»'];
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
    if (tgt === 'gab' || tgt === 'table' || pl === 'corner') this.say(S.pc === 'gab' ? 'Ты сидишь у себя в углу, спиной к стене. Всё как обычно.' : 'Ты подсаживаешься к большому столу в углу. {g:Здоровяк|Здоровячка} не поднимает глаз, но кружку придвигает к себе.');
    else if (isPerson(tgt) && tgt !== 'crowd') this.say('Ты подходишь к ' + (ORDER.indexOf(tgt) >= 0 ? this.T('%' + tgt + '~%') : (NAMES[tgt] || tgt)) + ' и садишься рядом.');
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
      if (S.held === 'chest') { this.spend(0); return this.say('Ты уже держишь сундук.'); }
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
          else this.say('Хозяин кивает и убирает руку с дверного проёма: — Добро пожаловать. И помните про вещи на выходе. Ты входишь в зал — тёплый, шумный, липкий.');
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
    var S = this.S, it = A.item || A.dst || A.src || S.held;
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
    var S = this.S, to = A.person || A.target || A.company; if (to) S.f.lastTalk = to; var speech = (c.speech || '').toLowerCase(), self = this;
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
      return say(this.pick(['Задира: — Чё смотришь? Или тоже за счёт {e:ушастого|ушастой} гуляешь?', 'Задира лениво щурится: — А я тебя не звал. Но ладно, говори, пока цел.', 'Задира: — Умный? Умных я люблю. Быстро вытряхиваешь карманы — быстро становишься дураком.']));
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
      return say(this.pick(['%mage% (проверяя, на месте ли книга): — Это знак! Ты видел{p:|а}? Нет? Ну ладно.', '%mage%: — Судьба привела меня сюда. — Возможно, — вставляет кто-то. — Скорее пиво.']));
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
        if (S.phase !== 'brawl') { this.spend(0); return this.say('Лук лежит в сундуке до самого выхода. «Меткий стрелок меткий даже вилкой», — но сейчас не до вилок.'); }
        this.say('Лук лежит в сундуке. «Меткий стрелок меткий даже вилкой». Ты берёшь вилку.');
        this.approach('fork'); A.item = 'fork'; S.held = 'fork';
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
    var S = this.S, w = S.w, who = A.person && A.person !== 'crowd' && A.person !== 'guard' ? A.person : (A.self || !A.person ? S.pc : S.pc);
    // чужие раны не-маг лечить не умеет (О4, находка 38); текст — dialogue_s1_arrest.md (е), черновик
    if (S.pc !== 'mage') {
      this.spend(1);
      if (A.person && A.person !== S.pc && A.person !== 'self') { this.spend(0); return this.say(this.pick(['Лечить чужие раны ты не умеешь. Свою царапину перевязать можешь, если хочешь.', 'Ты не лекарь. Лечит у вас {l:Луциан|Луциания}, а ты разве что перевяжешь себе царапину.'])); }
      return this.say('Ты перевязываешь свою царапину плащом. Спасибо и на том.');
    }
    if (S.mana < 1) { this.spend(1); return this.say('Силы кончились.'); }
    if (who === 'lizard') {
      if (S.phase === 'arrest') return this.say('Ты тянешься к капитану, чтобы полечить. Лизард: — Руки прочь! Это нападение на капитана его светлости!');
      this.spend(1); S.mana--; this.auto('лечение', 'навык мага, без броска: тратит 1 силу');
      if (w.lizard.hp < 10) { w.lizard.hp = Math.min(10, w.lizard.hp + this.dmg('лечит', 6, 2)); w.lizard.down = false; return this.say('Ты кладёшь руки капитану на плечи, и боль уходит. Лизард: — Отставить! Капитана лечит только лекарь его светлости!'); }
      return this.say(this.pick(['Капитан цел, просто пьян. От этого ты не лечишь.', 'Капитан цел. Лечить нечего.']));
    }
    if (who === 'host') { this.spend(1); return this.say('Хозяин: — Я не ранен, я разорён. Это не лечится.'); }
    if (who === 'rowdy') {
      this.spend(1);
      if (w.rowdy.hp < 8 && !w.rowdy.gone) { S.mana--; this.auto('лечение', 'навык мага, без броска: тратит 1 силу'); w.rowdy.hp = Math.min(8, w.rowdy.hp + this.dmg('лечит', 6, 2)); return this.say('Ты лечишь задире разбитую губу. Задира: — Чё, влюбился?'); }
      return this.say('Тут лечить нечего.');
    }
    if (!HEROES[who]) { this.spend(1); return this.say('Тут лечить нечего.'); }
    this.spend(1); S.mana--;
    this.auto('лечение', 'навык мага, без броска: лечит всегда, тратит 1 силу');
    var h = HEROES[who].hp;
    if (S.hp[who] < h) { var d = this.dmg('лечит', 6, 2); S.hp[who] = Math.min(h, S.hp[who] + d); }
    this.say(who === 'mage' ? 'Ты кладёшь руки на ушибленное плечо — тепло. Тише. Дыши.' : this.T('Ты кладёшь руки на %' + who + '+% — тепло. «Тише. Дыши. Я здесь». %' + who + '% удивлённо моргает.'));
  };
  // П4: неизвестное дополнение — ответ про предмет (О5 «здесь такого нет», О6 «такого в мире нет»), а не молчание и не «Что взять?»
  var NEEDS_OBJ = { take: 1, throw: 1, shoot: 1, put: 1, use: 1, read: 1, give: 1, pull: 1, order: 1, steal: 1, open: 1, break: 1, drink: 1, eat: 1 };
  Game.prototype.refuseUnknown = function (verb, c, A) {
    if (!NEEDS_OBJ[verb]) return null;
    var hit = null, S = this.S;
    c.args.forEach(function (a) { if (!hit && (a.id === 'anach' || a.id === 'absent' || a.id === 'spear')) hit = a; });
    var kind = hit ? (hit.id === 'anach' ? 'anach' : 'absent') : null, word = hit ? hit.word : null;
    if (!hit && !A.item && !A.person && !A.dst && !A.with && !A.src && !A.behind && !A.self && c.unknown.length) {
      var u = c.unknown.filter(function (x) { return x.length > 2; });
      if (u.length) { kind = 'absent'; word = u[u.length - 1]; }
    }
    if (!kind) return null;
    this.spend(0);
    this.say(STUB + '«' + word + '» — ' + (kind === 'anach' ? 'такого в этом мире нет.' : 'здесь такого нет.'));
    return kind;
  };
  Game.prototype.h_grab = function (A, c) { // «хватаю человека»
    var S = this.S;
    if (S.phase === 'brawl') { this.spend(1); return this.h_shove(A, c); }
    return this.h_take({ item: A.person, person: A.person, manner: A.manner }, c);
  };
  Game.prototype.h_resist = function (A, c) {
    var S = this.S;
    if (S.phase === 'brawl') return this.h_hit(A, c);
    this.spend(0); this.say(STUB + 'Сопротивляться пока некому.');
  };
  Game.prototype.h_yield = function () {
    var S = this.S;
    if (S.phase === 'brawl') { this.spend(1); return this.say(STUB + 'Ты отходишь в сторону и смотришь.'); }
    this.spend(0); this.say(STUB + 'Сдаваться пока рано.');
  };
  Game.prototype.h_bribe = function () { this.spend(0); this.say(STUB + 'Взятку тут пока некому предложить.'); };
  Game.prototype.h_order = function (A) {
    var S = this.S, it = A.item || A.dst;
    if (it === 'milk') return this.h_take({ item: 'milk', manner: A.manner });
    if (!it || it === 'beer' || it === 'mug') return this.h_take({ item: 'beer', manner: A.manner });
    this.spend(0); this.say(STUB + 'У хозяина есть пиво и молоко.');
  };
  Game.prototype.h_distract = function (A) {
    var S = this.S, who = A.person || A.target;
    if (!who) { this.say('Кого отвлечь?'); S.pending = { verb: 'distract', A: A, ask: 'Кого отвлечь?' }; return { ok: false }; }
    this.spend(1); S.f.distract = who;
    this.say(STUB + (NAMES[who] || who).replace(/^./, function (m) { return m.toUpperCase(); }) + ' смотрит на тебя.');
  };
  Game.prototype.h_touch = function (A, c) {
    var S = this.S, who = A.person || A.target;
    if (!who) { this.spend(0); return this.say(STUB + 'Кого?'); }
    if (S.pc === 'mage' && who !== 'mage') return this.h_heal({ person: who, manner: A.manner });
    this.spend(1); this.say(STUB + 'Ты кладёшь руку на плечо — ' + (NAMES[who] || who) + ' молчит.');
  };
  Game.prototype.h_thanks = function (A) {
    var S = this.S; this.spend(1);
    this.say(STUB + 'Не за что' + (S.f.lastTalk ? ' — ' + (NAMES[S.f.lastTalk] || S.f.lastTalk) + ' кивает.' : '.'));
  };
  Game.prototype.h_kiss = function () { this.spend(0); this.say(STUB + 'Вы знакомы четверть часа. Ничего не меняется.'); };

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
      milk: hero !== 'nobby' ? 'Миска молока летит по дуге и садится капитану на голову, как шляпа. Молоко течёт по мундиру.' : pcTxt ? 'Миска молока летит по дуге — и садится капитану на голову, как шляпа. Молоко течёт по мундиру. Ты уже под столом: «Мурр».' : this.T('Миска молока взлетает — и садится капитану на голову, как шляпа. Молоко течёт по мундиру. %nobby% уже под столом: «Мурр».'),
      fork: hero !== 'elf' ? 'Вилка свистит через весь зал и прикалывает воротник капитана к стене. Он висит, как афиша.' : pcTxt ? this.T('Вилка свистит через весь зал и прикалывает воротник капитана к стене. Ты {e:бросал|бросала} не глядя.') : 'Вилка свистит через весь зал и прикалывает воротник капитана к стене. Эллион: — А можно ещё вилку?'
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
      if (S.beat === 3) { if (S.t >= 1) this.beatBrawlStart(); return; }
    } else if (S.phase === 'brawl') { this.brawlRound(); }
    else if (S.phase === 'arrest') { this.arrestEnd(); }
  };

  Game.prototype.beatChestStage1 = function (byPC) {
    var S = this.S; S.sub = 1; S.f.chestSeen = true; S.t = 0;
    this.say('Хозяин кивает и убирает руку с дверного проёма. Крышка откидывается сама, и среди топоров, ножей и ржавой поварёшки виден меч. Тусклый, без камней, с надписями на древнем языке. Тот самый, из видения. Сердце бьётся быстрее.\n— Чей? — шепчешь ты хозяину. Хозяин кивает в угол, на пустые лавки: там, у стены, сидит {g:здоровяк|силачка} с кружкой.');
    S.phase = 'evening'; S.at = 'door'; S.pos.mage = 'door';
  };
  Game.prototype.beatChestStage2 = function (byPC) {
    var S = this.S; S.beat = 1; S.t = 0; S.sub = 0; S.pos.mage = 'corner'; S.at = 'corner'; S.f.chestDone = true;
    this.say(this.T('Ты подсаживаешься к {g:здоровяку|силачке}. — Я тебя видел{l:|а}. Во сне.\n{g:Мечник|Мечница} не поднимает глаз от кружки: — Все так говорят, а потом просят денег.'));
    this.spend(1);
  };
  Game.prototype.beatChest = function () {
    var S = this.S; S.beat = 1; S.t = 0; S.f.chestDone = true; S.pos.mage = 'corner';
    if (S.pc === 'gab') this.say(this.T('У двери %mage% кладёт нож для трав в сундук — крышка откидывается сама, и среди топоров лежит меч. Твой. %mage% замирает, смотрит на сундук, на тебя, потом подходит к твоему столу и садится, без приглашения.\n— Я тебя видел{l:|а}. Во сне.\nТы не поднимаешь глаз от кружки: — Все так говорят, а потом просят денег.'));
    else this.say(this.T('У двери %mage% кладёт нож для трав в сундук — крышка откидывается сама, и среди топоров лежит меч, которого не может быть: тусклый, без камней, с надписями на древнем языке. %mage% замирает, потом кивает на сундук хозяину: «Чей?» Хозяин показывает подбородком в угол. %mage% подсаживается к {g:здоровяку|силачке}: — Я тебя видел{l:|а}. Во сне. — Все так говорят, а потом просят денег, — отвечает {g:мечник|мечница}, не поднимая глаз.'));
  };
  Game.prototype.beatTreat = function (byPC) {
    var S = this.S; S.beat = 2; S.t = 0; S.f.treat = true; S.pos.elf = 'bar';
    if (byPC) { S.at = 'bar'; this.spend(1);
      this.say(this.T('Ты подходишь к стойке и кладёшь на неё золотой. — Всем! — Зал ревёт. За одну монету — целый зал друзей. — Восхитительно!\nХозяин пробует монету на зуб, кивает и наливает. Ты чувствуешь себя частью человечества.'));
    } else this.say(this.T('Золотой звенит о стойку. — Всем! — говорит %elf%, и зал взрывается. %elf% в восторге: за одну монету — целый зал друзей. — Восхитительно!'));
    this.say(this.T((S.pc === 'elf' ? 'К тебе' : 'К эльф{e:у|ийке}') + ' у стойки протискивается задира — здоровый, небритый, пахнет чужим пивом. — Ты чё, {e:ушастый|ушастая}, самый богатый? — Он хватает за плащ.'));
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
      if (r.ok) line = 'Ты скользишь между столами, как тёплый сквозняк. Раз — и кошелёк исчез вместе с ремешком; {g:мечник|мечница} даже не {g:моргнул|моргнула}.';
      else line = 'Ты срезаешь кошелёк — и слишком громко: {g:мечник|мечница} хмурится и поворачивает голову. Ты уже в двух шагах, уже под чужой рукой, уже бежишь.';
      this.say(line);
    } else this.say(this.T('Пока задира сопит в лицо, что-то маленькое с зелёными глазами скользит между столами. Раз — и кошелёк {g:мечника|мечницы} исчез вместе с ремешком.'));
    // спасение
    var rowdyLine = S.pc === 'elf' ? 'Задира замахивается на тебя — и внезапно спотыкается о нечто маленькое: Нобби пролетает под его рукой и сбивает его с ног. Задира падает на скамью и не успевает ударить.' : 'Задира замахивается на {e:эльфа|эльфийку} — и внезапно падает: %nobby% пролетает под его рукой и сбивает его с ног, не останавливаясь. Драка отложена. {e:Эльф|Эльфийка} смотрит на {n:вора|воровку} так, будто {e:ему|ей} подарили лето: — Я {e:твой должник|твоя должница}.';
    if (S.pc === 'nobby') rowdyLine = 'Ты пролетаешь под рукой задиры, который занёс кулак на {e:красивого эльфа|красивую эльфийку}, и сбиваешь его с ног — просто потому, что он на дороге. {e:Эльф|Эльфийка} смотрит на тебя, как на подарок лета: — Я {e:твой должник|твоя должница}.';
    if (S.pc === 'elf') rowdyLine += ' Ты смотришь {n:ему|ей} вслед: — Я {e:твой должник|твоя должница}.';
    this.say(this.T(rowdyLine));
    if (S.pc === 'nobby') this.say(this.T('Пробегая мимо мага, ты замечаешь книгу на цепочке — тяжёлую, толстую, дорогую. «Книжка-то дороже кошелька», — думаешь ты.'));
    else if (S.pc !== 'mage') this.say(this.T('Пробегая мимо мага, %nobby% косится на книгу: — Книжка-то дороже кошелька.'));
    else this.say(this.T('Мимо тебя пролетает воришка, косится на книгу: — Книжка-то дороже кошелька, — бросает {n:он|она} на бегу. Ты хватаешься за цепочку — на месте.'));
    S.rowdyDown = true; w.rowdy.down = true;
    // драка начинается следующим ходом: реплика ≤ 1024 знаков (платформа Алисы), а кража и «Держи вора!» не в одном абзаце
    S.t = byPC ? -1 : 0;
  };
  Game.prototype.beatBrawlStart = function () {
    var S = this.S; S.phase = 'brawl'; S.b.round = 0; S.beat = 4; S.b.guardsAt = 5 + (S.w.door.prop ? (S.w.door.prop === 2 ? 2 : 1) : 0);
    S.w.rowdy.down = false;
    // подготовим очередь фирменных приёмов остальных
    S.b.sigQueue = ['gab', 'mage', 'nobby', 'elf'].filter(function (h) { return h !== S.pc; });
    this.say(this.T('Задира вскакивает, показывает пальцем на {n:вора|воровку}: — Держи {n:вора|воровку}! — И будто невзначай толкает в спину усатого человека у окна — в мундире, но без сабли. Кружка капитана летит на пол. — А этот ему помогал! Стража, называется!\nЗал взрывается. Капитан Лизард — судя по мундиру, капитан стражи его светлости, и он не на службе, — обливается пивом, багровеет и орёт: — Кто посмел?! Я — капитан стражи!\n' + (S.pc === 'gab' ? 'Ты встаёшь' : '{g:Мечник|Мечница} встаёт') + ': рука на поясе — кошелька нет. Табурет проносится над головами. Начинается драка.'));
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
    if (b.round >= b.guardsAt) {
      // вход стражи — самый длинный абзац: если ход уже длинный, стража входит на следующем (ответ ≤ 1024 знаков)
      if (!b.late && this.out.join('\n').length + this.guardsLen() > MAX_REPLY) { b.late = true; b.guardsAt++; }
      else this.guardsEnter();
    }
  };
  Game.prototype.guardsLen = function () { // сколько знаков займёт вход стражи (пробный прогон на копии мира)
    var keep = this.S, out = this.out;
    this.S = clone(keep); this.out = [];
    this.guardsEnter();
    var n = this.out.join('\n').length;
    this.S = keep; this.out = out;
    return n;
  };
  Game.prototype.guardsEnter = function () {
    var S = this.S, w = S.w, b = S.b;
    w.guards = true; S.phase = 'arrest'; S.hidden = false; S.pos.guard = 'door'; w.door.open = true; w.rowdy.gone = true; S.pos.rowdy = null;
    var held = b.ally >= 3;
    b.result = held ? 'held' : 'lost';
    // ТЕКСТ — черновик Диалогов (dialogue_s1_arrest.md, (а), вариант Б «свой мастер»); Алексей ещё не утвердил
    this.say(held ? 'Посреди зала стоите вы четверо, а все остальные лежат под столами. Поздравляю с победой, она продлится ещё минуту.' : 'Вы четверо сидите на полу среди табуреток, и кто победил, неясно. Я ставлю на табуретки.');
    this.say('Габ: — Четверо. Все здесь.');
    var door = w.door.prop ? (w.door.prop === 2 ? 'Тут сундук под дверью ползёт по полу: стража наваливается вшестером с криком «Именем его светлости!»' : 'Тут табурет под дверью хрустит, и стража входит прямо по обломкам: «Именем его светлости!»') : 'Тут дверь распахивается настежь. Стража входит с копьями и криком: «Именем его светлости!»';
    var L = w.lizard, cap = L.fork ? (L.down ? 'Капитан Лизард сидит под стеной, пришпиленный вилкой за воротник, мокрый до нитки.' : 'Капитан Лизард пришпилен вилкой к стене за воротник, мокрый до нитки.') : (L.down ? 'Капитан Лизард сидит на полу, мокрый до нитки.' : 'Капитан Лизард стоит посреди зала, мокрый до нитки.');
    var bits = [];
    if (L.moustache) bits.push('усы дымятся');
    if (L.milk) bits.push('по мундиру течёт молоко');
    if (L.table) bits.push('на плечах отпечаток столешницы');
    var second = bits.length ? ' ' + cap1(bits.join(', ')) + '.' : '';
    this.say(door + ' ' + cap + second);
    this.say('Лизард: — Взять их! Всех четверых! На виселицу! Они подняли руку на капитана его светлости!');
    var team = (S.players || [S.pc]);
    S.f.team = { order: team.slice(), dec: {}, i: 0 };
    S.pc = team[0];
    this.say((team.length > 1 ? 'Решаете по очереди, каждый за своего героя. ' : '') + this.heroCall(S.pc));
    S.sub = 9;
  };
  function cap1(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  // строка героя — состояние, а не решение (находки 43, 45)
  Game.prototype.heroCall = function (h) {
    return this.T({
      gab: '%gab%, твой меч в сундуке у двери. Между тобой и дверью шесть копий. Что делаешь?',
      elf: 'Эллион, одно твоё слово, и стража вытянется в струнку. Только потом обратно во дворец, где мишень не двигается. Что делаешь?',
      mage: '%mage%, в твоём видении были снег, таверна и меч. Стражи там не было. Что делаешь?',
      nobby: 'Нобби, чужой кошелёк у тебя за пазухой. Он звякает от каждого вдоха. Что делаешь?'
    }[h]);
  };
  Game.prototype.shortCall = function (h) { return this.T('Что делает ' + (h === 'mage' ? '%mage%' : h === 'gab' ? '%gab%' : h === 'elf' ? 'Эллион' : 'Нобби') + '?'); };

  // ---- арест: один решающий ход, терпение стражи 3, четыре исхода -----------------------------
  // ТЕКСТ — черновик Диалогов (dialogue_s1_arrest.md (б), (в), (г)); решения Алексея 1.10: «1А» (каждый за своего героя), «2Б» (серия 2 помнит исход)
  var RE = {
    run: /рвус\S*\s+(к|на)\s+(выход|двер|окн)|убег|удир|убеж|бегу|бежат|побег|прячус|спрячус|ныря|прыгаю в окно|лезу в окно|в окно|к окну|к двер|исчез|раство|проскальз|шмыгаю|смываюсь|выхожу|ухожу|выбегаю/,
    resist: /сопротивл|упира|упер|отбива|вырыва|лягаю|лягн|плюю|плюн|подножк|поедин|дуэл|бросаюсь|нападаю|дерусь|драться|(?:^|\s)бью|(?:^|\s)бей|ударю|пину|пина|кусаю|царапаю|толкаю|хвата\S*\s+(стражн|копь|капитан)|(беру|взять|хвачу)\s+(копь|стражн)|кидаю|швыряю|бросаю\s+(табурет|кружк|вилк|миск|стул)|колдую|жгу|стреляю/,
    calm: /сда[юеё]\S*сь|сдаем|сдаюсь|подчин|покор|смир|руки\s+(вверх|за)|подним\S*\s+рук|на колен|веди(?=\s|$)|ведите|иду\s+(с|за)\s+(ним|вам|страж)|не сопротивл|без (боя|сопротивл)|молч|(?:^|\s)стою|(?:^|\s)жду|ложусь|сажусь на пол|опускаю голов|сдаю|бросаю оружие|соглаша|делаю как|кива|не буду сопротивл/,
    plead: /умол|объясн|оправд|недоразум|это не мы|задир|герцог|светлост|пощад|прост[иь]|извин|подкуп|взятк|золотой|торгу|принцесс|принц(?=\s|$)|назыв|шепч|шепн|шепот|кричу|говорю|скажу|уговар|убежд|зову|зов[иу]|помогит|отдаю кошел|требую|прошу|клянус|обещаю|лечу|угощаю|заплач|плачу/
  };
  Game.prototype.arrestKind = function (verb, A, c) { // → { kind, how } | { idle: 'plain'|'person'|'weapon' }
    var S = this.S, raw = (c.raw || '').toLowerCase().replace(/ё/g, 'е');
    var heldWeapon = function (it) { return S.inv.indexOf(it) >= 0 || S.held === it; };
    if (/(?:^|\s)(пою|спою|пеню|песн)/.test(raw)) return { idle: 'plain' };
    if (/это не мы|недоразум|объясн|оправд|умол|убежд|уговар/.test(raw)) return { kind: 'plead', how: 'plain' };
    if (/проскальз|шмыг|исчез|раство/.test(raw)) return { kind: 'run', how: 'vanish' };
    if (/бросаю оружие|оружие на пол|сдаю оружие/.test(raw)) return { kind: 'calm', how: 'word' };
    // отказ — это выбор (А4)
    if (c.neg) {
      if (verb === 'go' || verb === 'flee') return { kind: 'resist', how: 'stand' };
      if (verb === 'hit' || verb === 'fight' || verb === 'resist' || verb === 'cast' || verb === 'shoot' || verb === 'throw' || verb === 'kick' || verb === 'yield' || verb === 'swing') return { kind: 'calm', how: 'refuse' };
      if (/не (дам|даюсь)/.test(raw)) return { kind: 'resist', how: 'stand' };
      return { idle: 'plain' };
    }
    if (/(достаю|вынимаю|вытаскиваю|беру)[^,]*(?:^|\s)(меч|лук)/.test(raw) || (verb === 'shoot' && !heldWeapon('bow')) || ((verb === 'hit' || verb === 'throw') && A.item && /^(sword|bow|knife)$/.test(A.item) && !heldWeapon(A.item))) return { idle: 'weapon' };
    if (/герцог|светлост/.test(raw)) return { kind: 'plead', how: 'duke' };
    if (/задир/.test(raw)) return { kind: 'plead', how: 'rowdy' };
    if (/шепч|шепн/.test(raw) || (c.manner && c.manner.whisper)) return { kind: 'plead', how: 'whisper' };
    if (/принцесс|принц(?=\s|$)|называ\S* себя|королев|наслед/.test(raw) && S.pc === 'elf') return { kind: 'plead', how: 'elf' };
    if (/отдаю\s+(свой\s+)?кошел|отда\S*\s+(кошел|деньги)/.test(raw) && S.pc === 'nobby') return { kind: 'plead', how: 'purse' };
    if (/подкуп|взятк|предлага\S*\s+(золот|монет|деньг)|золотой/.test(raw) && verb !== 'treat') return { kind: 'plead', how: 'bribe' };
    if ((verb === 'heal' || /леч/.test(raw)) && S.pc === 'mage') return { kind: 'plead', how: 'heal' };
    if (/хоч\S*\s+к\s+герцог|к герцог/.test(raw)) return { kind: 'plead', how: 'duke' };
    if (/иду\s+(с|за)\s+(ним|вам|страж)|^веди|ведите/.test(raw)) return { kind: 'calm', how: 'word' };
    if (/рвус\S*\s+(к|на)\s+(выход|двер|окн)/.test(raw)) return { kind: 'run', how: 'door' };
    if (/руки\s+(вверх|за)|подним\S*\s+рук|на колен|сда[юе]\S*сь|сдаем/.test(raw)) return { kind: 'calm', how: 'word' };
    if (RE.resist.test(raw) && !/хвата\S*\s+(кружк|вилк)/.test(raw) && verb !== 'cast') return { kind: 'resist', how: /кидаю|швыряю|бросаю\s/.test(raw) || verb === 'throw' ? 'throw' : (/сопротивл|упира|упер|отбива|вырыва|не дам|подножк|лягаю|лягн/.test(raw) ? 'stand' : 'strike') };
    if (verb === 'cast') return S.pc === 'mage' ? { kind: 'resist', how: 'spark' } : { idle: 'plain' };
    if (verb === 'resist' || verb === 'hit' || verb === 'kick' || verb === 'swing' || verb === 'shove' || verb === 'shoot' || verb === 'throw' || verb === 'fight' || verb === 'grab') return { kind: 'resist', how: verb === 'throw' ? 'throw' : (verb === 'resist' ? 'stand' : 'strike') };
    if (verb === 'take' && A.person && A.person !== 'self') return { kind: 'resist', how: 'strike' };
    if (RE.calm.test(raw) || verb === 'yield') return { kind: 'calm', how: 'word' };
    if ((verb === 'go' || verb === 'sit') && (A.person || A.target || A.company) && !/двер|окн|выход/.test(raw)) return { idle: 'person' };
    if (RE.run.test(raw) || verb === 'flee' || verb === 'hide' || verb === 'climb') return { kind: 'run', how: /окн|прыга|лезу/.test(raw) ? 'window' : /прячус|спрячус|ныря|под стол|за габа|за мага|за нобби/.test(raw) || verb === 'hide' ? 'hide' : /исчез|раство|проскальз|шмыг|толп/.test(raw) ? 'vanish' : 'door' };
    if (verb === 'go' || verb === 'push' || verb === 'pull') return /двер|выход|окн/.test(raw) ? { kind: 'run', how: /окн/.test(raw) ? 'window' : 'door' } : { idle: 'person' };
    if (RE.plead.test(raw) || verb === 'talk' || verb === 'give' || verb === 'treat' || verb === 'bribe' || verb === 'touch') return { kind: 'plead', how: 'plain' };
    if (verb === 'wait' || verb === 'put' || verb === 'stand' || verb === 'close' || verb === 'lock' || verb === 'block' || verb === 'cover') return { kind: 'calm', how: 'word' };
    return { idle: 'plain' };
  };
  var STAGE1 = {
    gab: 'Эй, {g:здоровяк|силачка}! Руки на виду. Сдаёшься, болтаешь, дерёшься или бежишь?',
    elf: 'Эй, {e:остроухий|остроухая}! Руки на виду. Сдаёшься, болтаешь, дерёшься или бежишь?',
    mage: 'Эй, с книжкой! Руки на виду. Сдаёшься, болтаешь, дерёшься или бежишь?',
    nobby: 'Эй, {n:мелкий|мелкая}! Руки на виду. Сдаёшься, болтаешь, дерёшься или бежишь?'
  };
  Game.prototype.arrestHint = function (stage, why, hero) { // 1 — стражник, 2 — Лизард (ступень 3 — исход «покорность по молчанию»)
    if (stage === 1) {
      if (why === 'person') return this.say('Стражник: — Куда? Стой, где стоишь. С друзьями наговоришься в камере.');
      if (why === 'weapon') return this.say('Стражник: — Не дёргайся. Оружие твоё в сундуке, а копьё вот оно.');
      return this.say('Стражник: — ' + (S_team(this) ? STAGE1[hero] : this.pick([STAGE1[hero], 'Хватит тянуть! Сдаёшься, болтаешь, дерёшься или бежишь? Решай, пока я добрый.'])));
    }
    return this.say(this.pick(['Лизард: — Что вы там копаетесь? Копья видите? Копья ждать не будут!', 'Лизард: — Именем его светлости! Последний раз спрашиваю! Сдаваться будем или как?']));
  };
  function S_team(g) { return g.S.f.team && g.S.f.team.order.length > 1; }
  var HELPLINE = 'Вокруг стража с копьями, в дверях двое, капитан орёт. Можно сдаться, заговорить, упереться или рвануть к окну.';
  Game.prototype.arrestFree = function (what) { // осмотр, инвентарь, «помощь»: до двух раз за сцену без траты терпения
    var S = this.S, n = S.f.arrestFree || 0;
    if (n >= 2) return false;
    S.f.arrestFree = n + 1; return true;
  };
  Game.prototype.heroName = function (h) { return h === 'gab' ? this.T('%gab%') : h === 'mage' ? this.T('%mage%') : h === 'elf' ? 'Эллион' : 'Нобби'; };
  var NAMED_AT_START = null;
  Game.prototype.arrestAct = function (verb, A, c, tr) {
    var S = this.S, T = this.T.bind(this), team = S.f.team, hero = S.pc;
    if (S.f.arrestDone) return { ok: false }; // решение уже принято в этом ходу: первое действие в цепочке решает
    // команда: «Габ бьёт стражника» — слово героя; героя без игрока ведёт ведущий
    var first = (c.tokens && c.tokens[0]) ? CS._nounMatch(c.tokens[0]) : null;
    if (first && ORDER.indexOf(first.id) >= 0 && first.id !== hero && c.tokens.length > 1) {
      var nh = first.id;
      if (team.order.indexOf(nh) < 0) { this.spend(0); this.say(this.T('%' + nh + '+% сегодня веду я, и {' + ({ gab: 'g', elf: 'e', mage: 'l', nobby: 'n' })[nh] + ':он|она} сдаётся без спора.'.replace('%nobby+%', 'Нобби')) + ' ' + this.shortCall(hero)); return { ok: false }; }
      if (team.dec[nh]) { this.spend(0); this.say(this.heroName(nh) + ' своё уже ' + (S.genders[nh] === 'f' ? 'решила' : 'решил') + '. ' + this.shortCall(hero)); return { ok: false }; }
      hero = nh; S.pc = nh;
    }
    var r = this.arrestKind(verb, A, c), kind = r.kind, how = r.how;
    S.f.idle = S.f.idle || {};
    if (r.idle) {
      if (this.idleTurn) return { ok: false };
      this.idleTurn = true;
      S.f.idle[hero] = (S.f.idle[hero] || 0) + 1;
      tr.note = (tr.note ? tr.note + '; ' : '') + 'арест: ход без решения, терпение ' + (3 - S.f.idle[hero]) + ' из 3';
      tr.resolved = { verb: verb, arrest: 'idle', patience: 3 - S.f.idle[hero] };
      if (S.f.idle[hero] < 3) { this.spend(0); this.arrestHint(S.f.idle[hero], r.idle, hero); return { ok: false }; }
      kind = 'calm'; how = 'idle';
    }
    tr.note = (tr.note ? tr.note + '; ' : '') + 'арест: ' + kind + '/' + how;
    tr.resolved = { verb: verb, arrest: kind, how: how };
    S.f.arrestDone = true;
    team.dec[hero] = { kind: kind, how: how, by: how === 'idle' ? 'idle' : 'word' };
    if (!S.f.arrest) { S.f.arrest = kind; S.f.arrestBy = how === 'idle' ? 'idle' : 'word'; }
    this.arrestLine(hero, kind, how, A, c);
    if (kind === 'resist') S.hp[hero] = Math.max(1, S.hp[hero] - 2);
    var left = team.order.filter(function (h) { return !team.dec[h]; });
    if (left.length) { // ход следующего героя; сцена идёт
      this.spend(0); S.pc = left[0]; this.say(this.shortCall(left[0]) );
    } else this.spend(1);
    return { done: true, verb: verb };
  };
  Game.prototype.arrestLine = function (h, kind, how, A, c) {
    var S = this.S, T = this.T.bind(this), pick = this.pick.bind(this), raw = (c.raw || '').toLowerCase(), t;
    var named = S_team(this);
    var lines = {
      resist: { strike: 'Ты бросаешься на ближнего стражника. Древко копья подсекает тебе ноги, и пол встречает тебя первым.', throw: 'Бросок смелый, но летит мимо. Через миг тебя держат двое, руки за спиной.', stand: 'Ты упираешься так, что стражники пыхтят. Тогда тебя просто поднимают под руки и несут.', spark: 'Искра срывается с пальцев и гаснет на мокром мундире капитана. Тебе тут же связывают руки за спиной.' },
      run: { door: 'Ты рвёшься к двери, но в проёме уже двое с копьями. Назад ты идёшь под конвоем.', window: 'До окна ты добегаешь. Окно узкое, а тебя уже держат за шиворот.', hide: 'Ты ныряешь под стол. Стражник заглядывает туда же и вежливо стучит копьём по ножке.', vanish: 'Ты пытаешься раствориться в толпе. Толпа расступается так дружно, что ты остаёшься {p:один|одна}.' },
      calm: { word: pick(['Ты поднимаешь руки. Стражник растерянно кивает: так вежливо ему сегодня ещё не сдавались.', 'Ты {p:сам|сама} протягиваешь руки. Стражник вяжет узел и впервые за вечер улыбается.']), refuse: 'Драться ты не собираешься, и стражник это ценит: руки вяжет не туго.', idle: pick(['Стражник пожимает плечами: молчание — знак согласия, и тебе связывают руки.', 'Стража ждёт ещё вдох и решает сама: тебе связывают руки.']) },
      plead: { plain: pick(['Лизард: — Молчать! Последнее слово скажете на виселице!', 'Лизард: — Молчать! Оправдываться будете в присутствии палача!']), duke: 'Лизард: — Его светлость с такими не знакомится! С такими знакомится палач!', rowdy: 'Лизард: — Какой ещё задира? Я вижу четверых. Четверых и повесим!', bribe: 'Лизард косится на монету, потом на свидетелей. Лизард: — Взятка! При свидетелях! Записать!', whisper: 'Ты шепчешь капитану на ухо. Лизард краснеет, потом бледнеет, потом орёт: «Виселица!»', elf: 'Слова уже на языке. Но вспоминается дворцовая тишина и библиотекарь старше стен, и ты закрываешь рот.', purse: 'Ты тянешься за пазуху. Лапа не слушается. Кошки добычу не отдают.', heal: 'Ты тянешься к капитану, чтобы полечить. Лизард: — Руки прочь! Это нападение на капитана его светлости!' }
    };
    if (kind === 'run' && h === 'nobby' && (how === 'door' || how === 'window')) t = 'Нобби, до свободы тебе остаётся шаг, когда стражник поднимает тебя за шиворот, как котёнка.';
    else t = (lines[kind] || {})[how] || lines[kind].plain || lines.calm.word;
    t = T(t);
    if (named && /^Ты /.test(t)) t = this.heroName(h) + ', ты' + t.slice(2);
    this.say(t);
  };
  Game.prototype.arrestEnd = function () {
    var S = this.S, team = S.f.team, T = this.T.bind(this);
    S.ended = true; S.phase = 'end';
    var rest = ['gab', 'elf', 'mage', 'nobby'].filter(function (h) { return !(team && team.dec[h]); });
    var NOPLAYER = { gab: 'Габ молча протягивает руки.', elf: 'Эллион {e:мог|могла} бы назвать себя и уйти, но молчит.', mage: '%mage% шепчет что-то о судьбе.', nobby: 'Нобби идёт тихо и не поднимает глаз.' };
    var parts = ['Стража уводит всех четверых.'];
    rest.forEach(function (h) { parts.push(NOPLAYER[h]); });
    parts.push('Задиры в суматохе нигде нет, а ваши вещи остаются в сундуке у двери.');
    var nobbyYou = S.pc === 'nobby' && !(team && team.order.length > 1);
    parts.push('Решётка лязгает. Кошелёк так и лежит у ' + (nobbyYou ? 'тебя' : 'Нобби') + ' за пазухой. Где-то наверху стражник говорит: «Герцог хочет их видеть. Лично».');
    this.say(T(parts.join(' ')));
    this.say('— конец серии 1 «Таверна» —');
    this.s2Stub();
  };
  // серия 2 («2Б»): выбор запоминается, реплику показываем заглушкой — серии 2 в бете нет
  Game.prototype.s2Stub = function () {
    var S = this.S, team = S.f.team, T = this.T.bind(this), notes = [];
    var LIZ = { resist: 'Вот {p:этот|эта}, ваша светлость! {p:Тот|Та}, что {p:брыкался|брыкалась}! Требую отдельную верёвку!', run: 'А {p:этот|эта} {p:бегал|бегала}, ваша светлость! В присутствии свидетелей!', calm: 'А {p:этот|эта} {p:шёл|шла} тихо, ваша светлость. Тихие — самые опасные, я их знаю!' };
    var keep = S.pc; S.f.s2 = {};
    Object.keys(team.dec).forEach(function (h) {
      var k = team.dec[h].kind; S.f.s2[h] = k; S.pc = h;
      notes.push(k === 'plead' ? T('Герцог: — Капитан говорит, вы много говорили, {p:сударь|сударыня}. Теперь, с вашего позволения, говорить буду я.') : T('Лизард: — ' + LIZ[k]));
    });
    S.pc = keep;
    this.notes = (this.notes || []).concat(['серия 2 — позже. Запомнено: ' + Object.keys(S.f.s2).map(function (h) { return h + ' — ' + S.f.s2[h]; }).join(', ') + '. Реплика-заглушка: ' + notes.join(' ')]);
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
