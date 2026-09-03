import re
h=open('index.html',encoding='utf-8',errors='replace').read()
a=h.index('function playableHtml')
b=h.index('function exportProject',a)
s=h[a:b]
print('ticks',s.count('`'))
for i,c in enumerate(s):
 if c=='`': print(i,repr(s[max(0,i-35):i+35]))
