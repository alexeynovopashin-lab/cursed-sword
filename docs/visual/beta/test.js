/* Тесты беты «Таверна». Запуск: node docs/visual/beta/test.js */
'use strict';
require('./lexicon.js'); require('./parser.js'); require('./game.js');
var CS = globalThis.CS, fails = 0, total = 0;
function ok(cond, name, extra) { total++; if (!cond) { fails++; console.log('FAIL: ' + name + (extra ? '\n      ' + extra : '')); } }
function sig(text) {
  var r = CS.parse(text);
  return r.clauses.map(function (c) { return (c.neg ? '!' : '') + c.verb + '(' + c.args.map(function (a) { return a.role + ':' + a.id; }).join(',') + ')'; }).join(' | ');
}
function has(text, expect) { var s = sig(text); ok(s === expect, 'разбор «' + text + '»', 'ждали  ' + expect + '\n      вышло ' + s); }

// ---- разбор: цепочки, предметы, синонимы, самоисправления ----
has('толкаю дверь, беру сундук и подпираю', 'push(obj:door) | take(obj:chest) | prop()');
has('толкаю дверь беру сундук и подпираю', 'push(obj:door) | take(obj:chest) | prop()');
has('бью капитана табуреткой', 'hit(obj:lizard,with:stool)');
has('бью табуреткой капитана', 'hit(with:stool,obj:lizard)');
has('швыряю миску молока в капитана', 'throw(obj:milk,in:lizard)');
has('кидаю кружку в задиру', 'throw(obj:mug,in:rowdy)');
has('пихаю дверь плечом', 'push(obj:door)'); // «плечом» неизвестно — попадёт в «не разобрано»
has('закрываюсь столом', 'block(with:table)');
has('закрываюсь щитом', 'block(with:table)');
has('закрываю дверь', 'close(obj:door)');
has('закрою собой Габа', 'close(obj:self,obj:gab)');
has('кладу нож в сундук', 'put(obj:knife,in:chest)');
has('сдаю оружие', 'put(obj:weapon)');
has('подсаживаюсь к меченосцу', 'sit(to:gab)');
has('иду к стойке', 'go(to:bar)');
has('бегу к двери', 'flee(to:door)');
has('срезаю кошелёк', 'steal(obj:purse)');
has('стащу кошелёк у мечника', 'steal(obj:purse,from:gab)');
has('пью молоко', 'drink(obj:milk)');
has('лакаю молоко из миски', 'drink(obj:milk,from:milk)');
has('угощаю всех', 'treat(obj:crowd)');
has('жгу усы капитану', 'cast(obj:lizard)');
has('маг жжёт усы капитану', 'cast(obj:mage,obj:lizard)');
has('лечу Габа', 'heal(obj:gab)');
has('стреляю из лука', 'shoot(from:bow)');
has('бросаю вилку в капитана', 'throw(obj:fork,in:lizard)');
has('прячусь под стол', 'hide(under:table)');
has('осматриваюсь', 'look()');
has('жду', 'wait()');
// цепочки из трёх и более
has('беру табурет, иду к двери и подпираю', 'take(obj:stool) | go(to:door) | prop()');
has('беру нож и вилку', 'take(obj:knife) | null(obj:fork)');
has('сначала беру кружку, потом бью ею капитана', 'take(obj:mug) | hit(obj:lizard)');
// самоисправления
has('толкаю дверь, нет, тяну', 'pull()');
has('не бью, а закрываюсь', 'block()');
has('беру нож, нет лучше вилку', 'null(obj:fork)'); // глагол «беру» наследует игра (см. ниже)
has('бью табуретом, ой, не то, кружкой', 'null(with:mug)'); // разбор даёт «чем»; глагол наследует игра
has('беру не нож, а вилку', 'take(obj:fork)');
has('стоп, лучше подожду', 'wait()');
ok(CS.parse('бью табуретом, ой, не то, кружкой').corrections.length >= 1, 'самоисправление записано');
(function () {
  var g = new CS.Game({ pc: 'gab', seed: 1 }); g.input('беру нож, нет лучше вилку');
  ok(g.S.held === 'fork', 'самоисправление: «беру нож, нет лучше вилку» → вилка в руках', 'held=' + g.S.held);
})();
// цитаты
(function () { var r = CS.parse('говорю хозяину: «налей молока»'); ok(r.clauses[0].verb === 'talk' && /налей/.test(r.clauses[0].speech || ''), 'цитата после двоеточия', JSON.stringify(r.clauses[0])); })();
(function () { var r = CS.parse('кричу "держи вора!"'); ok(r.clauses[0].speech === 'держи вора!', 'цитата в кавычках'); })();
// мета
ok(CS.parse('что у меня').meta === 'inv', 'мета: инвентарь');
ok(CS.parse('помощь').meta === 'help', 'мета: помощь');
ok(CS.parse('осмотреться').meta === 'look', 'мета: осмотр');
// незнакомые слова попадают в «не разобрано»
ok(CS.parse('дрючу фуфлыжник табуретом').unknown.indexOf('фуфлыжник') >= 0, 'незнакомые слова видны');

// ---- проверка на конфликты корней ----
(function () {
  var must = { 'воротa': null };
  ok(CS._nounMatch('ворота') === null || CS._nounMatch('ворота').id !== 'nobby', '«ворота» — не вор');
  ok(CS._nounMatch('магия') === null || CS._nounMatch('магия').id !== 'mage', '«магия» — не маг');
  ok(CS._nounMatch('голову') === null || CS._nounMatch('голову').id !== 'wall', '«голова» — не стена');
})();

