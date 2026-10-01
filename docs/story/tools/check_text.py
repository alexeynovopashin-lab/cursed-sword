#!/usr/bin/env python3
"""Проверка текста сцены на слух — подсказки Литератору, не приговор. Только читает.

Запуск:  python3 docs/story/tools/check_text.py <сцена.md> [--g м|ж] [--max 15]
         python3 docs/story/tools/check_text.py --selftest
--g: какой вариант меток {Х:м|ж} подставлять (по умолчанию первый, «м»).

Без морфологии: pymorphy3 подключается только по слову Алексея (DECISIONS 1.10). Поэтому
всё ниже — регулярки, счёт и грубая основа слова (стеммер Портера для русского, Snowball).
Проверки (номера — как в отчёте вычитки):
  1 «ты» и «вы» — в одной реплике и у одного говорящего в одном ответе (местоимения,
    2-е лицо на -ешь/-ишь, повелительное на -ай/-яй и по списку; «вы» — на -йте/-ьте/-ите)
  2 повтор слова или корня: в одном предложении, в соседних и через одно (имя говорящего
    звучит — считается словом первого предложения его реплики)
  3 предложение длиннее --max слов
  4 одно начало у фраз (то же первое слово в 2 из 3 подряд) и имя на стыке
    («…Это Луциан. Луциан: …»)
  5 точка зрения: «вы» по месту («за вашей спиной», «на ваши пояса») и герой отряда
    третьим лицом в словах ведущего одного ответа
  6 формы по полу: имя героя без метки; «я/ты + прошедшее» без метки; мужская форма в
    предложении с меткой, в начале фразы без подлежащего («Был наёмником») и в следующей
    реплике другого говорящего («такой … пригодился»)
  7 омографы без ударения («стоит», «замок», «мука»): ударение в Алисе — «+» перед гласной
Формат сцены — как в docs/story/dialogues/: «## Ответ N …» (или «**Ответ N**»), под ним
пункты «- [теги ·] **Говорящий:** текст»; «---» или другой заголовок закрывает ответ.
"""
import re, sys

MARK = re.compile(r'\{([А-ЯЁA-Z]):([^|{}]*)\|([^{}]*)\}')
ANS = re.compile(r'^(?:#{2,4}\s*|\*\*)Ответ\s+([0-9A-Za-zА-Яа-яЁё.()]+)')
HDR = re.compile(r'^#{1,4}\s')
ITEM = re.compile(r'^- (?:[^*\n]*? · )?(\*\*[^*]+?:\*\*.*)$')
SEG = re.compile(r'\*\*([^*]+?):\*\*\s*')
WORD = re.compile(r'[А-Яа-яЁё+]+(?:-[А-Яа-яЁё+]+)*')
SPLIT = re.compile(r'(?:(?<=[.!?…])|(?<=[.!?…][»"]))\s+')
HOLE = ' ⟦⟧ '  # на месте метки по полу: внутри неё формы уже разведены

NARRATOR = 'Ведущий'
NAME_F = {'Луциан': 'Луциания', 'Габриэль': 'Габриэла'}  # метка говорящего по полу, как в dialogue_s1_count.py
HERO_LETTERS = 'ГЭЛНП'
HERO_SPEAKERS = {'Габ', 'Эллион', 'Луциан', 'Нобби'}
HERO_STEMS = ('габ', 'эллион', 'луциан', 'нобби', 'незнаком')

