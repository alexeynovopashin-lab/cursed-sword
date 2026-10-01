import re, sys
# Счёт ответов 1-3: до (dialogue_s1_tavern.md, вариант Б) и после (dialogue_s1_tavern_martin.md)
def pick(m):  # метка по полу -> форма по умолчанию (первая)
    return m.group(1).split('|')[0] if '|' in m.group(1) else m.group(1)
def clean(t): return re.sub(r'\{[А-Яа-я]:([^}]*)\}', pick, t)
def answers(path, start_marker=None, n=9):
    txt = open(path, encoding='utf-8').read()
    if start_marker: txt = txt[txt.index(start_marker):]
    parts = re.split(r'(?:\*\*|## )Ответ (\d+)[^\n*]*\*{0,2}', txt)
    out = {}
    for i in range(1, len(parts), 2):
        k = int(parts[i])
        if k in out or k > n: continue
        lines = re.findall(r'^- \*\*([^*]+):\*\* (.*)$', parts[i+1], re.M)
        out[k] = [(s, clean(t)) for s, t in lines]
    return out
def stats(ans):
    rows = []
    for k, lines in sorted(ans.items()):
        text = ' '.join(f'{s}: {t}' for s, t in lines)
        speakers = {s for s, _ in lines}
        sents = [x for s, t in lines for x in re.split(r'(?<=[.!?…])\s+', t) if x.strip()]
        long_ = sum(1 for x in sents if len(re.findall(r'\w+', x)) > 15)
        # знаков до первой реплики не-ведущего (по тексту «Ведущий» до первой строки другого говорящего)
        pre = 0
        for s, t in lines:
            if s != 'Ведущий': break
            pre += len(t) + 1
        pre_sents = 0
        for s, t in lines:
            if s != 'Ведущий': break
            pre_sents += len([x for x in re.split(r'(?<=[.!?…])\s+', t) if x.strip()])
        rows.append((k, len(text), len(speakers), long_, pre, pre_sents,
                     sum(len(re.findall(r'\w+', t)) for s, t in lines if s == 'Ведущий')))
    return rows
base = 'dialogue_s1_tavern.md'
before = answers(base, start_marker='## Вариант Б')
after = answers('dialogue_s1_tavern_martin.md', n=9)
print('Ответ | знаков | говорящих | предл.>15 | знаков до 1-й реплики | предл. до неё | слов ведущего')
for lbl, a in (('ДО', before), ('ПОСЛЕ', after)):
    print(lbl)
    for r in stats(a): print('  ', *r)
a1b = ' '.join(t for s, t in before[1] if s == 'Ведущий')
a1a = ' '.join(t for s, t in after[1] if s == 'Ведущий')
for lbl, t in (('ДО', a1b), ('ПОСЛЕ', a1a)):
    print(lbl, 'Габ в предложении №:', next((i+1 for i, x in enumerate(re.split(r'(?<=[.!?…])\s+', t)) if 'Габ' in x), 'нет'),
          '| запах/звук/тепло:', [w for w in ('пахнет','запах','тепл','печь','шерст','скрип','гул','звон') if w in t])
