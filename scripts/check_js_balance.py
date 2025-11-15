import sys
from pathlib import Path
p = Path(r"e:\admindesk\src\pages\emp-leave.jsx")
s = p.read_text(encoding='utf-8')
stack = []
pairs = {'(':')','{':'}','[':']'}
line=1; col=0
for i,ch in enumerate(s):
    if ch=='\n':
        line+=1; col=0; continue
    col+=1
    if ch in pairs:
        stack.append((ch,line,col))
    elif ch in pairs.values():
        if not stack:
            print(f"Unmatched closing {ch} at {line}:{col}")
            sys.exit(2)
        last, lline, lcol = stack.pop()
        if pairs[last] != ch:
            print(f"Mismatched {last} at {lline}:{lcol} closed by {ch} at {line}:{col}")
            sys.exit(3)
if stack:
    last, lline, lcol = stack[-1]
    print(f"Unclosed {last} from {lline}:{lcol}")
    sys.exit(4)
print('Brackets balanced')
print('File length:', len(s), 'chars')
