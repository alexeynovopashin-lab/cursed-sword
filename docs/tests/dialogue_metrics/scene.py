"""Метрики по сцене «Таверна»: до / А / Б. Читает docs/story/dialogue_scene_tavern.md."""
import re,statistics as st,collections as co,sys,os
P=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','story','dialogue_scene_tavern.md')
txt=open(P,encoding='utf8').read()
parts=re.split(r'\n## ',txt)
ver={}
for pt in parts:
    name=pt.split('\n')[0]
    key='до' if name.startswith('До') else 'А' if 'Вариант А' in name else 'Б' if 'Вариант Б' in name else None
    if key: ver[key]=pt
W=lambda s:re.findall(r"[А-Яа-яЁё\-]+",re.sub(r'\{[^}]*\}',lambda m:m.group(0).split('|')[0].strip('{'),s))
def sents(t): return [x for x in re.split(r'(?<=[.!?…])\s+',t) if W(x)]
for k in ['до','А','Б']:
    v=ver[k]
    blocks=re.split(r'\*\*Ответ \d+\*\*',v)[1:]
    chars=[]; lines=[]; spk=[]
    for b in blocks:
        ls=re.findall(r'^- \*\*(.+?):\*\* (.*)$',b,flags=re.M)
        lines+=ls; spk.append(len({sp for sp,t in ls}))
        chars.append(sum(len(sp)+2+len(t) for sp,t in ls)+len(ls))
    narr=[t for sp,t in lines if sp in('Рассказчик','Ведущий')]
    heroes=[(sp,t) for sp,t in lines if sp in('Габ','Эллион','Луциан','Нобби')]
    npc=[(sp,t) for sp,t in lines if sp in('Хозяин',)]
    ns=[s for t in narr for s in sents(t)]
    hl=[len(W(t)) for sp,t in heroes]
    print(f'== {k}: ответов {len(blocks)}, знаков в ответе {chars} (max {max(chars)})')
    print('   говорящих в ответе:',spk,'(правило слуха: ≤3)')
    print(f'   реплик героев {len(heroes)}: слов ср={st.mean(hl):.1f} мед={st.median(hl)} max={max(hl)}; ≤3 слов: {sum(1 for x in hl if x<=3)}; хозяина {len(npc)}')
    per=co.defaultdict(list)
    for sp,t in heroes: per[sp].append(len(W(t)))
    print('   по героям (n/ср.слов):',{sp:(len(v),round(st.mean(v),1)) for sp,v in per.items()})
    print(f'   рассказчик: строк {len(narr)}, предложений {len(ns)}, слов/предл ср={st.mean([len(W(s)) for s in ns]):.1f}, ≥20 слов: {sum(1 for s in ns if len(W(s))>=20)}, ≤3 слов: {sum(1 for s in ns if len(W(s))<=3)}')
    allt=' '.join(t for sp,t in lines)
    print('   «Ты/Вы…» в начале предложения рассказчика:',sum(1 for s in ns if re.match(r'(Ты|Вы)\b',s)),'; «как/будто/словно»:',sum(1 for s in ns if re.search(r'\b(как|будто|словно)\b',s)))
    print('   скобки в тексте:',len(re.findall(r'\(',allt)),'; фирменное: Восхитительно',len(re.findall('Восхитительн',allt)),', Это знак',len(re.findall('Это знак',allt)),', Мурр',len(re.findall('Мурр',allt)))
    print('   «Проклятый Меч» (слух):',len(re.findall('Проклятый Меч',allt)),'; правило сундука («на выходе»):',len(re.findall('на выходе',allt)),'; строк с 4+ тире в одном абзаце: ',sum(1 for sp,t in lines if t.count('—')>=4))
    print('   реплик героев без слов рассказчика-ремарки: ',sum(1 for sp,t in heroes if not re.search(r'говорит|отвечает|шепчет|спрашивает',t)),'из',len(heroes))