STOP = set('''и а но да или что чтобы как так же ли бы не ни ну вот это этот эта эти этого этой этому этим
тот та те то того той тому там тут здесь где куда когда кто кого кому чем чей чья чьи я меня мне мной мы
нас нам нами ты тебя тебе тобой вы вас вам вами он она оно они его ее ему ей им ими их него нее нему ней
ним них свой своя свое свои своего своей своим своих мой моя мое мои моего моей твой твоя твое твои твою
ваш ваша ваше ваши вашей весь вся все всех всем всеми сам сама само сами себя себе собой один одна одно
одного одной одному одним был была было были быть есть будет будете будешь уже еще только даже тоже
потом теперь снова очень всего без для при про над под перед через после между около возле из от до
на в с со к у о об по за во ко нет'''.split())
TY_PRON = set('ты тебя тебе тобой тобою твой твоя твое твои твою твоего твоей твоему твоим твоих твоими твоем'.split())
VY_PRON = set('вы вас вам вами ваш ваша ваше ваши вашу вашего вашей вашему вашим ваших вашими вашем'.split())
TY_IMP = set('''иди смотри клади сядь стой дай бери неси слушай держи сиди молчи скажи спроси отдай покажи
садись уходи проходи заходи подожди помоги беги пей возьми положи сними брось верни глянь погоди отойди
вставай давай'''.split())
NOT_TY = set('лишь мышь тишь глушь сарай урожай обычай случай край чай трамвай негодяй каравай лишай '
             'запись надпись подпись роспись'.split())
NOT_VY = set('защите граните зените орбите элите свите'.split())
NOUN_L = set('''стол угол пол зал котел осел орел посол ангел пепел дятел узел козел вол тыл пыл мол кол
ил сокол щегол павел михаил мел футбол бокал канал металл генерал адмирал капитал финал сигнал идеал
материал скандал подвал вокзал журнал привал перевал обвал накал запал ярл'''.split())
ADJ_OJ = set('''такой какой молодой другой большой родной живой злой седой худой прямой простой немой
слепой глухой босой крутой лихой чужой дорогой пустой густой святой'''.split())
NOT_ADJ = set('гений кий сценарий василий дмитрий арсений геннадий анатолий евгений юрий'.split())
HOMO = set('''стоит замок замки мука муки белки кружки полки хлопок орган атлас ирис духи плачу парит
целую угля дороги стрелки ели пропасть засыпать лечу вести'''.split())
INWORLD = re.compile(r'(?<![А-Яа-яЁё])(?:за|перед|позади|возле|около|рядом с|у|на|к|от|из-за|над|под|'
                     r'среди|мимо)\s+(?:ваш[а-яё]*|вами|вас)(?![А-Яа-яЁё])', re.I)

# ---- грубая основа слова: стеммер Портера для русского (Snowball) -------------------------------
VOW = 'аеиоуыэюя'
PG1, PG2 = ('в', 'вши', 'вшись'), ('ив', 'ивши', 'ившись', 'ыв', 'ывши', 'ывшись')
ADJ = ('ее', 'ие', 'ые', 'ое', 'ими', 'ыми', 'ей', 'ий', 'ый', 'ой', 'ем', 'им', 'ым', 'ом', 'его', 'ого',
       'ему', 'ому', 'их', 'ых', 'ую', 'юю', 'ая', 'яя', 'ою', 'ею')
PART1, PART2 = ('ем', 'нн', 'вш', 'ющ', 'щ'), ('ивш', 'ывш', 'ующ')
VERB1 = ('ла', 'на', 'ете', 'йте', 'ли', 'й', 'л', 'ем', 'н', 'ло', 'но', 'ет', 'ют', 'ны', 'ть', 'ешь', 'нно')
VERB2 = ('ила', 'ыла', 'ена', 'ейте', 'уйте', 'ите', 'или', 'ыли', 'ей', 'уй', 'ил', 'ыл', 'им', 'ым', 'ен',
         'ило', 'ыло', 'ено', 'ят', 'ует', 'уют', 'ит', 'ыт', 'ены', 'ить', 'ыть', 'ишь', 'ую', 'ю')
NOUN = ('а', 'ев', 'ов', 'ие', 'ье', 'е', 'иями', 'ями', 'ами', 'еи', 'ии', 'и', 'ией', 'ей', 'ой', 'ий', 'й',
        'иям', 'ям', 'ием', 'ем', 'ам', 'ом', 'о', 'у', 'ах', 'иях', 'ях', 'ы', 'ь', 'ию', 'ью', 'ю', 'ия', 'ья', 'я')


