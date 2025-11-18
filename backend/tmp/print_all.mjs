import fs from 'fs';
const s = fs.readFileSync('e:/admindesk/src/pages/emp-leave.jsx','utf8');
const lines = s.split(/\r?\n/);
for(let i=0;i<lines.length;i++){
  console.log((i+1).toString().padStart(4)+': '+lines[i]);
}
