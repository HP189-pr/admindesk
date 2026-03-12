import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';

const HEAD_CELL_CLASS = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-700';
const CELL_CLASS = 'border-b border-slate-200 px-4 py-3 align-top text-sm text-slate-700';
const EDIT_BUTTON_CLASS = 'inline-flex items-center justify-center rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-600';
const DELETE_BUTTON_CLASS = 'inline-flex items-center justify-center rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-rose-600';

const RegisterTable = ({
  data,
  columns,
  onEdit,
  onDelete,
}) => {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={HEAD_CELL_CLASS}>
                  {column.label}
                </th>
              ))}
              <th className={`${HEAD_CELL_CLASS} text-center`}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {data.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No records found
                </td>
              </tr>
            )}

            {data.map((row) => (
              <tr key={row.id} className="bg-white transition-colors hover:bg-blue-50">
                {columns.map((column) => {
                  const value = column.render ? column.render(row) : row[column.key];
                  const cellClassName = `${CELL_CLASS}${column.key === 'inward_no' || column.key === 'outward_no' ? ' font-semibold text-slate-800' : ''}`;

                  return (
                    <td key={column.key} className={cellClassName}>
                      {value || '—'}
                    </td>
                  );
                })}

                <td className={`${CELL_CLASS} text-center`}>
                  <div className="flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(row)}
                      className={EDIT_BUTTON_CLASS}
                      title="Edit record"
                      aria-label="Edit record"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(row.id)}
                      className={DELETE_BUTTON_CLASS}
                      title="Delete record"
                      aria-label="Delete record"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RegisterTable;