def _cut(w, rv, after_a, plain):
    """Срезать самое длинное окончание в области RV; after_a — только после «а/я»."""
    for e, need in sorted([(e, 1) for e in after_a] + [(e, 0) for e in plain], key=lambda x: -len(x[0])):
        i = len(w) - len(e)
        if w.endswith(e) and i >= rv and (not need or (i - 1 >= rv and w[i - 1] in 'ая')):
            return w[:i]
    return None


def stem(word):
    w = word.lower().replace('ё', 'е').replace('+', '')
    rv = next((i + 1 for i, c in enumerate(w) if c in VOW), len(w))

    def region(start):
        for i in range(start + 1, len(w)):
            if w[i - 1] in VOW and w[i] not in VOW:
                return i + 1
        return len(w)
    r2 = region(region(0))
    x = _cut(w, rv, PG1, PG2)
    if x is None:
        x = _cut(w, rv, (), ('ся', 'сь')) or w
        y = _cut(x, rv, (), ADJ)
        if y is not None:
            y = _cut(y, rv, PART1, PART2) or y
        else:
            y = _cut(x, rv, VERB1, VERB2)
            if y is None:
                y = _cut(x, rv, (), NOUN)
        x = y if y is not None else x
    w = x
    if w.endswith('и') and len(w) - 1 >= rv:
        w = w[:-1]
    for e in ('ость', 'ост'):
        if w.endswith(e) and len(w) - len(e) >= r2:
            w = w[:-len(e)]
            break
    if w.endswith('нн') and len(w) - 2 >= rv:
        w = w[:-1]
    else:
        s = _cut(w, rv, (), ('ейше', 'ейш'))
        if s is not None:
            w = s[:-1] if s.endswith('нн') else s
        elif w.endswith('ь') and len(w) - 1 >= rv:
            w = w[:-1]
    return w


def same_root(a, b):
    if a == b:
        return len(a) >= 3
    x, y = sorted((a, b), key=len)
    return len(x) >= 4 and y.startswith(x)


# ---- разбор файла ------------------------------------------------------------------------------
def parse(txt):
    units, cur = [], None
    for n, raw in enumerate(txt.splitlines(), 1):
        m = ANS.match(raw)
        if m:
            cur = {'id': m.group(1), 'lines': []}
            units.append(cur)
            continue
        if HDR.match(raw) or raw.strip() == '---':
            cur = None
            continue
        m = ITEM.match(raw)
        if not m:
            continue
        parts = SEG.split(m.group(1))
        u = cur
        if u is None:
            u = {'id': f'стр.{n}', 'lines': []}
            units.append(u)
        for i in range(1, len(parts) - 1, 2):
            u['lines'].append({'n': n, 'sp': parts[i].strip(), 't': parts[i + 1].strip()})
    return [u for u in units if u['lines']]


def render(t, g):
    return MARK.sub(lambda m: m.group(2 if g == 'м' else 3), t)


def label(sp, g):
    if sp == NARRATOR:
        return ''
    s = render(sp, g)
    return NAME_F.get(s, s) if g == 'ж' else s


def sents(t):
    return [x for x in SPLIT.split(t) if WORD.search(x)]


def words(s):
    return WORD.findall(s)


def low(w):
    return w.lower().replace('ё', 'е').replace('+', '')


def stream(u, g):
    out = []
    for L in u['lines']:
        lab = label(L['sp'], g)
        for i, s in enumerate(sents(render(L['t'], g))):
            out.append({'n': L['n'], 'sp': L['sp'], 's': s, 'lab': lab if i == 0 else ''})
    return out


def short(s, k=48):
    s = s.strip()
    return s if len(s) <= k else s[:k - 1] + '…'


# ---- проверки ----------------------------------------------------------------------------------
def person(t):
    ty, vy = [], []
    for w in words(t):
        lw = low(w)
        if (lw in TY_PRON or lw in TY_IMP
                or (lw.endswith(('ешь', 'ишь', 'ешься', 'ишься')) and lw not in NOT_TY)
                or (len(lw) >= 5 and lw.endswith(('ай', 'яй', 'айся', 'яйся')) and lw not in NOT_TY)):
            ty.append(w)
        elif lw in VY_PRON or (len(lw) >= 5 and lw.endswith(('йте', 'ьте', 'ите', 'йтесь', 'ьтесь', 'итесь'))
                               and lw not in NOT_VY):
            vy.append(w)
    return ty, vy


