from pathlib import Path
p = Path(r"e:\admindesk\src\pages\emp-leave.jsx")
s = p.read_text(encoding='utf-8')
stack=[]
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
            break
        last, lline, lcol = stack.pop()
        if pairs[last] != ch:
            print('Mismatch detected')
            print('closing', ch, 'at', line, col)
            print('popped opening', last, 'at', lline, lcol)
            print('stack (top->bottom):')
            for it in reversed(stack[-10:]):
                print('  ', it)
            # print context
            context_start = max(0, i-80)
            context_end = min(len(s), i+80)
            context = s[context_start:context_end]
            print('\nContext around mismatch:\n')
            print(context.replace('\n','\n'))
            break
else:
    print('No mismatches found')