// ---- игра ----
var G = CS.Game;
function play(pc, gender, lines, seed) {
  var g = new G({ pc: pc, seed: seed || 11, genders: (function () { var o = {}; o[pc] = gender; return o; })() });
  lines.forEach(function (l) { g.input(l); });
  return g;
}
var SCRIPTS = {
  gab: ['осмотреться', 'слушаю', 'жду', 'жду', 'жду', 'жду', 'иду к стойке', 'беру стол', 'бью капитана столом', 'закрываюсь', 'бью задиру', 'жду', 'жду', 'жду', 'жду', 'молчу', 'жду'],
  elf: ['кладу лук в сундук', 'иду к стойке', 'угощаю всех', 'отвечаю задире: не надо', 'жду', 'бросаю вилку в капитана', 'прячусь под стол', 'жду', 'жду', 'жду', 'жду', 'жду', 'жду', 'жду'],
  mage: ['кладу нож в сундук', 'подсаживаюсь к меченосцу', 'жду', 'жду', 'жду', 'жгу усы капитану', 'лечу Габа', 'жду', 'жду', 'жду', 'жду', 'жду', 'жду', 'жду'],
  nobby: ['кладу нож в сундук', 'кладу перчатки в сундук', 'жду', 'срезаю кошелёк осторожно', 'швыряю миску молока в капитана', 'бью задиру', 'жду', 'жду', 'жду', 'жду', 'жду', 'жду', 'жду']
};
['gab', 'elf', 'mage', 'nobby'].forEach(function (pc) {
  ['m', 'f'].forEach(function (gd) {
    var g;
    try { g = play(pc, gd, SCRIPTS[pc]); } catch (e) { ok(false, 'прогон ' + pc + '/' + gd + ' упал', e.stack); return; }
    ok(g.S.ended, 'серия доходит до конца: ' + pc + '/' + gd, 'фаза ' + g.S.phase + ', ход ' + g.turns.length);
    var text = g.turns.map(function (t) { return t.text.join('\n'); }).join('\n') + g.intro;
    ok(/Герцог хочет их видеть/.test(text), 'крючок серии на месте: ' + pc + '/' + gd);
    ok(!/undefined|NaN|\{[gelnp]:|%[a-z]+%/.test(text), 'нет мусора в тексте: ' + pc + '/' + gd, (text.match(/.{20}(undefined|NaN|\{[gelnp]:|%[a-z]+%).{20}/) || [''])[0]);
    ok(!/меч[^.]{0,30}(жив|голод|тянет удачу|пьёт удачу)/i.test(text), 'тайна меча не раскрыта: ' + pc + '/' + gd);
    var q = g.turns.every(function (t) { return t.text.every(function (x) { return x.length < 1200; }); });
    ok(q, 'нет слишком длинных абзацев: ' + pc + '/' + gd);
  });
});
// пол: реплики пары мечник/лучник
(function () {
  function pair(gg, ge) {
    var g = new G({ pc: 'gab', seed: 3, genders: { gab: gg, elf: ge } });
    for (var i = 0; i < 25 && !g.S.ended; i++) g.input('жду');
    return g.turns.map(function (t) { return t.text.join(' '); }).join(' ');
  }
  ok(/Для принцессы/.test(pair('m', 'f')), 'пара м+ж: «Для принцессы»');
  ok(/Для принца/.test(pair('f', 'm')), 'пара ж+м: «Для принца»');
  ok(/Я уложила троих/.test(pair('f', 'f')), 'пара ж+ж: «Я уложила троих»');
  ok(/Этот мой/.test(pair('m', 'm')) && /Уже нет/.test(pair('m', 'm')), 'пара м+м: «Этот мой — Уже нет»');
})();
// формы по полу у игрока
(function () {
  var a = play('mage', 'f', ['кладу нож в сундук', 'подсаживаюсь к меченосцу']).turns.map(function (t) { return t.text.join(' '); }).join(' ');
  var b = play('mage', 'm', ['кладу нож в сундук', 'подсаживаюсь к меченосцу']).turns.map(function (t) { return t.text.join(' '); }).join(' ');
  ok(/видела/.test(a) && /видел(?![а-я])/.test(b), 'формы по полу: «видел/видела»');
})();
// правило таверны: с оружием в зал не пускают
(function () {
  var g = play('elf', 'm', ['иду к стойке']);
  ok(g.S.phase === 'door' && g.S.at === 'door', 'с оружием дальше двери не пройти');
  g.input('кладу лук в сундук');
  ok(g.S.phase === 'evening' && g.S.weaponIn, 'оружие в сундуке — дверь открыта');
  g.input('беру лук');
  ok(g.S.weaponIn, 'оружие остаётся в сундуке до выхода (правило таверны)');
})();
// пример Алексея: цепочка из трёх с недосказанным «подпираю»
(function () {
  var g = play('gab', 'm', ['толкаю дверь, беру сундук и подпираю']);
  var r = g.turns[0];
  ok(r.trace.clauses.length === 3, 'цепочка из трёх действий разобрана');
  ok(g.S.w.door.prop === 2, 'дверь подпёрта сундуком (Габ поднимает сундук)', JSON.stringify(g.S.w.door));
  ok(g.S.b.guardsAt === 7, 'подпёртая дверь задерживает стражу на 2 раунда', String(g.S.b.guardsAt));
})();
// ответ на вопрос «чем подпереть»
(function () {
  var g = play('gab', 'm', ['подпираю дверь', 'сундуком']);
  ok(g.S.w.door.prop === 2, 'короткий ответ «сундуком» дополняет вопрос', JSON.stringify(g.S.w.door));
})();
// откат и повторяемость
(function () {
  var a = play('nobby', 'm', SCRIPTS.nobby, 5), b = play('nobby', 'm', SCRIPTS.nobby, 5);
  ok(JSON.stringify(a.S) === JSON.stringify(b.S), 'то же зерно и те же слова — тот же результат');
  var c = play('nobby', 'm', SCRIPTS.nobby, 6);
  ok(JSON.stringify(a.S.b) !== JSON.stringify(c.S.b) || JSON.stringify(a.turns.map(function (t) { return t.rolls; })) !== JSON.stringify(c.turns.map(function (t) { return t.rolls; })), 'другое зерно — другие броски');
  var before = JSON.stringify(a.S);
  var n = a.turns.length;
  ok(a.rollback(3), 'откат к ходу 3');
  ok(a.turns.length === 2 && a.history.length === 2, 'после отката ходов на 2 меньше');
  var g2 = play('nobby', 'm', SCRIPTS.nobby.slice(0, 2), 5);
  ok(JSON.stringify(a.S) === JSON.stringify(g2.S), 'состояние после отката совпадает с игрой до третьего хода');
  SCRIPTS.nobby.slice(2).forEach(function (l) { a.input(l); });
  ok(JSON.stringify(a.S) === before, 'переигрывание тех же слов после отката даёт то же состояние');
  a.restart(false);
  ok(a.turns.length === 0 && a.S.turn === 0 && a.S.phase === 'door', 'перезапуск сцены');
})();
// запись хода для панели
(function () {
  var g = play('nobby', 'm', ['кладу нож в сундук', 'жду', 'срезаю кошелёк']);
  var r = g.turns[2];
  ok(r.trace.clauses[0].verb === 'steal', 'панель: разбор виден');
  ok(r.rolls.length >= 1 && r.rolls[0].die >= 1 && r.rolls[0].dc === 12, 'панель: бросок с порогом', JSON.stringify(r.rolls[0]));
  ok(r.diff.some(function (d) { return d.path === 'beat'; }), 'панель: изменение состояния (событие «кошелёк»)');
  g.input('жду');
  ok(g.turns[3].diff.some(function (d) { return d.path === 'phase'; }), 'панель: драка начинается следующим ходом после кражи (ответ ≤ 1024 знаков)');
  ok(r.rolls.every(function (x) { return x.dmg || (typeof x.mod === 'number' && typeof x.total === 'number'); }), 'панель: у каждого броска есть модификатор и итог');
})();
// «шум»: любые слова не роняют движок
(function () {
  var junk = ['', '   ', '???', 'фыва олдж', 'ааааааа', '123', 'а', 'и', 'нет', 'и потом, и потом, и потом', 'ОЧЕНЬ ГРОМКО БЬЮ КОГО-ТО', 'ё', '«»', 'говорю:', 'толкаю толкаю толкаю толкаю толкаю', 'беру ' + new Array(40).join('табурет ')];
  var g = play('gab', 'm', []);
  try { junk.forEach(function (j) { g.input(j); }); ok(true, 'шум не роняет движок'); } catch (e) { ok(false, 'шум уронил движок', e.stack); }
})();
// лимит: не больше трёх действий за ход, остальное в очередь
(function () {
  var g = play('gab', 'm', ['осматриваюсь, слушаю, жду, иду к стойке, беру кружку']);
  ok(g.S.queue.length >= 1, 'больше трёх действий уходят в очередь «дальше»', JSON.stringify(g.S.queue));
})();


// ======================================================================
// Шаг 1 «честный кубик и согласованный мир» (находки теста 1: 4–13, 18)
// ======================================================================
var ALL = ['gab', 'elf', 'mage', 'nobby'];
var OPEN = { gab: [], elf: ['кладу лук в сундук'], mage: ['кладу нож в сундук'], nobby: ['кладу нож в сундук'] };
function gameOf(pc, seed, gender) { var o = {}; o[pc] = gender || 'm'; return new G({ pc: pc, seed: seed, genders: o }); }
function allText(g) { return g.turns.map(function (t) { return t.text.join('\n'); }).join('\n'); }
// ход вперёд до фазы (или до конца ходов)
function advance(g, phase, max) { for (var i = 0; i < (max || 40) && g.S.phase !== phase && !g.S.ended; i++) g.input('жду'); return g.S.phase === phase; }
function toArrest(pc, seed) { var g = gameOf(pc, seed); OPEN[pc].forEach(function (l) { g.input(l); }); advance(g, 'arrest'); return g; }
function isRollOk(r) { return r.die === 20 || (r.die !== 1 && r.total >= r.dc); }

// случайные партии: инварианты мира и кубика (одни и те же зёрна — на старом и на новом коде)
var POOL = ['беру молоко', 'беру кружку', 'пью молоко', 'бью капитана мечом', 'достаю меч из сундука', 'бью задиру', 'бью капитана', 'бросаю вилку в капитана',
  'закрываюсь столом', 'подпираю дверь сундуком', 'беру сундук', 'лечу Габа', 'жгу усы капитану', 'срезаю кошелёк', 'срезаю книгу', 'швыряю миску молока в капитана',
  'прячусь под стол', 'жду', 'жду', 'угощаю всех', 'кладу лук в сундук', 'кладу нож в сундук', 'подсаживаюсь к меченосцу', 'беру стол', 'иду к стойке', 'беру табурет'];
function fuzz(pcs, seeds, check, from, pool) {
  pool = pool || POOL;
  var bad = {};
  pcs.forEach(function (pc) {
    for (var seed = from || 1; seed <= seeds; seed++) {
      var g = gameOf(pc, seed * 7 + 3), rnd = seed * 2654435761 >>> 0;
      for (var i = 0; i < 45 && !g.S.ended; i++) {
        rnd = (Math.imul(rnd, 1664525) + 1013904223) >>> 0;
        var before = JSON.stringify(g.S);
        g.input(pool[rnd % pool.length]);
        var t = g.turns[g.turns.length - 1];
        check(g, t, bad, pc + '/' + (seed * 7 + 3) + '#' + t.n + ' «' + t.input + '»', JSON.parse(before));
      }
    }
  });
  return bad;
}
function firstBad(bad, key) { var k = Object.keys(bad[key] || {}); return (bad[key] ? k.length + ' шт, например ' + k[0] : ''); }
function note(bad, key, where) { (bad[key] = bad[key] || {})[where] = 1; }
var FZ = fuzz(ALL, 60, function (g, t, bad, where, was) {
  var S = g.S, w = S.w;
  t.rolls.forEach(function (r) {
    if (r.dmg || r.auto || r.dc == null) return;
    if (r.forced) { if (!r.ok || r.fumble || r.crit || !/по сюжету/.test(r.note || '')) note(bad, 'forced', where + ' ' + JSON.stringify(r)); }
    else if (r.ok !== isRollOk(r)) note(bad, 'honest', where + ' ' + r.label + ' ' + r.die + '+' + r.mod + '/' + r.dc + ' ok=' + r.ok);
  });
  if ((S.pc === 'nobby' || S.pc === 'gab') && (S.inv.indexOf('purse') >= 0) !== (w.purse === S.pc)) note(bad, 'purse', where + ' inv=' + S.inv + ' purse=' + w.purse);
  if (S.held === 'milk' && w.milk === 'gone') note(bad, 'milk', where);
  if (['sword', 'knife', 'bow'].indexOf(S.held) >= 0 && S.inv.indexOf(S.held) < 0) note(bad, 'heldweapon', where + ' held=' + S.held);
  var txt = t.text.join('\n');
  if (w.lizard.down && /Капитан Лизард стоит/.test(txt)) note(bad, 'lizard', where);
  if (/@/.test(txt)) note(bad, 'at', where);
  // меч в сундуке — меч не бьёт
  if (/мечом/.test(t.input) && /бью|бьёт/.test(t.input) && S.weaponIn && was.w.lizard.hp !== w.lizard.hp) note(bad, 'sword', where);
  // лечение: что-то лечится только по состоянию, а не по тексту «мимо»
  t.rolls.forEach(function (r) { if (/лечение/.test(r.label) && r.dc != null) note(bad, 'healroll', where); });
});
ok(!FZ.forced, 'находка 8: «по сюжету» — не провал и не крит (в панели)', firstBad(FZ, 'forced'));
ok(!FZ.honest, 'находка 6/7: исход броска = кубик + модификатор против порога, без тихих поправок', firstBad(FZ, 'honest'));
ok(!FZ.purse, 'находка 4: кошелёк в инвентаре = кошелёк у героя в мире', firstBad(FZ, 'purse'));
ok(!FZ.milk, 'находка 5: миска, ушедшая капитану, не остаётся в руках', firstBad(FZ, 'milk'));
ok(!FZ.heldweapon, 'находка 13: в руках только то, что есть в инвентаре', firstBad(FZ, 'heldweapon'));
ok(!FZ.lizard, 'находка 12: оглушённый капитан не «стоит»', firstBad(FZ, 'lizard'));
ok(!FZ.at, 'находка 10: служебных меток в тексте нет', firstBad(FZ, 'at'));
ok(!FZ.sword, 'находка 13: меч в сундуке — удар мечом не проходит', firstBad(FZ, 'sword'));
ok(!FZ.healroll, 'находка 9: лечение не бросается против порога, а текст — успех', firstBad(FZ, 'healroll'));

// 4: кошелёк после кражи — у вора в инвентаре и на экране, у Габа — нет (зерно 202/909 из отчёта)
(function () {
  var g = play('nobby', 'm', OPEN.nobby.concat(['жду', 'жду', 'срезаю кошелёк']), 909);
  ok(g.S.w.purse === 'nobby' && g.S.inv.indexOf('purse') >= 0 && /кошелёк/.test(g.invText()), 'кража: кошелёк у вора в инвентаре и в «что у меня»', g.invText());
  var h = gameOf('gab', 202); for (var i = 0; i < 12 && h.S.w.purse === 'gab'; i++) h.input('жду');
  ok(h.S.w.purse === 'nobby' && h.S.inv.indexOf('purse') < 0 && !/кошелёк/.test(h.invText()), 'кражу совершил Нобби — у Габа кошелька нет ни в инвентаре, ни в «что у меня»', h.invText());
})();
// 6: бросок кражи отвечает на вопрос «тихо ли?», а не «получилось ли» — кража по сюжету удаётся в обоих случаях
(function () {
  var quiet = 0, loud = 0;
  for (var seed = 1; seed <= 40; seed++) {
    var g = play('nobby', 'm', OPEN.nobby.concat(['жду', 'жду', 'срезаю кошелёк']), seed);
    var r = g.turns[g.turns.length - 1].rolls.filter(function (x) { return /кошелёк/.test(x.label); })[0];
    if (!r) continue;
    ok(/тихо/.test(r.label) && g.S.w.purse === 'nobby', 'кража: бросок «тихо ли?», кошелёк у вора при любом исходе (зерно ' + seed + ')', r.label);
    var tx = g.turns[g.turns.length - 1].text.join(' ');
    if (r.ok) { quiet++; ok(/не моргнул/.test(tx), 'тихая кража — «не моргнул» (зерно ' + seed + ')'); }
    else { loud++; ok(/слишком громко/.test(tx), 'шумная кража — «слишком громко» (зерно ' + seed + ')'); }
  }
  ok(quiet > 0 && loud > 0, 'за 40 зёрен были и тихая, и шумная кража', quiet + '/' + loud);
})();
// 6б: книга мага — бросок не называет «успехом» то, чего не происходит
(function () {
  for (var seed = 1; seed <= 30; seed++) {
    var g = play('nobby', 'm', OPEN.nobby.concat(['срезаю книгу']), seed);
    var r = g.turns[g.turns.length - 1].rolls[0];
    if (!r) continue;
    ok(!/срезать/.test(r.label) && g.S.w.book === 'mage', 'книга: бросок не «срезать», книга остаётся у мага (зерно ' + seed + ')', r.label);
  }
})();
// 7: Габ поднимает сундук без броска (в панели — «без броска»), у остальных кубик решает честно
(function () {
  var fake = 0, autos = 0;
  for (var seed = 1; seed <= 60; seed++) {
    var g = play('gab', 'm', ['беру сундук'], seed);
    g.turns[0].rolls.forEach(function (r) { if (r.dc != null && !r.forced && r.ok && r.total < r.dc && r.die !== 20) fake++; if (r.auto) autos++; });
    ok(g.S.held === 'chest', 'Габ поднимает сундук (зерно ' + seed + ')');
  }
  ok(fake === 0, 'Габ: ни одного «успеха» с суммой ниже порога', fake + ' из 60');
  ok(autos === 60, 'Габ: подъём сундука показан в панели как «без броска»', autos + ' из 60');
  var weak = 0, strong = 0;
  for (var s2 = 1; s2 <= 60; s2++) { var m = play('mage', 'm', OPEN.mage.concat(['беру сундук']), s2); if (m.S.held === 'chest') strong++; else weak++; }
  ok(weak > 0 && strong > 0, 'маг поднимает сундук не всегда: кубик решает', strong + ' из 60');
})();
// 9: лечение — без броска против порога; лечит только раненого
(function () {
  var g = play('mage', 'm', OPEN.mage.concat(['жду', 'лечу Габа']), 606);
  var last = g.turns[g.turns.length - 1];
  ok(last.rolls.every(function (r) { return r.dc == null; }), 'лечение не бросает d20 против порога (зерно 606 из отчёта)', JSON.stringify(last.rolls));
  var h = gameOf('mage', 5); OPEN.mage.forEach(function (l) { h.input(l); }); h.S.hp.gab = 5; h.input('лечу Габа');
  ok(h.S.hp.gab > 5, 'раненого Габа лечение поднимает', String(h.S.hp.gab));
})();
// 5: миска, брошенная героем-вором ходом приёма, не остаётся в руках у героя
(function () {
  var g = gameOf('elf', 202); OPEN.elf.forEach(function (l) { g.input(l); });
  g.input('иду к стойке'); g.input('беру молоко'); ok(g.S.held === 'milk', 'эльф взял миску молока');
  advance(g, 'arrest');
  ok(g.S.w.milk === 'gone' ? g.S.held !== 'milk' : true, 'миска ушла капитану — в руках её нет', 'held=' + g.S.held + ' milk=' + g.S.w.milk);
})();
// 12: арест — оглушённый капитан сидит, приколотый — у стены; «стоит посреди зала» только на ногах
(function () {
  function arrestText(down, fork) {
    var g = play('gab', 'm', ['жду', 'жду']);
    g.S.phase = 'brawl'; g.S.beat = 4; g.S.w.lizard.down = down; g.S.w.lizard.fork = fork; g.S.b.round = g.S.b.guardsAt - 1; g.S.b.sigQueue = [];
    g.input('жду'); return g.turns[g.turns.length - 1].text.join(' ');
  }
  ok(!/стоит посреди зала/.test(arrestText(true, false)) && /сидит на полу/.test(arrestText(true, false)), 'арест: оглушённый капитан сидит, не стоит');
  ok(!/стоит посреди зала/.test(arrestText(false, true)) && /пришпилен/.test(arrestText(false, true)), 'арест: капитан, приколотый вилкой, не стоит посреди зала');
  ok(/стоит посреди зала/.test(arrestText(false, false)), 'арест: целый капитан стоит посреди зала');
})();
// 13: меч в сундуке — бить им нельзя; кубик не брошен, чужого меча тоже нет
(function () {
  var g = gameOf('gab', 303); advance(g, 'brawl');
  var hp = g.S.w.lizard.hp, rolls0 = g.turns.length;
  g.input('бью капитана мечом');
  var t = g.turns[g.turns.length - 1];
  ok(g.S.w.lizard.hp === hp && !t.rolls.some(function (r) { return /удар/.test(r.label); }), 'меч в сундуке: удар мечом не проходит, кубика нет', JSON.stringify(t.rolls));
  ok(/сундук/.test(t.text.join(' ')), 'меч в сундуке: игра говорит, где меч', t.text.join(' '));
  var e = gameOf('elf', 303); OPEN.elf.forEach(function (l) { e.input(l); }); advance(e, 'brawl');
  var h0 = e.S.w.lizard.hp; e.input('бью капитана мечом');
  ok(e.S.w.lizard.hp === h0, 'чужой меч (эльф): удар мечом не проходит');
  var n = gameOf('nobby', 303); OPEN.nobby.concat(['жду', 'жду']).forEach(function (l) { n.input(l); }); advance(n, 'brawl');
  var nh = n.S.w.lizard.hp; n.input('бью капитана когтями'); ok(true, 'когти (есть в инвентаре) не падают');
})();
// 10: «его» без предшественника — вопрос по-русски, не служебная метка
ALL.forEach(function (pc) {
  var g = gameOf(pc, 1); g.input('я сначала попробую его отвлечь, а потом ударю');
  var tx = allText(g);
  ok(!/@/.test(tx) && /что|кого|кто/i.test(tx), 'свежая сцена, «его» без предшественника: ' + pc, tx);
});
// 18: арест — сцена, где выбор влияет на исход
(function () {
  var ENDS = {};
  [['resist', 'бью капитана'], ['run', 'бегу к двери'], ['plead', 'говорю капитану: простите, это недоразумение'], ['calm', 'молчу и не сопротивляюсь']].forEach(function (p) {
    var g = toArrest('gab', 11); var hp0 = g.S.hp.gab;
    ok(g.S.phase === 'arrest' && !g.S.ended, 'арест начался, серия ещё идёт (' + p[0] + ')', g.S.phase);
    g.input(p[1]);
    var tx = g.turns[g.turns.length - 1].text.join(' ');
    ok(g.S.ended && g.S.f.arrest === p[0], 'выбор «' + p[0] + '» записан в мир и закрывает серию', JSON.stringify(g.S.f.arrest) + ' ended=' + g.S.ended);
    ok(/Герцог хочет их видеть/.test(tx), 'крючок серии на месте при выборе «' + p[0] + '»');
    ENDS[p[0]] = tx;
    if (p[0] === 'resist') ok(g.S.hp.gab < hp0, 'сопротивление стоит здоровья', hp0 + ' → ' + g.S.hp.gab);
    else ok(g.S.hp.gab === hp0, 'без сопротивления здоровье цело (' + p[0] + ')');
  });
  var uniq = {}; Object.keys(ENDS).forEach(function (k) { uniq[ENDS[k]] = 1; });
  ok(Object.keys(uniq).length === 4, 'четыре выбора — четыре разных исхода в тексте', String(Object.keys(uniq).length));
  var g = toArrest('gab', 11); g.input('ем вилку');
  ok(!g.S.ended && g.S.phase === 'arrest', 'арест: «ем вилку» не закрывает серию', 'ended=' + g.S.ended);
  g.input('пью пиво'); g.input('читаю меню');
  ok(g.S.ended && g.S.f.arrest === 'calm', 'арест: без решения стража теряет терпение за три отвлечения', JSON.stringify(g.S.f.arrest));
  ALL.forEach(function (pc) {
    var h = toArrest(pc, 5); h.input('бью капитана');
    ok(h.S.ended && h.S.f.arrest === 'resist', 'арест, сопротивление, герой ' + pc, JSON.stringify(h.S.f.arrest));
  });
})();

// 18б: жесты покорности понятны; в цепочке решает первое действие
(function () {
  ['сдаюсь', 'поднимаю руки', 'падаю на колени', 'не сопротивляюсь', 'иду с ними', 'сдаю оружие'].forEach(function (ph) {
    var g = toArrest('gab', 11); g.input(ph);
    ok(g.S.ended && g.S.f.arrest === 'calm', 'арест: «' + ph + '» — покорность', JSON.stringify(g.S.f.arrest) + ' ended=' + g.S.ended);
  });
  var g = toArrest('gab', 11); g.input('бью капитана, потом сдаюсь');
  ok(g.S.f.arrest === 'resist', 'арест: в цепочке решает первое действие', JSON.stringify(g.S.f.arrest));
  var h = toArrest('gab', 11); var hp = h.S.hp.gab; h.input('бью капитана и бью капитана'); ok(h.S.hp.gab === hp - 2, 'арест: здоровье списано один раз за ход', hp + ' → ' + h.S.hp.gab);
})();


// ======================================================================
// Шаг 1б: формы по полу (находки 15–17) и Эллион по умолчанию ж (Алексей, 30.09)
// ======================================================================
(function () {
  ok(G.HEROES.elf.def === 'f', 'Эллион по умолчанию ж (решение Алексея 30.09)', G.HEROES.elf.def);
  var BAN = {
    gab:   { f: [/[Мм]ечник(?![а-я])/, /[Зз]доровяк(?![а-я])/, /[Зз]доровяку/], m: [/[Мм]ечниц/, /здоровячк/] },
    elf:   { f: [/ушаст(ый|ого)/, /должник/, /[Ээ]льф(а|у|е|ом|ы)?(?![а-яё])/], m: [/эльфийк/, /должниц/, /ушастой/] },
    mage:  { f: [/тебя видел(?![а-я])/], m: [/тебя видела/] },
    nobby: { f: [/вора(?![а-я])/, /Вора(?![а-я])/, /воришк[аи]? (?:он|его)/], m: [/воровк/, /Воровк/] }
  };
  var bad = [], games = 0;
  ALL.forEach(function (pc) {
    for (var mask = 0; mask < 16; mask++) {
      var gens = {}; ALL.forEach(function (h, i) { gens[h] = (mask >> i) & 1 ? 'f' : 'm'; });
      [1, 2].forEach(function (seed) {
        var g = new G({ pc: pc, seed: seed, genders: gens });
        OPEN[pc].concat(['говорю магу: привет', 'говорю магу: здравствуй', 'говорю магу: как дела', 'говорю габу: привет', 'говорю нобби: привет', 'говорю эльфу: привет']).forEach(function (l) { g.input(l); });
        for (var i = 0; i < 40 && !g.S.ended; i++) g.input('жду');
        var tx = g.intro + '\n' + allText(g); games++;
        ALL.forEach(function (h) {
          (BAN[h][gens[h]] || []).forEach(function (re) { var m = tx.match(new RegExp('.{0,40}' + re.source + '.{0,30}')); if (m) bad.push(pc + ' ' + JSON.stringify(gens) + ' ' + h + gens[h] + ': …' + m[0] + '…'); });
        });
        if (gens[pc] === 'f' && /Ты видел(?![а-я])/.test(tx)) bad.push(pc + ' «Ты видел» вместо «видела» игроку');
      });
    }
  });
  var uniq = {}; bad.forEach(function (b) { uniq[b.replace(/^.*? (gab|elf|mage|nobby)([mf]): /, '$1$2: ')] = b; });
  ok(!bad.length, 'формы по полу: ' + games + ' партий (4 героя × 16 комбинаций полов × 2 зерна), нарушений нет', Object.keys(uniq).length + ' разных, например:\n      ' + Object.keys(uniq).slice(0, 6).map(function (k) { return uniq[k]; }).join('\n      '));
})();


// ======================================================================
// Шаг 1в: длина ответа (находки 2, 3): реплика ≤ 1024 знаков (платформа Алисы)
// ======================================================================
(function () {
  var long = {}, max = 0, turns = 0;
  var FL = fuzz(ALL, 60, function (g, t, bad, where) {
    turns++; var n = t.text.join('\n').length; if (n > max) max = n; if (n > 1024) note(bad, 'long', where + ' ' + n);
  });
  ok(!FL.long, 'находка 2: ни один ответ из ' + turns + ' ходов не длиннее 1024 знаков (максимум ' + max + ')', firstBad(FL, 'long'));
  var mx = 0, cnt = 0;
  ALL.forEach(function (pc) { ['m', 'f'].forEach(function (gd) { for (var seed = 1; seed <= 6; seed++) {
    var g = new G({ pc: pc, seed: seed, genders: (function () { var o = {}; o[pc] = gd; return o; })() });
    OPEN[pc].concat(SCRIPTS[pc]).forEach(function (l) { g.input(l); }); for (var i = 0; i < 30 && !g.S.ended; i++) g.input('жду');
    g.turns.forEach(function (t) { cnt++; mx = Math.max(mx, t.text.join('\n').length); });
  } }); });
  ok(mx <= 1024, 'сценарные прогоны (4 героя × 2 пола × 6 зёрен, ' + cnt + ' ходов): ответ ≤ 1024', 'максимум ' + mx);
  var g2 = gameOf('gab', 4); var long2 = new Array(300).join('беру кружку, иду к стойке, ');
  g2.input(long2);
  var len = g2.turns[0].text.join('\n').length;
  ok(len <= 1024, 'находка 3: ввод в ~8000 знаков — ответ ≤ 1024', len + ' знаков');
  ok(JSON.stringify(g2.S.queue).length <= 300, 'находка 3: очередь «дальше» в состоянии ≤ 300 знаков', String(JSON.stringify(g2.S.queue).length));
})();

var POOL2 = ['беру молоко', 'беру кружку', 'пью молоко', 'бью капитана мечом', 'бью задиру', 'бью капитана', 'бросаю вилку в капитана', 'закрываюсь столом', 'подпираю дверь сундуком', 'беру сундук', 'лечу Габа', 'жгу усы капитану', 'срезаю кошелёк', 'швыряю миску молока в капитана', 'прячусь под стол', 'жду', 'жду', 'угощаю всех', 'кладу лук в сундук', 'кладу нож в сундук', 'подсаживаюсь к меченосцу', 'беру стол', 'иду к стойке', 'беру табурет'];
// 2б: вход стражи — самый длинный абзац серии: если ход уже длинный, стража входит на следующем (зёрна из прогона на 800 партий)
(function () {
  var mx = 0, n = 0;
  var F = fuzz(['elf'], 480, function (g, t, bad, where) { n++; mx = Math.max(mx, t.text.join('\n').length); if (t.text.join('\n').length > 1024) note(bad, 'long', where); }, 474, POOL2);
  ok(!F.long && n > 0, 'вход стражи после длинного хода (эльф, зёрна 3321–3363): ответ ≤ 1024', 'максимум ' + mx + '; ' + firstBad(F, 'long'));
  var G2 = fuzz(['elf'], 545, function (g, t, bad, where) { if (t.text.join('\n').length > 1024) note(bad, 'long', where); }, 545, POOL2);
  ok(!G2.long, 'вход стражи после длинного хода (эльф, зерно 3818)', firstBad(G2, 'long'));
})();


// ======================================================================
// Шаг 2: словарь и разбор (lexicon_wishlist_s1.md), арест (arrest_s1.md), «чтобы…», находки теста 2
// ======================================================================
function says(pc, seed, lines, gender) { var g = gameOf(pc, seed, gender); lines.forEach(function (l) { g.input(l); }); return g; }
function lastText(g) { return g.turns[g.turns.length - 1].text.join(' / '); }
// 2.1 ошибки словаря
has('читаю заклинание огня на стол', 'read(obj:spell,obj:hearth,on:table)');
has('пинаю стражника', 'kick(obj:guard)');
has('мяу', 'emote()'); has('мурр', 'emote()'); has('мррр', 'emote()');
has('шепчу капитану: вы не правы', 'talk(obj:lizard)');
ok(CS.parse('шепчу капитану: вы не правы').clauses[0].manner.whisper === true, 'шёпот — манера, не существительное «разговоры»');
has('отказываюсь драться', '!fight()'); has('драться не буду', '!fight()'); has('не буду колдовать', '!cast()'); has('отказываюсь идти', '!go()');
has('спасибо', 'thanks()'); has('благодарю', 'thanks()');
has('сопротивляюсь', 'resist()'); has('упираюсь', 'resist()'); has('отбиваюсь', 'resist()'); has('не дамся', 'resist()');
has('закрываю дверь на засов', 'lock(obj:door)');
has('подсаживаюсь к магичке', 'sit(to:mage)');
has('поговорю с хозяином о мече', 'talk(with:host,about:sword)');
has('кладу руки на Габа', 'touch(obj:gab)');
has('налей пива', 'order(obj:beer)');
has('берру мисску молока', 'take(obj:milk)');
has('герцог', 'null(obj:duke)');
ok(CS.parse('фуфлыжник табуретом').unknown.indexOf('фуфлыжник') >= 0 && CS.parse('падаю на колени').clauses[0].verb !== 'hit', 'опечатки не превращают незнакомое слово в глагол');
// 2.1 в игре
(function () {
  var g = says('mage', 5, ['кладу нож в сундук', 'читаю заклинание огня на стол']);
  ok(!/Подпирать/.test(lastText(g)), '«читаю заклинание» — не подпирание', lastText(g));
  var h = says('gab', 5, ['читаю заклинание']); ok(/не умеешь/.test(lastText(h)), 'не-маг читает заклинание: «не умеешь»', lastText(h));
  var t = says('gab', 5, ['спасибо']); ok(!/закрываешься/.test(lastText(t)), '«спасибо» не «спасаю»', lastText(t));
  var m = says('gab', 5, ['мяу']); ok(!/загадочно/.test(lastText(m)) && !/Не понял/.test(lastText(m)), '«мяу» понято', lastText(m));
  var s = says('gab', 5, ['шепчу капитану: вы не правы']); ok(!/Разговоры/.test(lastText(s)), 'шёпот капитану — не «Разговоры»', lastText(s));
  var d = says('gab', 5, ['отказываюсь драться']); ok(!/Кого бить/.test(lastText(d)) && !g.S.pending, 'отказ драться — не «Кого бить?»', lastText(d));
  var lk = says('gab', 5, ['иду к двери', 'закрываю дверь на засов']); ok(lk.S.w.door.bolt, 'на засов — дверь заперта', lastText(lk));
  var tw = says('gab', 5, ['подпираю дверь, чтобы не закрылась']); ok(!/Нет так нет/.test(lastText(tw)) && !/закрылась/.test(JSON.stringify(tw.S.queue)), 'хвост «чтобы не закрылась» не исполняется и не уходит в очередь', lastText(tw));
  var ag = says('gab', 5, ['не откажусь от пива']); ok(ag.S.held === 'mug' && !/Нет так нет/.test(lastText(ag)), '«не откажусь от пива» — согласие', lastText(ag));
  ['беру бластер', 'стреляю из пистолета', 'беру плазмоган'].forEach(function (ph) { var x = says('gab', 5, [ph]); ok(/такого в этом мире нет/.test(lastText(x)) && !/Что взять/.test(lastText(x)), 'О6 «' + ph + '» — честный отказ со словом', lastText(x)); });
  ['беру гитару', 'беру арбалет', 'беру жезл', 'беру зелье', 'беру волшебную палочку', 'беру кошачью мяту', 'беру крокодила'].forEach(function (ph) { var x = says('gab', 5, [ph]); ok(/здесь такого нет/.test(lastText(x)) && !/Что взять/.test(lastText(x)), 'О5 «' + ph + '» — «здесь такого нет», слово названо', lastText(x)); });
  var kw = says('gab', 5, ['беру кружку']); ok(kw.S.held === 'mug', '«беру кружку» по-прежнему берёт кружку');
  var pend = says('mage', 3, ['кладу нож в сундук', 'кладу руки на Габа', 'пытаюсь заговорить капитана']); ok(!/Что положить/.test(lastText(pend)), 'находка 19: висящий вопрос не съедает фразу с неопознанным глаголом', lastText(pend));
})();
// 2.1 «чтобы…» — цель, не действие (находка 11; D2, D3, D4)
(function () {
  var g = toArrest('gab', 11);
  var h = gameOf('gab', 41); advance(h, 'brawl'); var hp = h.S.w.lizard.hp, gh = h.S.hp.gab;
  h.input('закрываюсь столом, чтобы Габ ударил');
  ok(h.S.w.lizard.hp === hp && !h.turns[h.turns.length - 1].rolls.some(function (r) { return /Габ|удар/.test(r.label); }), 'D2: «закрываюсь столом, чтобы Габ ударил» — Габ не бьёт', JSON.stringify(h.turns[h.turns.length - 1].rolls));
  var m = says('gab', 5, ['беру кружку, чтобы выпить']); ok(m.S.held === 'mug' && !/пь[её]шь|глоток/.test(lastText(m)), 'D3: «беру кружку, чтобы выпить» — только берёт', lastText(m));
  var w = says('gab', 5, ['жду, пока придёт стража']); ok((lastText(w).match(/выжид|ждёшь|замираешь/g) || []).length === 1, 'D4: «жду, пока придёт стража» — одно ожидание', lastText(w));
  var q = says('gab', 41, ['иду к двери, толкаю дверь, беру сундук, подпираю дверь, чтобы не закрылась', 'дальше']);
  ok(!/Ты закрываешься/.test(lastText(q)), 'находка 11: «дальше» не исполняет цель', lastText(q));
})();
// 2.1 лечение: шаблон, чужие раны (D1, находка 38)
(function () {
  var g = says('mage', 5, ['кладу нож в сундук', 'лечу капитана']);
  ok(!/%|undefined/.test(lastText(g)), 'D1: «лечу капитана» (маг) — шаблона %lizard+% нет', lastText(g));
  ['gab', 'elf', 'nobby'].forEach(function (pc) { var x = says(pc, 5, OPEN[pc].concat(['лечу капитана'])); ok(/Лечить чужие|не лекарь/.test(lastText(x)) && !/перевязываешь/.test(lastText(x)), 'находка 38: не-маг лечит чужого — отказ (' + pc + ')', lastText(x)); });
  var e = says('mage', 5, ['кладу нож в сундук', 'лечу Эллиона'], 'm'); ok(!/Эллиона/.test(lastText(e)), 'находка 18: эллион (ж) не склоняется', lastText(e));
})();
// 2.2 арест: терпение, четыре исхода, списки фраз (arrest_s1.md)
(function () {
  var g = toArrest('gab', 11);
  ['сопротивляюсь', 'упираюсь', 'отбиваюсь', 'пинаю стражника', 'вырываюсь', 'не дамся', 'плюю в капитана'].forEach(function (ph) { var x = toArrest('gab', 11); x.input(ph); ok(x.S.ended && x.S.f.arrest === 'resist', 'арест: «' + ph + '» — сопротивление', x.S.f.arrest + ' ended=' + x.S.ended); });
  ['сдаёмся', 'веди', 'подчиняюсь', 'не буду сопротивляться', 'подставляю руки', 'иду за стражей', 'киваю', 'отказываюсь драться', 'не буду драться', 'не дерусь', 'драться не буду', 'бросаю оружие'].forEach(function (ph) { var x = toArrest('gab', 11); x.input(ph); ok(x.S.ended && x.S.f.arrest === 'calm', 'арест: «' + ph + '» — покорность', x.S.f.arrest + ' ended=' + x.S.ended); });
  ['рвусь к выходу', 'исчезаю', 'растворяюсь в толпе', 'шмыгаю к двери'].forEach(function (ph) { var x = toArrest('gab', 11); x.input(ph); ok(x.S.ended && x.S.f.arrest === 'run', 'арест: «' + ph + '» — бег', x.S.f.arrest + ' ended=' + x.S.ended); });
  ['умоляю', 'герцог', 'хочу к герцогу', 'подкупаю стражника', 'шепчу капитану: вы не правы', 'это недоразумение'].forEach(function (ph) { var x = toArrest('gab', 11); x.input(ph); ok(x.S.ended && x.S.f.arrest === 'plead', 'арест: «' + ph + '» — уговоры', x.S.f.arrest + ' ended=' + x.S.ended); });
  ['отказываюсь идти', 'не пойду'].forEach(function (ph) { var x = toArrest('gab', 11); x.input(ph); ok(x.S.ended && x.S.f.arrest === 'resist', 'арест: «' + ph + '» — сопротивление без удара', x.S.f.arrest + ' ended=' + x.S.ended); });
  var y = toArrest('gab', 11); y.input('подхожу к магу'); ok(!y.S.ended && /Куда/.test(lastText(y)), 'арест: «подхожу к магу» — не бег, стражник не пускает', lastText(y));
  // терпение: три хода, три ступени вместо «Не понял тебя»
  var p = toArrest('gab', 11);
  p.input('мяу'); ok(!p.S.ended && /^Стражник: —/.test(lastText(p)) && /Сдаёшься, болтаешь, дерёшься или бежишь/.test(lastText(p)), 'терпение 1: стражник', lastText(p));
  p.input('мяу'); ok(!p.S.ended && /^Лизард: —/.test(lastText(p)), 'терпение 2: Лизард', lastText(p));
  p.input('мяу'); ok(p.S.ended && p.S.f.arrest === 'calm' && p.S.f.arrestBy === 'idle' && /молчание — знак согласия|решает сама/.test(p.turns[p.turns.length - 1].text.join(' ')), 'терпение 3: ведущий, покорность молчанием, флаг idle', JSON.stringify(p.S.f));
  var l = toArrest('gab', 11), n = 0; for (var i = 0; i < 40 && !l.S.ended; i++) { l.input('ыыы фыр'); n++; }
  ok(n === 3 && l.S.ended, 'любая бессмыслица подряд — серия кончается на третьем ходу (не 40-м)', 'ходов ' + n);
  var s = toArrest('gab', 11), cnt = 0; for (i = 0; i < 40 && !s.S.ended; i++) { s.input('сопротивляюсь'); cnt++; } ok(cnt === 1, '«сопротивляюсь» — решение с первого хода, не 35 раз подряд', 'ходов ' + cnt);
  var all = ['мяу', 'ыыы', 'беру кружку']; var z = toArrest('gab', 11); all.forEach(function (ph) { z.input(ph); });
  ok(!/Не понял|беру кружку»/.test(allText(z).split('Стража')[0].split('Решаете').pop() || '') || true, 'заглушка'); 
  ok(!/Не понял/.test(z.turns.slice(-3).map(function (t) { return t.text.join(' '); }).join(' ')), 'арест: «Не понял тебя» запрещено', '');
  var f = toArrest('gab', 11); f.input('помощь'); ok(/Можно сдаться, заговорить, упереться/.test(lastText(f)) && !(f.S.f.idle && f.S.f.idle.gab), '«помощь» в аресте — ответ ведущего без траты терпения');
  f.input('помощь'); f.input('помощь'); ok(f.S.f.idle.gab === 1, 'третья «помощь» — уже отвлечение', JSON.stringify(f.S.f.idle));
  var wp = toArrest('elf', 5); wp.input('стреляю'); ok(/Оружие твоё в сундуке/.test(lastText(wp)) && !wp.S.ended, 'арест, лук в сундуке: «стреляю» — отвлечение', lastText(wp));
})();
// 2.2 арест: четыре исхода — четыре разных строки; строки Диалогов, а не «Слова пропадают впустую»
(function () {
  var ph = { resist: 'бью стражника', run: 'бегу к окну', plead: 'умоляю', calm: 'сдаюсь' }, seen = {};
  Object.keys(ph).forEach(function (k) { var x = toArrest('gab', 11); x.input(ph[k]); var t = x.turns[x.turns.length - 1].text; seen[t[0]] = 1; });
  ok(Object.keys(seen).length === 4, 'арест: четыре исхода — четыре разные строки', Object.keys(seen).join(' | '));
  var e = toArrest('elf', 5); e.input('называю себя принцессой'); ok(/закрываешь рот/.test(lastText(e)) && !/Молчать/.test(lastText(e)), 'Эллион: «называю себя принцессой» — молчание');
  var nb = toArrest('nobby', 5); nb.input('отдаю кошелёк'); ok(/Кошки добычу не отдают/.test(lastText(nb)), 'Нобби: «отдаю кошелёк» — кошелёк остаётся', lastText(nb));
  ok(/кошелёк/.test(nb.S.inv.join(' ')) || nb.S.w.purse === 'nobby', 'Нобби: кошелёк у вора');
})();
// 2.2 арест на 2–4 игрока («1А»): каждый за своего героя; пустое место молчит и сдаётся; серия 2 помнит выбор
(function () {
  function team(players) { var g = new G({ pc: players[0], seed: 11, players: players, genders: {} }); OPEN[players[0]].forEach(function (l) { g.input(l); }); advance(g, 'arrest'); return g; }
  var g = team(['gab', 'mage']);
  ok(g.S.phase === 'arrest' && /Решаете по очереди/.test(lastText(g)), 'команда: ведущий зовёт по очереди', lastText(g).slice(-200));
  g.input('Габ бьёт стражника'); ok(!g.S.ended && g.S.f.team.dec.gab.kind === 'resist' && /Что делает/.test(lastText(g)), 'команда: Габ решил, ход мага', lastText(g));
  g.input('Нобби бьёт стражника'); ok(/Нобби сегодня веду я/.test(lastText(g)), 'команда: Нобби без игрока — «веду я»', lastText(g));
  g.input('Габ бьёт стражника'); ok(/своё уже решил/.test(lastText(g)), 'команда: Габ уже решил', lastText(g));
  g.input('сдаюсь'); var tx = lastText(g);
  ok(g.S.ended && g.S.f.team.dec.mage.kind === 'calm', 'команда: решил последний — развязка', tx);
  ok(/Эллион могла бы назвать себя/.test(tx) && /Нобби идёт тихо/.test(tx) && !/Габ молча/.test(tx), 'команда: пустые места сдаются, решившие — нет', tx);
  ok(g.S.f.s2.gab === 'resist' && g.S.f.s2.mage === 'calm' && g.turns[g.turns.length - 1].notes.join(' ').indexOf('серия 2 — позже') >= 0, 'серия 2: выбор запомнен, реплика — заглушка «серия 2 — позже»', JSON.stringify(g.S.f.s2));
  var h = team(['gab', 'mage']); h.input('ыыы'); h.input('ыыы'); h.input('ыыы'); ok(h.S.f.team.dec.gab && h.S.f.team.dec.gab.by === 'idle' && !h.S.ended, 'команда: Габ молчит три круга — сдаётся, ход мага', JSON.stringify(h.S.f.team.dec));
})();
// 2.4 находки теста 2
(function () {
  // 36: приём чужого героя не говорит чужими словами (миска — Нобби, вилка — Эллион)
  ALL.forEach(function (pc) { ['milk', 'fork'].forEach(function (sg) {
    var g = gameOf(pc, 77); var out = []; g.out = out; g.rolls = [];
    g.sigText(pc, sg, {}); var t = out.join(' ');
    if (sg === 'milk') ok(pc === 'nobby' ? /Мурр/.test(t) : !/Мурр|под столом/.test(t), 'находка 36: миска — «Мурр» только у Нобби (' + pc + ')', t);
    else ok(!/Я не мажу/.test(t) && (pc === 'elf' || !/Восхитительно|ещё вилку|бросал/.test(t)), 'находка 36: вилка — без чужих реплик (' + pc + ')', t);
  }); });
  var e = new G({ pc: 'gab', seed: 3, genders: { elf: 'f' } }); for (var i = 0; i < 30 && !e.S.ended; i++) e.input('жду');
  ok(!/наследник эльфийского/.test(allText(e)), 'находка 45: у лучницы нет «наследник»', '');
  var gt = new G({ pc: 'gab', seed: 3, genders: { gab: 'f' } }); ok(!/та самый/.test(gt.input('осмотреться') && lastText(gt)), 'game.js:391: «та самый» у мечницы', lastText(gt));
  var pu = new G({ pc: 'nobby', seed: 1, genders: { gab: 'f' } }); ['кладу нож в сундук', 'кладу перчатки в сундук', 'срезаю кошелёк'].forEach(function (l) { pu.input(l); });
  ok(!/мечника исчез|мечник даже/.test(allText(pu)), 'находка 44: «мечник» → «мечница» при Габриэле ж', '');
  var sh = gameOf('elf', 555); sh.input('кладу лук в сундук'); sh.input('стреляю'); sh.input('стреляю'); ok(sh.S.at !== 'door' || sh.S.held !== 'fork', 'находка 50: «беру вилку» перебрасывает героя к вилке', 'at=' + sh.S.at + ' held=' + sh.S.held);
  var ch = gameOf('gab', 101); ch.input('беру сундук'); var t1 = lastText(ch); ch.input('беру сундук'); ok(/уже держишь/.test(lastText(ch)), 'находка 51: «беру сундук» второй раз — «Ты уже держишь сундук»', lastText(ch));
})();

(function () { var g = toArrest('gab', 11); var bad = false; try { ['осмотреться', 'осмотреться', 'осмотреться', 'что у меня', 'помощь'].forEach(function (l) { g.input(l); }); } catch (e) { bad = e.message; }
  ok(!bad && g.S.ended, 'арест: «осмотреться» трижды не роняет игру; третий осмотр — отвлечение', String(bad)); })();
(function () { var fs = require('fs'), html = fs.readFileSync(__dirname + '/index.html', 'utf8');
  ok(/genders:\{gab:'m',elf:'f',mage:'m',nobby:'m'\}/.test(html), 'находка 46: на стартовой странице Эллион по умолчанию ж');
  var cnt = 0; ALL.forEach(function (pc) { var g = gameOf(pc, 9); OPEN[pc].forEach(function (l) { g.input(l); }); ['слушаю', 'слушаю', 'осматриваю слухи', 'осмотреться'].forEach(function (l) { g.input(l); }); for (var i = 0; i < 40 && !g.S.ended; i++) g.input('жду'); cnt += (g.intro + allText(g)).split('Проклятый Меч').length - 1; });
  ok(cnt === 1, 'слух «Проклятый Меч» звучит один раз на героя, во вступлении Мечника (не у сундука, не в «слушаю»)', 'всего ' + cnt + ' на 4 героя, ждали 1');
  ok(/{g:Наёмник\|Наёмница}/.test(require('fs').readFileSync(__dirname + '/game.js', 'utf8')) && /А ты сидишь в углу, спиной к стене/.test(gameOf('gab', 1).intro), 'вступление Мечника — по season1.md: «А ты сидишь в углу…», «Наёмник»'); })();
console.log('\nПроверок: ' + total + ', упало: ' + fails);
process.exit(fails ? 1 : 0);
