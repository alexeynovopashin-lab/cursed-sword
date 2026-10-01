"""Квоты гида и проверка на слух: «до» и «вариант Б» в dialogue_s1_tavern.md.
Только читает файл рядом. Запуск: python3 dialogue_s1_tavern_count.py"""
import itertools, os, re

P = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dialogue_s1_tavern.md')
txt = open(P, encoding='utf8').read()
NARR = ('Рассказчик', 'Ведущий')
HEROES = ('Габ', 'Эллион', 'Луциан', 'Нобби')
DEFAULT = {'Г': 0, 'Э': 1, 'Л': 0, 'Н': 0}  # 0 = м, 1 = ж
MARK = re.compile(r'\{([ГЭЛН]):([^|}]*)\|([^}]*)\}')


def render(s, g):
    return MARK.sub(lambda m: m.group(2 + g[m.group(1)]), s)


def label(sp, g):
    if sp in NARR or sp == 'Шёпот':
        return ''  # не произносится
    return ('Луциания' if g['Л'] else 'Луциан') if sp == 'Луциан' else sp


W = lambda s: re.findall(r'[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*', s)
SENT = lambda t: [x for x in re.split(r'(?<=[.!?…—])\s+(?=[А-ЯЁ«])', t) if W(x)]


def section(title):
    part = txt.split('\n## ' + title, 1)[1].split('\n---', 1)[0]
    out = []
    for b in re.split(r'\*\*Ответ \d+\*\*[^\n]*', part)[1:]:
        out.append(re.findall(r'^- \*\*(.+?):\*\* (.*)$', b, flags=re.M))
    return out


def punch(lines):
    """narr.py: предложение ≥6 слов, за ним в той же строке ≤3 слов."""
    hits = []
    for sp, t in lines:
        ps = SENT(t)
        for a, b in zip(ps, ps[1:]):
            if len(W(b)) <= 3 and len(W(a)) >= 6 and not re.match(r'Что делаете', b):
                hits.append(f'{sp}: «…{a[-40:]} | {b}»')
    return hits


for title in ('До', 'Вариант Б'):
    ans = section(title)
    allg = [dict(zip('ГЭЛН', c)) for c in itertools.product((0, 1), repeat=4)]
    chars = [max(sum(len(label(sp, g)) + (2 if label(sp, g) else 0) + len(render(t, g)) + 1
                     for sp, t in a) for g in allg) for a in ans]
    lines = [(sp, render(t, DEFAULT)) for a in ans for sp, t in a]
    speakers = [len({sp for sp, t in a}) for a in ans]
    narr = [(sp, t) for sp, t in lines if sp in NARR]
    ns = [s for sp, t in narr for s in SENT(t)]
    ty = [bool(re.match(r'Ты\b', s)) for s in ns]
    runs, r = [], 0
    for x in ty + [False]:
        if x: r += 1
        else:
            if r >= 2: runs.append(r)
            r = 0
    allt = ' '.join(t for sp, t in lines)
    long_s = [s for sp, t in lines for s in SENT(t) if len(W(s)) > 15]
    hero = [(sp, t) for sp, t in lines if sp in HEROES]
    elion = [t for sp, t in hero if sp == 'Эллион']
    host_rule = sum(1 for sp, t in lines if sp == 'Хозяин' and re.search(r'на выходе|тяжелеет', t))
    blade_rumor = sum(1 for a in ans if any('Проклятый Меч' in t for sp, t in a)
                      and any(re.search(r'[Тт]усклый', t) for sp, t in a))
    leftovers = re.findall(r'[{}%]|\(', ' '.join(render(t, g) for a in ans for sp, t in a for g in allg[:1]))
    print(f'== {title}: ответов {len(ans)}')
    print(f'   знаков в ответе (max по 16 сочетаниям пола): {chars}; max {max(chars)}; >700: {sum(c > 700 for c in chars)}; >1024: {sum(c > 1024 for c in chars)}')
    print(f'   говорящих в ответе: {speakers}; >3: {sum(s > 3 for s in speakers)}')
    print(f'   предложений >15 слов: {len(long_s)} {long_s}')
    print(f'   реплик героев: {len(hero)} (Эллион {len(elion)}); рассказчик: предложений {len(ns)}')
    person = len(re.findall(r'Проклятый Меч\. Наёмни', allt))
    cat = len(re.findall(r'[Кк]ошк|[Кк]отён|\bлап|хвост', allt))
    print(f'   «Восхитительно»: {len(re.findall("Восхитительн", allt))}; «Это знак»: {len(re.findall("Это знак", allt))}; '
          f'«Мурр»: {len(re.findall("Мурр", allt))}; кошачье (кошк/котён/лап/хвост): {cat}')
    print(f'   фраза хозяина о сундуке: {host_rule}; слух «Проклятый Меч»: {allt.count("Проклятый Меч")}; '
          f'слух в одном ответе с клинком: {blade_rumor}; слух явно про человека («Наёмник/ца»): {person}')
    print(f'   рассказчик «Ты…»: {sum(ty)} из {len(ns)}; серий подряд ≥2: {len(runs)} {runs}')
    ph, pa = punch(narr), punch(lines)
    print(f'   «фраза ≥6 слов + добивка ≤3» у рассказчика: {len(ph)}; во всех строках: {len(pa)}')
    for h in pa: print('     ', h)
    print(f'   скобки и шаблоны после подстановки: {len(leftovers)}')
