/* Прогон фраз ареста через живую бету (читает, не правит): node docs/gameplay/probe/run_arrest.js [герой=gab] [зерно=11]
   Для каждой фразы — свежая сцена, ход до ареста, одна фраза; тег = исход (calm|resist|run|plead), idle (подсказка стражи),
   «не разобрано» (ответ-переспрос), «другое». Печатает по группам «верно из N» и промахи. Числа в arrest_s1.md — отсюда. */
'use strict';
var fs = require('fs'), path = require('path');
var B = path.join(__dirname, '..', '..', 'visual', 'beta') + path.sep;
require(B + 'lexicon.js'); require(B + 'parser.js'); require(B + 'game.js');
var G = globalThis.CS.Game, pc = process.argv[2] || 'gab', seed = +(process.argv[3] || 11);
var OPEN = { gab: [], elf: ['кладу лук в сундук'], mage: ['кладу нож в сундук'], nobby: ['кладу нож в сундук'] };
var NOT = /Не понял|слишком загадочно|и что ты хочешь с этим сделать|Что взять\?|Про кого или про что|Кого бить\?|Что положить|Куда бросать/;
function toArrest() {
  var o = {}; o[pc] = 'm'; var g = new G({ pc: pc, seed: seed, genders: o });
  OPEN[pc].forEach(function (l) { g.input(l); });
  for (var i = 0; i < 40 && g.S.phase !== 'arrest' && !g.S.ended; i++) g.input('жду');
  return g;
}
var rows = fs.readFileSync(path.join(__dirname, 'arrest_phrases.txt'), 'utf8').split('\n').filter(function (l) { return l && l[0] !== '#'; });
var by = {}, total = 0, good = 0, len = 0;
rows.forEach(function (r) {
  var i = r.indexOf('|'), want = r.slice(0, i), ph = r.slice(i + 1), g = toArrest();
  if (g.S.phase !== 'arrest') { console.log('не дошли до ареста: герой ' + pc + ', зерно ' + seed); process.exit(2); }
  g.input(ph);
  var t = g.turns[g.turns.length - 1].text.join('\n'), tag;
  if (g.S.ended) tag = g.S.f.arrest; else if (/Стража не даёт отвлекаться/.test(t)) tag = 'idle'; else if (NOT.test(t)) tag = 'не разобрано'; else tag = 'другое';
  var s = by[want] = by[want] || { n: 0, ok: 0, miss: [] };
  s.n++; total++; len = Math.max(len, t.length);
  if (tag === want) { s.ok++; good++; } else s.miss.push(ph + ' → ' + tag);
});
console.log('герой ' + pc + ', зерно ' + seed + ', самый длинный ответ ' + len + ' знаков');
Object.keys(by).forEach(function (k) { console.log(k + ': верно ' + by[k].ok + ' из ' + by[k].n + (by[k].miss.length ? '; промахи: ' + by[k].miss.join('; ') : '')); });
console.log('ВСЕГО: верно ' + good + ' из ' + total + ' (' + Math.round(100 * good / total) + ' %)');
