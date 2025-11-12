import fs from 'fs';
const s = fs.readFileSync('e:/admindesk/src/pages/emp-leave.jsx','utf8');
const lines = s.split(/\r?\n/);
for(let i=470;i<490;i++) console.log((i+1).toString().padStart(4)+': '+(lines[i]||''));
