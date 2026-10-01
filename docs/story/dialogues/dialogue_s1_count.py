"""Сцены серии 1, вариант Б: длины, говорящие, шутки ведущего, квоты гида, канон — по файлу сцены рядом.
Обобщение dialogue_s1_arrest_count.py (шаг 5): файл — аргументом, говорящих больше, плюс проверки
«слова о мечнице» (решение Алексея 1.10) и «цифры вслух». Только читает.
Запуск: python3 dialogue_s1_count.py <файл.md> [-v]  (-v — длина каждой строки)

Строка Б — пункт списка с репликой: «- [теги ·] **Говорящий:** текст» (в одном пункте может быть
несколько говорящих). Теги: «≤N» — предел знаков, «шутка» — шутка ведущего, «за Габа / за Эллион /
за Луциана / за Нобби» — чей герой. Ответ — «**Ответ X** …» и пункты под ним до пустой строки.
Знаки считаются с произнесённым именем («Лизард: »), «Ведущий» не произносится; перебор — 16 сочетаний
пола, и для {П:…} (герой игрока) — каждый из четырёх героев, если строка не помечена «за …»."""
import itertools, os, re, sys

ARGS = [a for a in sys.argv[1:] if not a.startswith('-')]
P = os.path.join(os.path.dirname(os.path.abspath(__file__)), ARGS[0] if ARGS else 'dialogue_s1_arrest.md')
txt = open(P, encoding='utf8').read()
HEROES = 'ГЭЛН'
FOR = {'Габа': 'Г', 'Эллион': 'Э', 'Луциана': 'Л', 'Нобби': 'Н'}
SPEAKERS = ('Ведущий', 'Габ', 'Эллион', 'Луциан', 'Нобби', 'Лизард', 'Стражник', 'Хозяин', 'Задира', 'Герцог', 'Шёпот')
SP = '|'.join(SPEAKERS)
SEG = re.compile(r'\*\*(' + SP + r'):\*\* (.*?)(?= \*\*(?:' + SP + r'):\*\* |$)')
ITEM = re.compile(r'^- (?:(.*?) · )?(\*\*(?:' + SP + r'):\*\* .*)$')
MARK = re.compile(r'\{([ГЭЛНП]):([^|}]*)\|([^}]*)\}')
W = lambda s: re.findall(r'[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*', s)
SENT = lambda t: [x for x in re.split(r'(?:(?<=[.!?…])|(?<=[.!?…]»))\s+(?=[А-ЯЁ«])', t) if W(x)]
CANON_TAIL = ('Лично».', 'Решётка лязгает.')  # крючок серии 1 — канон, не схема шутки
DEFAULT = {'Г': 0, 'Э': 1, 'Л': 0, 'Н': 0, 'П': 0}  # П — герой игрока, для счёта слов — м


def combos(p):
    for g in itertools.product((0, 1), repeat=4):
        d = dict(zip(HEROES, g))
        for h in ([p] if p else HEROES):
            yield dict(d, П=d[h], hero=h)


def render(s, g):
    return MARK.sub(lambda m: m.group(2 + g[m.group(1)]), s)


def label(sp, g):
    if sp == 'Ведущий':
        return ''
    return ('Луциания' if g['Л'] else 'Луциан') if sp == 'Луциан' else sp


def length(segs, g):
    return sum(len(label(sp, g)) + (2 if label(sp, g) else 0) + len(render(t, g)) for sp, t in segs) + len(segs) - 1


def tags_of(s):
    return [t.strip() for t in (s or '').split('·') if t.strip()]


def hero_of(s):
    m = re.search(r'за (' + '|'.join(FOR) + r')\b', s)
    return FOR[m.group(1)] if m else None


# ---- разбор файла ----------------------------------------------------------
items, answers, cur, section = [], [], None, ''
for n, ln in enumerate(txt.split('\n'), 1):
    if ln.startswith('## '):
        section = ln[3:].split(' ', 1)[0]
    m = re.match(r'\*\*Ответ (\S+)\*\*(.*)', ln)
    if m:
        cur = {'id': m.group(1) + ('' if section in ('Вариант', 'Готовые', 'Голос') else '@' + section), 'p': hero_of(m.group(2)), 'items': [], 'line': n}
        answers.append(cur)
        continue
    b = ITEM.match(ln)
    if b:
        tags = tags_of(b.group(1))
        lim = next((int(t[1:]) for t in tags if re.fullmatch(r'≤\d+', t)), None)
        it = {'tags': tags, 'lim': lim, 'joke': 'шутка' in tags, 'p': hero_of(' '.join(tags)),
              'segs': SEG.findall(b.group(2)), 'line': n, 'sec': section}
        (cur['items'] if cur is not None else items).append(it)
        continue
    if not ln.strip() and cur is not None and cur['items']:
        cur = None  # пустая строка сразу под заголовком ответа не обрывает его (так в dialogue_s1_tavern.md, вариант Б)

