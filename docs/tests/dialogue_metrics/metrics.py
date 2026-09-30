import re,json,statistics as st,collections as co,sys
import os; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from corpus import C
W=lambda s:re.findall(r"[А-Яа-яЁёA-Za-z\-]+",s)
by=co.defaultdict(list)
for sp,a,t in C: by[sp].append((a,t))
names={'gab':'Габ','elf':'Эллион','mage':'Маг','nobby':'Нобби','host':'Хозяин','rowdy':'Задира','lizard':'Лизард','duke':'«Герцог»'}
print('== ДИАЛОГ: длина реплик (слов)')
for sp,l in by.items():
    n=[len(W(t)) for a,t in l]
    g=sum(1 for a,t in l if a.startswith('game'));s=len(l)-g
    print(f"{names[sp]:9} n={len(l):3} (game {g}/season {s})  mean={st.mean(n):.1f} med={st.median(n)} max={max(n)}  ≤3 слов={sum(1 for x in n if x<=3)}  ≥15 слов={sum(1 for x in n if x>=15)}  '!'={sum(t.count('!') for a,t in l)} '?'={sum(t.count('?') for a,t in l)}")
allt=[t for sp in by for a,t in by[sp]]
print('\n== Повторы оборотов (по всему корпусу реплик)')
def cnt(rx,sp=None):
    src=[t for s2 in by if sp is None or s2==sp for a,t in by[s2]]
    return sum(len(re.findall(rx,t)) for t in src)
for label,rx,sp in [('Восхитительно','Восхитительн','elf'),('Это знак','Это знак','mage'),('Судьба/судьб','[Сс]удьб','mage'),('Мурр','Мурр','nobby'),('Кошки/котёнок','Кошк|котён','nobby'),('«Все так говорят»','Все так говорят',None),('Я не мажу/Мазала','не мажу|Мазала|Промазала',None),('Четверо. Все здесь','Четверо\\. Все здесь',None),('обычно умирают другие','обычно умирают другие',None),('Скучно','Скучно',None),('Тише. Дыши. Я здесь','Тише\\. Дыши\\. Я здесь',None),('капитана его светлости','капитана его светлости',None),('Виселица','Виселиц|повешу|повесили',None),('на выходе','на выходе',None),('сундук','сундук',None)]:
    print(f"  {label:26}{cnt(rx,sp)}")
# по адресам
def where(rx):
    return [ (sp,a) for sp in by for a,t in by[sp] if re.search(rx,t)]
print('  Восхитительно — адреса:',[a for s,a in where('Восхитительн')])
print('  Это знак — адреса:',[a for s,a in where('Это знак')])
print('  Хозяин: реплик про сундук/выход/оружие/правило:',sum(1 for a,t in by['host'] if re.search('сундук|на выходе|оружи|Правил|правил',t)),'из',len(by['host']))
print('\n== Начала реплик (первое слово), топ по героям')
for sp,l in by.items():
    c=co.Counter(W(t)[0].lower() for a,t in l if W(t))
    print(f"  {names[sp]:9}",c.most_common(4))
print('\n== Схема «Я X. Ты Y.» и двухтактные реплики')
par=[(sp,a,t) for sp in by for a,t in by[sp] if re.match(r'(Я|Ты) ',t)]
print('  реплик, начинающихся с «Я/Ты»:',len(par),'из',len(allt))
two=[(sp,a,t) for sp in by for a,t in by[sp] if len(re.findall(r'[.!?…]\s',t+' '))>=2 and len(W(t))<=14]
print('  «два-три коротких предложения подряд» (≤14 слов, ≥2 предложений):',len(two),'из',len(allt),'=',round(100*len(two)/len(allt)),'%')
print('  реплик с тире/двоеточием-тезисом «X — Y»:',sum(1 for t in allt if ' — ' in t))
print('  реплики без глагола-действия (только оценка): —')
# шутки по схеме
print('\n== Шутки-схемы в репликах')
sch={'сравнение «как X»':r'\bкак\b','отрицание-контра «не X, а Y / X, а не Y»':r'не [а-я]+, а ','«зато/но…» опровержение':r'\b(зато|Впрочем)\b','пауза-«…Скучно/Ладно» после многоточия':r'…|\.\.\.'}
for k,rx in sch.items(): print(f"  {k}: {cnt(rx)}")
