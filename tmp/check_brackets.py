path = r'e:/admindesk/src/pages/Enrollment.jsx'
with open(path, encoding='utf-8') as f:
    s = f.read()
counts = {'(':0,')':0,'{':0,'}':0,'[':0,']':0}
for ch in s:
    if ch in counts:
        counts[ch]+=1
print(counts)
print('paren match', counts['(']==counts[')'])
print('brace match', counts['{']==counts['}'])
print('bracket match', counts['[']==counts[']'])
# Print line around first unmatched brace if any
if counts['{']!=counts['}']:
    # find line numbers where braces differ
    bal=0
    for i,ch in enumerate(s):
        if ch=='{': bal+=1
        if ch=='}': bal-=1
        if bal<0:
            # show context
            lines = s[:i+1].splitlines()
            L = len(lines)
            print('First premature closing brace at line', L)
            start = max(0, L-5)
            for ln in lines[start:]:
                print(ln)
            break

# show small region around earlier reported area
for n in range(760,810):
    try:
        print(f"{n:03}: "+s.splitlines()[n-1])
    except Exception:
        pass
