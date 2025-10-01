// Shared date helpers: convert between ISO (yyyy-mm-dd) and DMY (dd-mm-yyyy)

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function isoToDMY(iso) {
  if (!iso) return '';
  // Accept full ISO or plain yyyy-mm-dd
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const [, y, mo, d] = m;
  return `${d}-${mo}-${y}`;
}

export function dmyToISO(dmy) {
  if (!dmy) return '';
  const s = String(dmy).trim();
  const m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (!m) return '';
  let [, d, mo, y] = m;
  d = pad2(d);
  mo = pad2(mo);
  return `${y}-${mo}-${d}`;
}
