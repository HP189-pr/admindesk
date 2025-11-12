import fs from 'fs';
const code = fs.readFileSync('e:/admindesk/src/pages/emp-leave.jsx','utf8');
const idx = 26269;
const start = Math.max(0, idx-40);
const end = Math.min(code.length, idx+40);
console.log('Context:', code.slice(start,end));
console.log('Hex codes:');
for(let i=start;i<end;i++){
  const ch = code[i];
  process.stdout.write(i+':'+ch+'('+ch.charCodeAt(0)+')  ');
  if((i-start+1)%6===0) process.stdout.write('\n');
}
console.log();