def check_tyvy(units, g):
    out = []
    for u in units:
        by_sp = {}
        for L in u['lines']:
            ty, vy = person(render(L['t'], g))
            if ty and vy:
                out.append((u['id'], L['n'], f"{L['sp']}: в одной реплике «ты» {ty} и «вы» {vy}"))
            d = by_sp.setdefault(L['sp'], {'ty': [], 'vy': []})
            d['ty'] += [(L['n'], w) for w in ty]
            d['vy'] += [(L['n'], w) for w in vy]
        for sp, d in by_sp.items():
            # ведущий законно говорит «вы» столу и «ты» игроку — у него ловим только смесь в одной реплике
            lines_ty, lines_vy = {n for n, _ in d['ty']}, {n for n, _ in d['vy']}
            if sp != NARRATOR and d['ty'] and d['vy'] and lines_ty != lines_vy:
                out.append((u['id'], min(lines_ty | lines_vy),
                            f"{sp}: «ты» {[w for _, w in d['ty']]} (стр. {sorted(lines_ty)}) и «вы» "
                            f"{[w for _, w in d['vy']]} (стр. {sorted(lines_vy)}) в одном ответе"))
    return out


def check_repeat(units, g):
    out, seen = [], set()
    for u in units:
        seq = stream(u, g)
        bags = [[(stem(w), w) for w in words((x['lab'] + ' ' if x['lab'] else '') + x['s'])
                 if low(w) not in STOP and len(low(w)) >= 3] for x in seq]
        for i, bag in enumerate(bags):
            for j in range(len(bag)):
                for k in range(j + 1, len(bag)):
                    a, b = bag[j], bag[k]
                    if same_root(a[0], b[0]) and (u['id'], i, 0, a[0]) not in seen:
                        seen.add((u['id'], i, 0, a[0]))
                        out.append((u['id'], seq[i]['n'], f"в одном предложении: {a[1]} / {b[1]} — «{short(seq[i]['s'], 70)}»"))
            for d in (1, 2):
                if i - d < 0:
                    continue
                for a in bags[i - d]:
                    for b in bag:
                        if same_root(a[0], b[0]) and (u['id'], i, d, a[0]) not in seen:
                            seen.add((u['id'], i, d, a[0]))
                            where = 'в соседних' if d == 1 else 'через предложение'
                            out.append((u['id'], seq[i]['n'],
                                        f"{where}: {a[1]} / {b[1]} — «…{short(seq[i - d]['s'][-40:], 40)}» → «{short(seq[i]['s'], 40)}»"))
    return out


def check_length(units, g, mx):
    out, longest = [], 0
    for u in units:
        for x in stream(u, g):
            n = len(words(x['s']))
            longest = max(longest, n)
            if n > mx:
                out.append((u['id'], x['n'], f"{n} слов: «{short(x['s'], 80)}»"))
    return out, longest


def check_openings(units, g):
    out = []
    for u in units:
        seq = stream(u, g)
        first = [low(words(x['s'])[0]) for x in seq]
        for i in range(1, len(seq)):
            prev = [first[i - 1]] + ([first[i - 2]] if i >= 2 else [])
            if first[i] in prev:
                out.append((u['id'], seq[i]['n'], f"начало «{words(seq[i]['s'])[0]}» уже было в 1–2 фразах выше: «{short(seq[i]['s'], 40)}»"))
            if seq[i]['lab']:
                last = words(seq[i - 1]['s'])[-1]
                if same_root(stem(last), stem(words(seq[i]['lab'])[0])):
                    out.append((u['id'], seq[i]['n'], f"имя на стыке: «…{short(seq[i - 1]['s'][-30:], 30)}» → «{seq[i]['lab']}: …»"))
    return out


