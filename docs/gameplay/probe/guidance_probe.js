/* Замеры для guidance_s1.md (читает живую бету, ничего не правит): node docs/gameplay/probe/guidance_probe.js [зерно=11]
   1) 64 пары «чип × фаза»: сколько меняют мир; в аресте — сколько обрывают серию
   2) «жду» ×30 по 4 героям × зёрнам: доля ходов, где мир сдвинулся, самая длинная пауза; фазы по ходам; сколько ответов кончается «?»
   3) 12 ходов на двери: фаза не меняется
   4) 12 бессмысленных ходов в вечере (маг): ответы-тупики
   5) 8 вопросов к персонажам: принимаются ли
   «Изменил мир» = в rec.diff есть путь, кроме t / last. */
'use strict';
var path = require('path'), B = path.join(__dirname, '..', '..', 'visual', 'beta') + path.sep;
['lexicon', 'parser', 'refusals', 'grid', 'figures', 'game'].forEach(function (f) { require(B + f + '.js'); });
var G = globalThis.CS.Game, seed = +(process.argv[2] || 11), SERV = { t: 1, last: 1, turn: 1, rng: 1 };
function prog(t) { return t.diff.some(function (d) { return !SERV[d.path]; }); }
function mk(pc, s) { var o = {}; o[pc] = 'm'; return new G({ pc: pc, seed: s || seed, genders: o }); }
var OPEN = { gab: '', elf: 'кладу лук в сундук', mage: 'кладу нож в сундук', nobby: 'кладу нож в сундук' };
function opened(pc, s) { var g = mk(pc, s); if (OPEN[pc]) g.input(OPEN[pc]); return g; }
function last(g) { return g.turns[g.turns.length - 1]; }
// 1
var CH = { gab: ['осмотреться', 'беру стол', 'закрываюсь столом', 'бью капитана табуреткой'], elf: ['кладу лук в сундук', 'угощаю всех', 'бросаю вилку в капитана', 'что у меня'],
  mage: ['кладу нож в сундук', 'подсаживаюсь к меченосцу', 'жгу усы капитану', 'лечу Габа'], nobby: ['кладу нож в сундук', 'жду', 'срезаю кошелёк', 'швыряю миску молока в капитана'] };
var pairs = 0, useful = 0, ended = 0, resist = 0;
Object.keys(CH).forEach(function (pc) { ['door', 'evening', 'brawl', 'arrest'].forEach(function (st) { CH[pc].forEach(function (p) {
  var g = st === 'door' ? mk(pc) : opened(pc);
  if (st === 'evening') g.input('жду');
  else if (st !== 'door') for (var i = 0; i < 40 && g.S.phase !== st && !g.S.ended; i++) g.input('жду');
  g.input(p); var t = last(g); pairs++; if (prog(t) || g.S.ended) useful++;
  if (st === 'arrest' && g.S.ended) { ended++; var d = g.S.f.team && g.S.f.team.dec && g.S.f.team.dec[pc]; if (d && d.kind === 'resist') resist++; }
}); }); });
console.log('1) пар ' + pairs + ', меняют мир ' + useful + ' (' + Math.round(100 * useful / pairs) + ' %), не меняют ' + (pairs - useful) + '; в аресте обрывают серию ' + ended + ' из 16, из них сопротивление ' + resist);
// 2
var n = 0, mv = 0, q = 0, gapMax = 0, per = {};
Object.keys(OPEN).forEach(function (pc) { [11, 12, 13].forEach(function (s) { var g = opened(pc, s), gap = 0;
  for (var i = 0; i < 30 && !g.S.ended; i++) { var ph = g.S.phase; g.input('жду'); var t = last(g); n++;
    if (/\?\s*$/.test(t.text.join(' ').trim())) q++;
    if (ph === 'evening') { per.ev = per.ev || [0, 0]; per.ev[0]++; if (prog(t)) { per.ev[1]++; gap = 0; } else { gap++; gapMax = Math.max(gapMax, gap); } } } }); });
console.log('2) «жду»: ходов ' + n + ', кончаются «?» ' + q + '; вечер: мир сдвинулся ' + per.ev[1] + ' из ' + per.ev[0] + ', самая длинная пауза ' + gapMax);
// 3
['elf', 'mage', 'nobby'].forEach(function (pc) { var g = mk(pc), st = 0; for (var i = 0; i < 12; i++) { g.input(['жду', '', 'не знаю', 'привет', 'осмотреться', 'что делать'][i % 6]); if (g.S.phase === 'door') st++; }
  console.log('3) ' + pc + ': на двери ' + st + ' из 12'); });
// 4
var g4 = opened('mage'), dead = 0, kinds = {};
['не знаю', '', 'привет', 'хм', 'что делать', 'я не понимаю', 'ты кто?', 'где тут что?', 'ну', 'эээ', 'помоги', 'что дальше?'].forEach(function (p) {
  g4.input(p); var t = last(g4).text.join(' '), k = t.slice(0, 28); kinds[k] = (kinds[k] || 0) + 1; if (!/^Пиши, что делаешь/.test(t)) dead++; });
console.log('4) 12 ходов потерянного игрока: ответы ' + JSON.stringify(kinds) + '; не-справка (тупик/мусор) ' + dead);
// 5
var qs = ['ты Габриэль воин?', 'сколько тебе лет?', 'где здесь стойка?', 'а кто ты?', 'Габ, ты кто?', 'хозяин, где туалет?', 'что такое меч?', 'почему меч в сундуке?'], acc = 0;
qs.forEach(function (q) { var g = opened('mage'); g.input(q); var t = last(g).text.join(' ');
  var bad = /и что ты хочешь с этим сделать|слишком загадочно|^Пиши, что делаешь/.test(t); if (!bad) acc++; console.log('5) «' + q + '» → ' + t.slice(0, 70).replace(/\n/g, ' ')); });
console.log('5) принято как реплика: ' + acc + ' из ' + qs.length);
