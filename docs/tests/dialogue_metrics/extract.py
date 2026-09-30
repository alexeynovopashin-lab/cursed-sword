import re,sys,json
src=open('game.js',encoding='utf8').read().split('\n')
out=[]
rx=re.compile(r"'((?:[^'\\]|\\.)*)'")
for i,l in enumerate(src,1):
    for m in rx.finditer(l):
        s=m.group(1)
        if re.search('[А-Яа-я]{3}',s) and len(s)>=12:
            out.append((i,s.replace("\\'","'")))
json.dump(out,open('/tmp/cc/strings.json','w'),ensure_ascii=False)
print(len(out), sum(len(s) for _,s in out))
