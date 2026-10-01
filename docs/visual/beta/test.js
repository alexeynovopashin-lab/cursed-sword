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
  mage: ['кладу нож в сундук', 'подсаживаюсь к меченосцу', 'жду', 'жду', 'жду', 'жгу усы капитану', 'лечу Габа', 'жду', 'жду', 'жду', 'жду', 'жду', 'жду'],
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
  ok(r.diff.some(function (d) { return d.path === 'phase'; }), 'панель: изменение состояния (фаза драки)');
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
function fuzz(pcs, seeds, check) {
  var bad = {};
  pcs.forEach(function (pc) {
    for (var seed = 1; seed <= seeds; seed++) {
      var g = gameOf(pc, seed * 7 + 3), rnd = seed * 2654435761 >>> 0;
      for (var i = 0; i < 45 && !g.S.ended; i++) {
        rnd = (Math.imul(rnd, 1664525) + 1013904223) >>> 0;
        var before = JSON.stringify(g.S);
        g.input(POOL[rnd % POOL.length]);
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
  ok(!/стоит посреди зала/.test(arrestText(true, false)) && /оглушённый/.test(arrestText(true, false)), 'арест: оглушённый капитан сидит, не стоит');
  ok(!/стоит посреди зала/.test(arrestText(false, true)) && /приколот/.test(arrestText(false, true)), 'арест: капитан, приколотый вилкой, не стоит посреди зала');
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

console.log('\nПроверок: ' + total + ', упало: ' + fails);
process.exit(fails ? 1 : 0);
