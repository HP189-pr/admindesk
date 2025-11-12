import fs from 'fs';
const p = fs.readFileSync('e:/admindesk/src/pages/emp-leave.jsx', 'utf8');
const pairs = { '(': ')', '[': ']', '{': '}' };
const stack = [];
for (let i = 0; i < p.length; i++) {
	const ch = p[i];
	if (pairs[ch]) stack.push([ch, i]);
	else if (Object.values(pairs).includes(ch)) {
		if (stack.length === 0) {
			console.log('Unmatched closing', ch, 'at', i);
			process.exit(0);
		}
		const o = stack.pop();
		const oCh = o[0], oi = o[1];
		if (pairs[oCh] != ch) {
			console.log('Mismatched', oCh, 'at', oi, 'closed by', ch, 'at', i);
			process.exit(0);
		}
	}
}
if (stack.length) {
	console.log('Unclosed tokens remaining:');
	stack.slice(-20).forEach(x => console.log(x));
} else console.log('All balanced');