alltexts = [(it, sp, t) for it in items for sp, t in it['segs']] + \
           [(it, sp, t) for a in answers for it in a['items'] for sp, t in it['segs']]
V = '-v' in sys.argv

# ---- 1. строки-куски: предел знаков ------------------------------------------
over, by_lim = [], {}
for it in items:
    mx = max(length(it['segs'], g) for g in combos(it['p']))
    it['max'] = mx
    if it['lim']:
        by_lim.setdefault(it['lim'], []).append(mx)
        if mx > it['lim']:
            over.append(f"стр. {it['line']}: {mx} > {it['lim']}")
    if V:
        print(f"  стр. {it['line']:>3} {it['sec']} ≤{it['lim']}: {mx}")
print(f'== Строки-куски: {len(items)}; сверх своего предела: {len(over)} {over}')
for k in sorted(by_lim):
    print(f'   предел ≤{k}: строк {len(by_lim[k])}, самая длинная {max(by_lim[k])}')

# ---- 2. ответы целиком -------------------------------------------------------
print(f'== Ответы целиком: {len(answers)}')
answers = [a for a in answers if any(it['segs'] for it in a['items'])]
for a in answers:
    segs = [s for it in a['items'] for s in it['segs']]
    mx = max(length(segs, g) for g in combos(a['p']))
    a['max'] = mx
    spk = sorted({sp for sp, t in segs})
    jokes = sum(it['joke'] for it in a['items'])
    print(f"   {a['id']:>3}: max {mx} знаков{' >700' if mx > 700 else ''}{' >1024!' if mx > 1024 else ''}; "
          f"говорящих {len(spk)} {spk}{' >3!' if len(spk) > 3 else ''}; шуток ведущего {jokes}{' >1!' if jokes > 1 else ''}")

# ---- 3. слух: длина предложений, «фраза + добивка», «Ты…» подряд -------------
long_s, punch, runs, canon = [], [], [], []
for it, sp, t in alltexts:
    r = render(t, DEFAULT)
    ss = SENT(r)
    long_s += [f"стр. {it['line']}: {s}" for s in ss if len(W(s)) > 15]
    for a, b in zip(ss, ss[1:]):
        if len(W(b)) <= 3 and len(W(a)) >= 6 and not re.match(r'Что (делае|скаж)', b):
            (canon if b in CANON_TAIL else punch).append(f"стр. {it['line']}: «…{a[-35:]} | {b}»")
for a in answers:
    ty = [bool(re.match(r'Ты\b', s)) for it in a['items'] for sp, t in it['segs'] if sp == 'Ведущий'
          for s in SENT(render(t, DEFAULT))]
    r = 0
    for x in ty + [False]:
        if x:
            r += 1
        else:
            if r >= 3:
                runs.append(f"{a['id']}: {r}")
            r = 0
print(f'== Предложений длиннее 15 слов: {len(long_s)} {long_s}')
print(f'== «Фраза ≥6 слов + добивка ≤3» (схема шутки, гид §0 п. 4): {len(punch)}; из них канон крючка — не считаю: {len(canon)}')
for h in punch:
    print('     ', h)
print(f'== «Ты…» у ведущего три и больше подряд (гид §0 п. 5): {len(runs)} {runs}')

# ---- 4. квоты гида и канон ---------------------------------------------------
B = ' '.join(render(t, DEFAULT) for it, sp, t in alltexts)
cnt = lambda pat: len(re.findall(pat, B))
CAT, TAIN, AGE = r"[Кк]ошк|[Кк]отён|\bлап|хвост", r"\bтайн", r"тысяч\w* лет"
host = sum(1 for it, sp, t in alltexts if sp == 'Хозяин' and re.search('тяжелеет', t))
print('== Квоты (по всем строкам Б сразу — верхняя граница: за один проход звучит часть):')
print(f'   «Восхитительно» {cnt("Восхитительн")}; «Это знак» {cnt("Это знак")}; «Мурр» {cnt("Мурр")}; '
      f'кошачье (кошк/котён/лап/хвост) {cnt(CAT)}; фраза хозяина о сундуке {host}')
print(f'   слух «Проклятый Меч» {cnt("Проклят")}; «Бернар» {cnt("Бернар")}; «голос меча» {cnt("голос меча")}; '
      f'«тайн» {cnt(TAIN)}; «владел» {cnt("владел")}; «Я не мажу» {cnt("Я не мажу")}; '
      f'«Не понял» {cnt("Не понял")}; «наследни» {cnt("наследни")}; «лет» про возраст {cnt(AGE)}')
left = [f"стр. {it['line']}" for it, sp, t in alltexts for g in combos(it.get('p'))
        if re.search(r'[{}%()]', render(t, g))]
print(f'   скобки и шаблоны после подстановки: {len(set(left))} {sorted(set(left))}')

