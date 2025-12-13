// Shared helpers for leave reporting screens
export const normalize = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.results && Array.isArray(data.results)) return data.results;
  return [];
};

export const parseDMY = (value) => {
  if (!value) return null;
  const isoMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  }
  const dmyMatch = String(value).match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (dmyMatch) {
    const [, dd, mm, yyyy] = dmyMatch;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  }
  const date = new Date(value);
  return Number.isNaN(date?.getTime()) ? null : date;
};

export const fmtDate = (value) => {
  const dt = parseDMY(value);
  if (!dt) return '';
  const day = String(dt.getDate()).padStart(2, '0');
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}-${dt.getFullYear()}`;
};

export const toISO = (value) => {
  const dt = parseDMY(value);
  return dt ? dt.toISOString().slice(0, 10) : null;
};

export const roundLeave = (value, leaveType) => {
  const num = Number(value) || 0;
  if (leaveType && leaveType.toString().toUpperCase() === 'EL') {
    return Math.round(num);
  }
  return Math.round(num * 2) / 2;
};

export const toDate = (value) => parseDMY(value) || (value ? new Date(value) : null);
