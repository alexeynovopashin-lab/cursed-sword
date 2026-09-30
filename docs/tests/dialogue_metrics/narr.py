import json,re,collections as co,statistics as st
d=json.load(open('/tmp/cc/strings.json'))
UI=re.compile(r'Напиши|Пиши,|Скажи иначе|Панель|Перезапуск|обработчик|глагол|Примеры|отрицание|Серия закончилась|Три действия|Ты продолжаешь|Ты пробуешь:|Что (толкнуть|открыть|положить|бросить|сделать|подпереть)|Чем подпереть|На что лить|Куда бросать|Что ты скажешь|ловкость|каждая попытка|кубик не решает|— конец серии|Пустая строка|Ты молчишь, и таверна|Нет так нет')
N=[]
for ln,s in d:
    if ln<330 or ln in (1148,): continue
    s=s.replace('\\n','\n')
    if UI.search(s): continue
    if not s[0].isupper() and not s.startswith(('%','«','—','(')): continue
    if len(s)<14: continue
    N.append((ln,s))
print('строк-фрагментов рассказчика:',len(N))
sents=[]
for ln,s in N:
    for p in re.split(r'(?<=[.!?…])\s+|\n',s):
        p=p.strip()
        if len(re.findall(r'[А-Яа-я]+',p))>=3: sents.append((ln,p))
W=lambda x:len(re.findall(r"[А-Яа-я\-]+",x))
L=[W(p) for _,p in sents]
print('предложений',len(sents),' слов/предл: mean=%.1f med=%d max=%d'%(st.mean(L),st.median(L),max(L)),' ≥20 слов:',sum(1 for x in L if x>=20),' ≤4 слова:',sum(1 for x in L if x<=4))
starts=co.Counter(re.findall(r'[А-Яа-я]+',p)[0] for _,p in sents)
print('начала предложений, топ:',starts.most_common(8))
ty=sum(1 for _,p in sents if re.match(r'Ты\b',p)); print('предложений на «Ты …»:',ty,'=',round(100*ty/len(sents)),'%')
run=0;runs=[]
for i,(ln,p) in enumerate(sents):
    if re.match(r'Ты\b',p): run+=1
    else:
        if run>=2: runs.append(run)
        run=0
print('серий «Ты…» подряд ≥2:',len(runs),' самая длинная:',max(runs) if runs else 0)
sim=[(ln,p) for ln,p in sents if re.search(r'\b(как|будто|словно)\b',p)]
print('предложений со сравнением (как/будто/словно):',len(sim),'=',round(100*len(sim)/len(sents)),'%')
groups={'«тяжёлый как ворота» (стол)':r'как ворота','«обиженный кабан/зверь» (сундук)':r'как обиженн','«подарок/подарили лето» (эльф)':r'подарок|подарили лето|подарка лета','хозяин закрывает лицо':r'закрывает лицо','«делают вид, что не слушают»':r'делают вид|делает вид','«будто…» про людей в таверне':r'будто завтра|будто уже видел|будто он говорит','«тяжёл-»':r'\bтяжёл','«не согласен» (о предмете)':r'не согласен','подмигивание «не забудешь / для науки»':r'не забудешь|для науки','«пахнет …»':r'[Пп]ахн','умаление «лучше, чем …/так себе»':r'лучше, чем|так себе','отказ «нельзя/нечего/не пройти»':r'нельзя|нечего|не стоит|не пройти|не получится|Нечего|Не сдвинуть','«у тебя такого нет / и так …»':r'у тебя такого нет|и так (у тебя|при тебе|там|у двери|на ногах)'}
for k,rx in groups.items():
    hits=sorted({ln for ln,s in N if re.search(rx,s)})
    print(f"  {k}: {len(hits)} строк, game.js:{hits[:12]}")
