import fs from 'fs';
const s = fs.readFileSync('e:/admindesk/src/pages/emp-leave.jsx','utf8');
const lines = s.split(/\r?\n/);
const stack = [];
for(let i=0;i<lines.length;i++){
  const l = lines[i];
  const regex = /<div\b[^>]*>/g;
  let m;
  while((m = regex.exec(l))){ stack.push({line:i+1, text: m[0]}); }
  const closers = l.match(/<\/div>/g) || [];
  for(let c of closers){
    if(stack.length) stack.pop(); else console.log('Extra closer at', i+1);
  }
}
if(stack.length){ console.log('Unclosed <div> tags:'); stack.forEach(x=>console.log(x)); } else console.log('All divs closed');
