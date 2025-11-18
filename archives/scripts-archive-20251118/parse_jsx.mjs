import fs from 'fs';
import parser from '@babel/parser';
const code = fs.readFileSync('e:/admindesk/src/pages/emp-leave.jsx','utf8');
try {
  const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx','classProperties','optionalChaining','nullishCoalescingOperator'] });
  console.log('Parsed OK');
} catch (e) {
  console.error('Parse error:', e.message);
  console.error(e.loc);
}