allw=[w for _,p in sents for w in re.findall(r"[А-Яа-я\-]+",p)]
nom=[w.lower() for w in allw if re.search(r'(ение|ание|ость|ство|ация)$',w.lower()) and len(w)>6]
print('\nотвлечённые сущ. (-ение/-ание/-ость/-ство/-ация, >6 букв): %d из %d слов = %.1f%%'%(len(nom),len(allw),100*len(nom)/len(allw)))
print(co.Counter(nom).most_common(14))
cl=re.compile(r'заведени|осуществ|является|данн(ый|ая|ое)|в связи|в целях|ввиду|посредством|необходим|в случае|соответствен|обстоятельств|следует')
print('канцелярские маркеры:',[(ln,cl.search(s).group(0)) for ln,s in N if cl.search(s)])
ex=re.compile(r':\s|потому|поэтому|значит|то есть|судя по|кажется|похоже|видимо|зачем|чтобы|так как|поскольку|\(')
E=[(ln,p) for ln,p in sents if ex.search(p)]
print('\nпредложений-пояснений (двоеточие/потому/судя по/кажется/скобки/«чтобы»):',len(E),'=',round(100*len(E)/len(sents)),'%')
mind=re.compile(r'\b(думаешь|знаешь|чувствуешь|помнишь|понимаешь|решаешь|видишь|не любишь думать|не забудешь)\b')
M=[(ln,p) for ln,p in sents if mind.search(p)]
print('предложений про внутреннее состояние (думаешь/знаешь/чувствуешь…):',len(M))
for ln,p in E[:30]: print(' E',ln,p[:150])

print('\n===== ДОП =====')
cat=[(ln,s) for ln,s in N if re.match(r'^[А-ЯЁ][^:.\n]{2,45}: ',s) and 350<=ln<=400]
print('каталожная форма «Предмет: признак, признак» в описаниях осмотра:',len(cat),'из',len([1 for ln,s in N if 350<=ln<=400]),'строк-описаний (game.js 350–400)')
# punchline tail
pt=0;tot=0;ex=[]
for ln,s in N:
    ps=[p for p in re.split(r'(?<=[.!?…])\s+',s.replace('\\n',' ')) if len(re.findall(r'[А-Яа-я]+',p))>=1]
    for i in range(1,len(ps)):
        tot+=1
        if len(re.findall(r'[А-Яа-я]+',ps[i]))<=3 and len(re.findall(r'[А-Яа-я]+',ps[i-1]))>=6:
            pt+=1; ex.append((ln,ps[i-1][-50:]+' | '+ps[i]))
print('«длинная фраза + короткая добивка ≤3 слов»: %d из %d пар соседних предложений = %d%%'%(pt,tot,round(100*pt/tot)))
for e in ex[:14]: print('  ',e)
tri=[(ln,m.group(0)) for ln,s in N for m in re.finditer(r'\b[а-яё]+, [а-яё]+ и [а-яё]+\b|\b[а-яё]+, [а-яё]+, [а-яё]+\b',s) ]
print('перечисления «X, Y и Z» (тройки):',len(tri),tri[:10])
# факт проговорён несколько раз
def hits(rx,pool):
    return sorted({ln for ln,s in pool if re.search(rx,s)})
allS=[(ln,s.replace('\\n','\n')) for ln,s in d if ln>=140]
for k,rx in [('«Проклятый Меч. Кто с ним пошёл — не вернулся»',r'Кто с ним пошёл|никто не остаётся|Проклятый Меч'),('капитан «не на службе / за чужой счёт»',r'не на службе|за чужой счёт'),('«подняли руку на капитана его светлости» / виселица',r'подняли руку|Виселиц'),('«оружие — в сундук / на выходе / с каждым годом тяжелеет»',r'на выходе|с каждым годом|С каждым годом|Оружие — в сундук|Сначала сундук'),('эльф платит за всех / угощает всех',r'платит за всех|угощает всех|платит за чужой|За одну монету'),('«Это знак»',r'Это знак|это знак'),('«книжка/книга на цепочке — дороже / вор глаз положил»',r'на цепочке|Книжка-то')]:
    h=hits(rx,allS); print(f'  {k}: {len(h)} строк game.js:{h}')
# слышимость
long=[(ln,p) for ln,p in sents if W(p)>=20]
print('\nпредложения ≥20 слов (в одно дыхание):',len(long))
for ln,p in long: print('  ',ln,W(p),'сл.',p[:110]+'…')
mark=[(ln,s[:70]) for ln,s in N if re.search(r'\{[a-z]:|%[a-z]+[+~]?%|\(',s)]
print('строки со скобками/разметкой, которые нельзя произнести как есть:',len(mark),'адреса:',sorted({ln for ln,_ in mark})[:30])
nest=[ln for ln,s in N if re.search(r'«[^»]*—[^»]*»',s) or s.count('—')>=4]
print('строки, где 4+ реплик/тире в одном абзаце (не различить голоса на одной колонке):',len(nest),sorted(set(nest)))