def check_pov(units, g):
    out = []
    for u in units:
        narr = ' '.join(L['t'] for L in u['lines'] if L['sp'] == NARRATOR)
        if not narr:
            continue
        inworld = INWORLD.findall(render(narr, g))
        heroes = [w for w in words(MARK.sub(HOLE, narr)) if low(w).startswith(HERO_STEMS)]
        heroes += [f'{{{m.group(1)}:…}}' for m in MARK.finditer(narr) if m.group(1) in HERO_LETTERS]
        if inworld and heroes:
            n = next(L['n'] for L in u['lines'] if L['sp'] == NARRATOR)
            out.append((u['id'], n, f"«вы» по месту {inworld} и герои третьим лицом {sorted(set(heroes))}"))
    return out


def past_m(lw):
    return len(lw) >= 3 and lw.endswith(('л', 'лся')) and lw not in NOUN_L and lw.rstrip('ся') not in NOUN_L


def adj_m(lw):
    return lw in ADJ_OJ or (len(lw) >= 4 and lw.endswith(('ый', 'ий')) and lw not in NOT_ADJ)


def check_gender(units, txt):
    out = []
    pairs = {(m.group(2), m.group(3)) for m in MARK.finditer(txt)}
    names = {w for a, b in pairs for w in (a, b) if re.fullmatch(r'[А-ЯЁ][а-яё]+', w) and a != b}
    names |= set(NAME_F) | set(NAME_F.values())
    for u in units:
        ls = u['lines']
        for idx, L in enumerate(ls):
            masked = MARK.sub(HOLE, L['t'])
            bare = [w for w in words(masked) if w in names]
            if bare:
                out.append((u['id'], L['n'], f"{L['sp']}: имя без метки по полу {bare}"))
            hero_sp = L['sp'] in HERO_SPEAKERS or bool(MARK.search(L['sp']))
            for s in sents(masked):
                lw = [low(w) for w in words(s)]
                pm = [w for w, x in zip(words(s), lw) if past_m(x)]
                if 'ты' in lw and pm:
                    out.append((u['id'], L['n'], f"{L['sp']}: «ты» + {pm} без метки (по полу собеседника): «{short(s)}»"))
                if hero_sp and 'я' in lw and pm:
                    out.append((u['id'], L['n'], f"{L['sp']}: «я» + {pm} без метки: «{short(s)}»"))
            if not any(m.group(1) in HERO_LETTERS for m in MARK.finditer(L['t'])):
                continue
            for s in sents(masked):
                ws = words(s)
                lw = [low(w) for w in ws]
                if past_m(lw[0]):
                    out.append((u['id'], L['n'], f"{L['sp']}: фраза начинается с «{ws[0]}» — без подлежащего, по полу? «{short(s)}»"))
                if '⟦⟧' in s:
                    hit = [w for w, x in zip(ws, lw) if adj_m(x) or past_m(x)]
                    if hit:
                        out.append((u['id'], L['n'], f"{L['sp']}: мужская форма вне метки {hit}: «{short(s, 70)}»"))
            if idx + 1 < len(ls) and ls[idx + 1]['sp'] != L['sp']:
                N = ls[idx + 1]
                for s in sents(MARK.sub(HOLE, N['t'])):
                    hit = [w for w in words(s) if adj_m(low(w)) or past_m(low(w))]
                    if hit:
                        out.append((u['id'], N['n'], f"{N['sp']} (после метки в стр. {L['n']}): мужская форма {hit}: «{short(s)}»"))
    return out


def check_homographs(units, g):
    out = []
    for u in units:
        for L in u['lines']:
            hit = [w for w in words(render(L['t'], g)) if '+' not in w and low(w) in HOMO]
            if hit:
                out.append((u['id'], L['n'], f"{L['sp']}: омограф без «+» {hit}"))
    return out


CHECKS = [('1', '«ты» и «вы» у одного говорящего'), ('2', 'повтор слова или корня рядом'),
          ('3', 'длинные предложения'), ('4', 'одно начало у фраз, имя на стыке'),
          ('5', 'точка зрения: «вы» по месту и герой третьим лицом'), ('6', 'формы по полу'),
          ('7', 'омографы без ударения')]


