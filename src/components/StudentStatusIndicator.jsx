import React from 'react';

const STATUS_PRESENTATION = {
  ACTIVE: { shortLabel: 'A', label: 'Active', className: 'bg-emerald-500' },
  ACTIVE_PASS_OUT: { shortLabel: 'AP', label: 'Active & Pass Out', className: 'bg-indigo-500' },
  LEFT: { shortLabel: 'L', label: 'Left', className: 'bg-red-400' },
  PASS_OUT: { shortLabel: 'PO', label: 'Pass Out', className: 'bg-blue-500' },
  RESHUFFLE_OUT: { shortLabel: 'RO', label: 'Reshuffle Out', className: 'bg-gray-500' },
  NOT_IN_COLLEGE: { shortLabel: 'NC', label: 'Not In College', className: 'bg-orange-400' },
  DROP_OUT: { shortLabel: 'DO', label: 'Drop Out', className: 'bg-gray-500' },
  CANCELLED: { shortLabel: 'C', label: 'Cancelled', className: 'bg-red-600' },
};

export default function StudentStatusIndicator({ status, cancel = false }) {
  const key = cancel ? 'CANCELLED' : String(status || 'ACTIVE').trim().toUpperCase();
  const presentation = STATUS_PRESENTATION[key] || STATUS_PRESENTATION.ACTIVE;

  return (
    <span
      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white ${presentation.className}`}
      title={presentation.label}
      aria-label={presentation.label}
    >
      {presentation.shortLabel}
    </span>
  );
}