# ---- 5. формы по полу: прошедшее время после «ты» ------------------------------
STOP = {'стол', 'пол', 'угол', 'зал', 'посол', 'вол', 'ел'}
bad = set()
for it, sp, t in alltexts:
    for g in combos(it.get('p')):
        for s in SENT(render(t, g)):
            if not re.search(r'\b[Тт]ы\b', s):
                continue
            for w in re.findall(r'\b[Тт]ы\b(?:\s+[^\s.,!?:]+){0,3}', s):
                ws = W(w)[1:]
                if g['П'] and any(re.fullmatch(r'[а-яё]+(?:ал|ял|ел|ил|ыл|ул|ёл|ол)(?:ся)?', x) and x not in STOP for x in ws):
                    bad.add(f"стр. {it['line']} (ж): {w}")
                if not g['П'] and any(re.fullmatch(r'[а-яё]+л(?:а|ась)', x) for x in ws):
                    bad.add(f"стр. {it['line']} (м): {w}")
print(f'== Подозрение на ошибку формы (прошедшее время после «ты» не того рода): {len(bad)}')
for b in sorted(bad):
    print('     ', b)

# ---- 6. шаг 5: мечница со стороны и цифры вслух ------------------------------
GABF = r"[Сс]илач|[Зз]доровяч|[Вв]еликанш|[Гг]ромил"
bad6 = sorted({f"стр. {it['line']}" for it, sp, t in alltexts for g in combos(it.get('p')) if re.search(GABF, render(t, g))})
dig = sorted({f"стр. {it['line']}" for it, sp, t in alltexts if re.search(r'\d', render(t, DEFAULT))})
print(f'== Слова о мечнице, отменённые Алексеем 1.10 (силачка, здоровячка, великанша, громила): {len(bad6)} {bad6}')
print(f'== Цифры в тексте озвучки: {len(dig)} {dig}')

# ---- 7. шаг 6: подсказки для вычитки на слух (кандидаты, не приговор) ----------
# (4) один корень в соседних предложениях — по тексту, как его слышит колонка: имена говорящих
# тоже звучат («Лизард берёт… Лизард: …»). Корень грубо: слово без последней буквы, до 5 знаков;
# совпадение — если одна основа начинается с другой (≥3 букв). Ловит и ложные пары — смотреть глазами.
# (2) «ты» и «вы» в реплике одного говорящего — ведущий законно говорит столу «вы», игроку «ты»,
# поэтому это тоже список для глаза.
STOPW = set('тебя тебе тобой твой твоя твоё твои твоего твоём твоему вами ваша ваше ваши вашего вашей '
            'него неё ними этот эта это этого этой того тому только уже ещё будто чтобы когда потом даже '
            'тоже очень здесь тут там всех всем всё весь вся свой своё свои себя себе есть было были '
            'если или что как так где кто сам сама один одна снова теперь'.split())
def stems(s):
    out = set()
    for w in W(s.lower()):
        if len(w) >= 4 and w not in STOPW:
            out.add(w[:-1][:5])
    return out
def near(a, b):
    return [x for x in a for y in b if len(min(x, y, key=len)) >= 3 and (x.startswith(y) or y.startswith(x))]
def spoken(segs, g):
    seq = []
    for sp, t in segs:
        lab = label(sp, g)
        ss = SENT(render(t, g))
        if lab and ss:
            ss[0] = lab + ' ' + ss[0]
        seq += ss
    return seq
rep4 = set()
for it in items + [it for a in answers for it in a['items']]:
    seq = spoken(it['segs'], DEFAULT)
    for a, b in zip(seq, seq[1:]):
        hit = near(stems(a), stems(b))
        if hit:
            rep4.add(f"стр. {it['line']}: {sorted(set(hit))} «…{a[-40:]} | {b[:40]}…»")
for a in answers:  # стыки между пунктами одного ответа
    its = [it for it in a['items'] if it['segs']]
    for x, y in zip(its, its[1:]):
        sa, sb = spoken(x['segs'], DEFAULT), spoken(y['segs'], DEFAULT)
        if sa and sb:
            hit = near(stems(sa[-1]), stems(sb[0]))
            if hit:
                rep4.add(f"ответ {a['id']} (стык стр. {x['line']}→{y['line']}): {sorted(set(hit))} «…{sa[-1][-40:]} | {sb[0][:40]}…»")
TY = re.compile(r'\b(ты|тебя|тебе|тобой|твой|твоя|твоё|твои|твоего|твоём|твоему)\b', re.I)
VY = re.compile(r'\b(вы|вас|вам|вами|ваш|ваша|ваше|ваши|вашего|вашей)\b', re.I)
mix = sorted({f"стр. {it['line']} ({sp})" for it, sp, t in alltexts
              if TY.search(render(t, DEFAULT)) and VY.search(render(t, DEFAULT))})
print(f'== Вычитка, кандидаты (4) «корень в соседних предложениях»: {len(rep4)}')
for h in sorted(rep4):
    print('     ', h)
print(f'== Вычитка, кандидаты (2) «ты» и «вы» в реплике одного говорящего: {len(mix)} {mix}')
