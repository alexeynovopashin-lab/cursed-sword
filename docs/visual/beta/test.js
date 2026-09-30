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

console.log('\nПроверок: ' + total + ', упало: ' + fails);
process.exit(fails ? 1 : 0);
