/* «До» для dialogue_s1_arrest.md: что бета говорит в аресте сейчас. Читает код беты, не правит.
   Запуск: node docs/story/dialogues/dialogue_s1_arrest_before.js [зерно=11]
   Печатает вход стражи за каждого героя, четыре исхода за Габа, подсказку на «беру кружку»
   и три хода бессмыслицы подряд. Длина — весь ответ хода, как его отдаёт бета. */
'use strict';
var path = require('path');
var B = path.join(__dirname, '..', '..', 'visual', 'beta') + path.sep;
require(B + 'lexicon.js'); require(B + 'parser.js'); require(B + 'game.js');
var G = globalThis.CS.Game, seed = +(process.argv[2] || 11);
var OPEN = { gab: [], elf: ['кладу лук в сундук'], mage: ['кладу нож в сундук'], nobby: ['кладу нож в сундук'] };
function toArrest(pc) {
  var g = new G({ pc: pc, seed: seed, genders: {} });
  OPEN[pc].forEach(function (l) { g.input(l); });
  for (var i = 0; i < 40 && g.S.phase !== 'arrest' && !g.S.ended; i++) g.input('жду');
  return g;
}
function last(g) { return g.turns[g.turns.length - 1].text.join('\n'); }
function show(title, t) { console.log('### ' + title + ' (' + t.length + ' знаков)\n' + t + '\n'); }
['gab', 'elf', 'mage', 'nobby'].forEach(function (pc) { show('вход стражи, ' + pc, last(toArrest(pc))); });
var phr = { calm: 'сдаюсь', resist: 'бью стражника', run: 'бегу к двери', plead: 'уговариваю капитана', idle: 'беру кружку' };
Object.keys(phr).forEach(function (k) { var g = toArrest('gab'); g.input(phr[k]); show(k + ' «' + phr[k] + '», gab', last(g)); });
var g = toArrest('gab');
['мяу', 'мяу', 'мяу'].forEach(function (p, i) { g.input(p); show('бессмыслица ' + (i + 1) + ', серия кончилась: ' + !!g.S.ended, last(g)); });
