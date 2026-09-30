export const normalizeDisplayValue = value => {
  if (value == null || (typeof value === 'string' && ['', 'null', 'undefined', 'none', 'na', 'n/a'].includes(value.trim().toLowerCase()))) return 'NA';
  return typeof value === 'string' ? value.trim() : value;
};
