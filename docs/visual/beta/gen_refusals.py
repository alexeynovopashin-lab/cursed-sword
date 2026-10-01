#!/usr/bin/env python3
"""Читает dialogues/dialogue_s1_refusals.md (разделы 1–15) и пишет refusals.js — таблицу строк для беты.
Запуск: python3 gen_refusals.py   (текст правит Диалоги; бета только переносит, ничего не придумывает)"""
import re, json, os
here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, '../../story/dialogues/dialogue_s1_refusals.md')
md = open(src, encoding='utf-8').read()
md = md.split('## (д)')[0]
TAG = {'Г': 'g', 'Э': 'e', 'Л': 'l', 'Н': 'n', 'П': 'p'}
HERO = {'Габа': 'gab', 'Эллион': 'elf', 'Эллиона': 'elf', 'Луциана': 'mage', 'Нобби': 'nobby'}
SPK = {'Ведущий': None, 'Хозяин': 'host', 'Лизард': 'lizard', 'Задира': 'rowdy', 'Габ': 'gab', 'Эллион': 'elf', 'Луциан': 'mage', 'Нобби': 'nobby'}
out = {}
sec = None
for line in md.split('\n'):
    m = re.match(r'### (\d+)\.', line)
    if m: sec = int(m.group(1)); out[sec] = []; continue
    m = re.match(r'- ≤(140|60) · (.*)$', line)
    if not m or sec is None: continue
    form, rest = int(m.group(1)), m.group(2)
    joke = False; only = None; notp = None
    while True:
        if rest.startswith('шутка · '): joke = True; rest = rest[len('шутка · '):]; continue
        mm = re.match(r'(за|кроме) (Габа|Эллион|Луциана|Нобби) · ', rest)
        if mm:
            if mm.group(1) == 'за': only = HERO[mm.group(2)]
            else: notp = HERO[mm.group(2)]
            rest = rest[mm.end():]; continue
        break
    segs = re.findall(r'\*\*([^*:]+):\*\*\s*(.*?)(?=\s*\*\*[^*:]+:\*\*|$)', rest)
    assert segs, line
    parts = []; sp = None
    for name, txt in segs:
        txt = re.sub(r'\{([ГЭЛНП]):', lambda k: '{' + TAG[k.group(1)] + ':', txt)
        if name == 'Ведущий': parts.append(txt)
        else:
            sp = SPK[name]
            label = '%mage%' if name == 'Луциан' else name
            parts.append(label + ': — ' + txt)
    e = {'f': form, 't': ' '.join(parts)}
    if joke: e['j'] = 1
    if only: e['only'] = only
    if notp: e['not'] = notp
    if sp: e['sp'] = sp
    out[sec].append(e)
js = '/* Строки отказов и ответов ведущего — ЧЕРНОВИК Диалогов (dialogue_s1_refusals.md, разделы 1–15).\n   Файл сгенерирован gen_refusals.py; руками не править. */\n(function (root) { var CS = root.CS = root.CS || {}; CS.REF = ' + '{\n' + ',\n'.join('"%d": [\n' % k + ',\n'.join(json.dumps(e, ensure_ascii=False) for e in v) + '\n]' for k, v in out.items()) + '\n}' + '; })(typeof window !== \'undefined\' ? window : globalThis);\n'
open(os.path.join(here, 'refusals.js'), 'w', encoding='utf-8').write(js)
print({k: len(v) for k, v in out.items()}, sum(len(v) for v in out.values()))
