/* Разбор фразы игрока правилами. Без языковой модели.
   parse(text) -> { meta, clauses:[{verb, neg, args:[{id, role, pron}], speech, manner, raw, tokens}], corrections, unknown }
   Смысл слов подбирается по контексту уже в game.js (местоимения, «его», «там»). */
(function (root) {
  'use strict';
  var CS = root.CS = root.CS || {};
  var L = CS.LEX;

  function norm(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»“”„]/g, '"')
      .replace(/[—–]/g, ' - ').replace(/\s+/g, ' ').trim();
  }

  // индексы для быстрого поиска
  var verbExact = {}, verbStems = [], reflStems = [], nounExact = {}, nounStems = [];
  var modal = {}, manner = {}, pron = {};
  L.MODAL.forEach(function (w) { modal[norm(w)] = 1; });
  L.PRONOUNS.forEach(function (w) { pron[norm(w)] = 1; });
  Object.keys(L.MANNER).forEach(function (k) { L.MANNER[k].forEach(function (w) { manner[norm(w)] = k; }); });
  L.V.forEach(function (v) {
    (v[2] || []).forEach(function (w) { verbExact[norm(w)] = v[0]; });
    v[1].forEach(function (s) { s = norm(s); if (s.indexOf(' ') < 0 && s.length >= 3) verbStems.push([s, v[0]]); });
  });
  L.VR.forEach(function (v) {
    v[1].forEach(function (s) { s = norm(s); reflStems.push([s, v[0]]); });
  });
  L.N.forEach(function (n) {
    var d = n[2];
    (d.exact || []).forEach(function (w) { nounExact[norm(w)] = n[0]; });
    (d.stems || []).forEach(function (s) {
      s = norm(s);
      if (s.indexOf(' ') < 0 && s.length >= 2) nounStems.push([s, n[0], d.ms == null ? 3 : d.ms]);
    });
  });
  // глаголы, у которых стем короче 4 букв, — только целиком
  var SHORT_OK = { 'бей': 1, 'бью': 1 };

  function verbMatch(tok) {
    if (verbExact[tok]) return { id: verbExact[tok], len: 99 };
    var best = null;
    for (var i = 0; i < verbStems.length; i++) {
      var s = verbStems[i][0];
      if (tok.indexOf(s) === 0 && tok.length - s.length <= 8 && (s.length >= 4 || SHORT_OK[s])) {
        if (!best || s.length > best.len) best = { id: verbStems[i][1], len: s.length };
      }
    }
    return best;
  }
  function reflMatch(tok) {
    if (!/(ся|сь)$/.test(tok)) return null;
    var base = tok.replace(/(ся|сь)$/, '');
    var best = null;
    for (var i = 0; i < reflStems.length; i++) {
      var s = reflStems[i][0];
      if (base.indexOf(s) === 0 || tok.indexOf(s) === 0) {
        if (!best || s.length > best.len) best = { id: reflStems[i][1], len: s.length };
      }
    }
    return best;
  }
  function nounMatch(tok) {
    if (nounExact[tok]) return { id: nounExact[tok], len: 99 };
    var best = null;
    for (var i = 0; i < nounStems.length; i++) {
      var s = nounStems[i][0], ms = nounStems[i][2];
      if (tok.indexOf(s) === 0 && tok.length - s.length <= ms) {
        if (!best || s.length > best.len) best = { id: nounStems[i][1], len: s.length };
      }
    }
    return best;
  }

  var INSTR_END = /(ом|ем|ой|ей|ами|ями|ою|ею|им)$/;
  var CORR_MARK = [
    'хотя нет','нет нет','нет-нет','то есть','не то','не туда','не так','точнее','вернее','стоп','погоди','постой','ой','ай','ах','нет','неа','отмена','отменяю','передумал','передумала','ошибся','ошиблась','лучше','исправляю','поправка','вернее говоря','а нет','или нет','или лучше','нет лучше','ой нет','пожалуй нет','хотя лучше','хотя'
  ].sort(function (a, b) { return b.length - a.length; });

  function stripCorrection(text) {
    // возвращает {mark:bool, rest:string}
    var t = text, mark = false, again = true;
    while (again) {
      again = false;
      for (var i = 0; i < CORR_MARK.length; i++) {
        var m = CORR_MARK[i];
        if (t === m) { t = ''; mark = true; again = true; break; }
        if (t.indexOf(m + ' ') === 0) { t = t.slice(m.length + 1).trim(); mark = true; again = true; break; }
      }
    }
    return { mark: mark, rest: t };
  }

  var CONNECT = /\s+(?:и потом|а потом|и затем|а затем|и после этого|после этого|после чего|а после|и после|и сразу|и еще|а еще|и заодно|а также|и тогда|а тогда|потом|затем|после|тогда|дальше|далее|но|а|и|чтобы|чтоб|пока|причем|при этом|заодно|либо|или)\s+/g;
  var LEAD = /^(?:и|а|но|потом|затем|тогда|сначала|снач|сперва|итак|ну|так|значит|короче|давай|давайте|же|вот|ладно|пожалуй)\s+/;

  function tokenize(s) {
    return s.replace(/[^а-яa-z0-9§\-\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  }

  function parseClause(raw, speeches) {
    var toks = tokenize(raw), c = { raw: raw, verb: null, neg: false, args: [], speech: null, manner: {}, unknown: [], tokens: toks };
    var prep = null, negNext = false, i, sp;
    for (i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (/^§\d+$/.test(t)) { c.speech = speeches[+t.slice(1)]; continue; }
      if (t === 'не' || t === 'нельзя' || t === 'ни') { negNext = true; continue; }
      if (manner[t]) { c.manner[manner[t]] = true; continue; }
      if (t === 'собой' || t === 'собою') { c.self = true; }
      if (modal[t] && !nounMatch(t) && !verbMatch(t)) continue;
      if (L.PREPS[t] && !nounMatch(t) && !verbMatch(t)) { prep = L.PREPS[t]; continue; }
      if (L.PREPS[t] && (t === 'у' || t === 'с' || t === 'в' || t === 'на' || t === 'к' || t === 'за' || t === 'по' || t === 'о' || t === 'из' || t === 'от' || t === 'для' || t === 'до' || t === 'под' || t === 'про' || t === 'об' || t === 'со' || t === 'во' || t === 'ко')) { prep = L.PREPS[t]; continue; }
      if (pron[t] && !nounMatch(t)) {
        c.args.push({ id: '@it', role: prep || 'obj', word: t, pron: true }); prep = null; continue;
      }
      var vm = verbMatch(t), nm = nounMatch(t), rm = reflMatch(t);
      // рефлексивный глагол всегда побеждает, если корень совпал
      if (rm && (!vm || rm.len >= vm.len - 1)) vm = rm;
      if (vm && (!nm || vm.len > nm.len)) {
        // второй глагол — начало новой клаузы, если у первого уже есть аргументы или это не «идти»
        if (c.verb && c.verb !== 'go' && !(c.args.length === 0 && !c.speech)) {
          c.rest = toks.slice(i).join(' ').replace(/§\d+/g, function (m) { return '"' + speeches[+m.slice(1)] + '"'; });
          break;
        }
        if (c.verb === 'go' && vm.id !== 'go') { c.pre = 'go'; }
        c.verb = vm.id; c.neg = negNext; negNext = false; prep = null; continue;
      }
      if (nm) {
        var role = prep || 'obj';
        if (!prep) {
          // творительный падеж без предлога — «чем»
          var st = null;
          for (var q = 0; q < nounStems.length; q++) if (nounStems[q][1] === nm.id && t.indexOf(nounStems[q][0]) === 0) { st = nounStems[q][0]; break; }
          if (st && INSTR_END.test(t.slice(st.length || 0) || '') && t.length > st.length && !nounExact[t]) role = 'with';
          if (nounExact[t] && INSTR_END.test(t) && /(ом|ем)$/.test(t)) role = 'with';
        }
        var dup = c.args.some(function (x) { return x.id === nm.id && x.role === role; });
        if (!dup) c.args.push({ id: nm.id, role: role, word: t });
        prep = null; continue;
      }
      // артефакт «-нибудь», «-то»
      if (/^\d+$/.test(t)) continue;
      c.unknown.push(t);
    }
    if (negNext && !c.verb) c.neg = true;
    return c;
  }

  function parse(text) {
    var out = { raw: text, meta: null, clauses: [], corrections: [], unknown: [] };
    var s = norm(text);
    if (!s) return out;
    var i;
    for (i = 0; i < L.META.length; i++) if (L.META[i][1].test(s)) { out.meta = L.META[i][0]; return out; }
    if (/\?$/.test(s) && !/^[а-я]+ /.test(s)) { out.meta = 'help'; return out; }

    // цитаты
    var speeches = [];
    s = s.replace(/"([^"]*)"/g, function (m, q) { speeches.push(q.trim()); return ' §' + (speeches.length - 1) + ' '; });
    s = s.replace(/(говорю|скажу|кричу|шепчу|отвечаю|спрашиваю|крикну|шепну|спрошу|отвечу|орать|орю|ору|говорит|скажи|крикнуть|сказать|прошу|попрошу|пою|спою|бормочу|бурчу|рявкаю|рявкну)([^:]*?)\s*:\s*(.+)$/, function (m, v, mid, q) {
      if (/^§\d+$/.test(q.trim())) return v + mid + ' ' + q;
      speeches.push(q.trim()); return v + mid + ' §' + (speeches.length - 1) + ' ';
    });
    // «не X, а Y» -> Y
    s = s.replace(/(^|[\s,])не\s+[^,.;!?]+?\s*,?\s+а\s+/g, '$1');
    // разбиваем на куски
    var pieces = s.split(/[.!?;\n]+|,|\s-\s|:/).map(function (x) { return x.trim(); }).filter(Boolean);
    var clauses = [];
    var pending = [];
    pieces.forEach(function (p) {
      p = ' ' + p + ' ';
      var parts = p.replace(CONNECT, function (m) { return '\u0001'; }).split('\u0001');
      parts.forEach(function (x) { x = x.trim(); if (x) pending.push(x); });
    });
    // самоисправления и утилиты
    var lastDeleted = null;
    pending.forEach(function (raw) {
      var r = raw.replace(LEAD, '');
      var sc = stripCorrection(r);
      if (sc.mark && clauses.length) {
        lastDeleted = clauses.pop();
        out.corrections.push({ dropped: lastDeleted.raw, by: sc.rest || '' });
        if (!sc.rest) return;
        r = sc.rest;
      } else if (sc.mark) { r = sc.rest; if (!r) return; }
      var c = parseClause(r, speeches);
      if (sc.mark && lastDeleted) { c.replaces = lastDeleted; }
      clauses.push(c);
      // хвост со вторым глаголом
      var guard = 0;
      while (c.rest && guard++ < 4) {
        var nx = parseClause(c.rest, speeches); c.rest = null; clauses.push(nx); c = nx;
      }
    });
    out.clauses = clauses;
    clauses.forEach(function (c) { c.unknown.forEach(function (u) { out.unknown.push(u); }); });
    return out;
  }

  CS.parse = parse;
  CS.norm = norm;
  CS._nounMatch = nounMatch; CS._verbMatch = verbMatch;
})(typeof window !== 'undefined' ? window : globalThis);
