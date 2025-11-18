from pathlib import Path
p = Path(r"e:\admindesk\src\pages\emp-leave.jsx")
s = p.read_text(encoding='utf-8')
start_line=1
end_line=99999
lines = s.splitlines()
# find offsets for segment
seg_start=580
seg_end=620
# compute char index of seg_start
idx=0
for i in range(seg_start-1):
    idx += len(lines[i])+1
# now run through file tracking stack but only print events within segment
stack=[]
pairs={'(':')','{':'}','[':']'}
line=1; col=0
for i,ch in enumerate(s):
    if ch=='\n':
        line+=1; col=0; continue
    col+=1
    if ch in pairs:
        stack.append((ch,line,col))
    elif ch in pairs.values():
        if not stack:
            print(f'Unmatched closing {ch} at {line}:{col}')
            break
        last, lline, lcol = stack.pop()
        if pairs[last] != ch:
            print(f'MISMATCH: closing {ch} at {line}:{col} popped {last} from {lline}:{lcol}')
            break
    if seg_start <= line <= seg_end and ch in '(){}[]':
        print(f"{line}:{col} {'push' if ch in pairs else 'pop'} {ch} stack_top={stack[-1] if stack else None} stack_len={len(stack)}")
print('DONE')
