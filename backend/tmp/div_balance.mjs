import fs from 'fs';
const s = fs.readFileSync('e:/admindesk/src/pages/emp-leave.jsx','utf8');
const lines = s.split(/\r?\n/);
let balance=0;
for(let i=0;i<400;i++){
  const l = lines[i]||'';
  const opens = (l.match(/<div\b/g)||[]).length;
  const closes = (l.match(/<\/div>/g)||[]).length;
  balance += opens - closes;
  if((opens||closes)) console.log(`${String(i+1).padStart(4)}: +${opens} -${closes} => bal=${balance}  ${l.trim()}`);
}
console.log('Final balance up to 400:', balance);