def run(txt, g='м', mx=15):
    units = parse(txt)
    length, longest = check_length(units, g, mx)
    res = {'1': check_tyvy(units, g), '2': check_repeat(units, g), '3': length,
           '4': check_openings(units, g), '5': check_pov(units, g), '6': check_gender(units, txt),
           '7': check_homographs(units, g)}
    return units, res, longest


def report(path, g, mx):
    txt = open(path, encoding='utf8').read()
    units, res, longest = run(txt, g, mx)
    print(f'Файл: {path}; ответов: {len(units)}; реплик: {sum(len(u["lines"]) for u in units)}; '
          f'метки по полу: «{g}»; предел {mx} слов (самое длинное — {longest}).')
    print('Это кандидаты для глаза, не приговор.\n')
    for k, title in CHECKS:
        print(f'== {k}. {title}: {len(res[k])}')
        for uid, n, msg in sorted(res[k], key=lambda x: x[1]):
            print(f'   стр. {n} (ответ {uid}): {msg}')
    print('\nИтого кандидатов: ' + ', '.join(f'{k} — {len(res[k])}' for k, _ in CHECKS)
          + f'; всего {sum(len(v) for v in res.values())}.')


SELFTEST = """## Ответ 1 — каждая проверка должна сработать
- **Ведущий:** Вас трое. За вашей спиной сидит {Г:воин|воительница}. Дверь скрипит. Дверь хлопает.
- **Хозяин:** Ноги вытирай. Кружка эля стоит медяк.
- **Хозяин:** Идите, спросите.
- **Луциан:** Я тебя видел во сне.
- **Габ:** Ты сел на любую.
- **Хозяин:** {Г:Габриэль|Габриэла}. Был наёмником.
- **Незнакомец:** А мне такой пригодился бы.
- **Ведущий:** Под ним совсем молодой {Л:парень|девушка}, растрёпанный. Луциан идёт. Это Луциан.
- **Луциан:** Это он.
- **Ведущий:** Раз два три четыре пять шесть семь восемь девять десять одиннадцать двенадцать тринадцать четырнадцать пятнадцать шестнадцать.
- **Ведущий:** Хозяин сидит у стойки. Даже сидя, он молчит.

## Ответ 2 — ни одна не должна сработать
- **Хозяин:** Иди, спроси. Кружку вернёшь. Эль ст+оит медяк.
- **Ведущий:** У входа скрипит дверь. {Л:Он|Она} садится к огню.
- **Габ:** Ты {Л:сел|села} рядом.
- **{Л:Луциан|Луциания}:** Я тебя {Л:видел|видела}.
"""


def selftest():
    units, res, _ = run(SELFTEST)
    bad = 0
    for k, title in CHECKS:
        hits1 = [r for r in res[k] if r[0] == '1']
        hits2 = [r for r in res[k] if r[0] == '2']
        ok = bool(hits1) and not hits2
        bad += not ok
        print(f"{'ок ' if ok else 'СБОЙ'} {k}. {title}: в ответе 1 — {len(hits1)} (надо ≥1), в ответе 2 — {len(hits2)} (надо 0)")
        for r in hits2:
            print('      лишнее:', r[2])
    must = {'6': ['видел', 'сел', 'Был', 'растрёпанный', 'такой', 'Луциан']}
    for k, ws in must.items():
        found = ' '.join(r[2] for r in res[k])
        for w in ws:
            if w not in found:
                bad += 1
                print(f'СБОЙ {k}: не пойман «{w}»')
    print('selftest:', 'всё ок' if not bad else f'сбоев {bad}')
    return 1 if bad else 0


if __name__ == '__main__':
    args = sys.argv[1:]
    if '--selftest' in args:
        sys.exit(selftest())
    g = 'ж' if '--g' in args and args[args.index('--g') + 1] == 'ж' else 'м'
    mx = int(args[args.index('--max') + 1]) if '--max' in args else 15
    files = [a for i, a in enumerate(args) if not a.startswith('--') and (i == 0 or args[i - 1] not in ('--g', '--max'))]
    if not files:
        print(__doc__)
        sys.exit(2)
    for f in files:
        report(f, g, mx)
