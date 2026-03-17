import React from 'react';
import {
  FileText,
  Pencil,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { FaFileExcel, FaFilePdf } from 'react-icons/fa6';
import RegisterForm from './RegisterForm';
import SearchField from './SearchField';
import RegisterTable from './RegisterTable';

const CARD_CLASS = 'rounded-2xl border border-slate-200 bg-white p-6 shadow-md';
const SECTION_TITLE_CLASS = 'flex items-center gap-2 text-lg font-semibold text-slate-700';
const LABEL_CLASS = 'mb-1 block text-sm font-medium text-slate-600';
const INPUT_CLASS = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
const SEARCH_INPUT_CLASS = 'border-slate-300 bg-white text-slate-700 focus:border-blue-500 focus:ring-blue-500/20';
const PRIMARY_BUTTON_CLASS = 'save-button';
const SECONDARY_BUTTON_CLASS = 'reset-button';
const EXPORT_EXCEL_BUTTON_CLASS = 'inline-flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 shadow transition hover:bg-emerald-100';
const EXPORT_PDF_BUTTON_CLASS = 'inline-flex h-10 w-10 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 shadow transition hover:bg-rose-100';
const LAST_BADGE_CLASS = 'inline-flex items-center rounded-full bg-orange-100 px-3 py-1 text-sm font-medium text-orange-700';
const NEXT_BADGE_CLASS = 'inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700';

const RegisterSection = ({
  columns,
  createIcon: CreateIcon,
  data,
  editing,
  fieldDefs,
  filters,
  formCreateTitle,
  formDescription,
  formEditTitle,
  formPanelClassName,
  getFieldListProps,
  getFieldOptions,
  getFieldValue,
  layout,
  listDescription,
  listTitle,
  loading,
  nextNumber,
  onApplyFilters,
  onCancel,
  onDelete,
  onEdit,
  onExportExcel,
  onExportPDF,
  onFieldChange,
  onFiltersChange,
  onSubmit,
  searchLabel,
  searchPlaceholder,
  typeChoices,
}) => {
  return (
    <div className="space-y-3">
      <div className={`${CARD_CLASS} ${formPanelClassName || ''}`}>
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className={SECTION_TITLE_CLASS}>
              {editing ? <Pencil size={18} /> : <CreateIcon size={18} />}
              {editing ? formEditTitle : formCreateTitle}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{formDescription}</p>
          </div>
          {!editing && nextNumber.next_no && (
            <div className="flex flex-wrap gap-2 text-sm">
              {nextNumber.last_no && <span className={LAST_BADGE_CLASS}>Last: {nextNumber.last_no}</span>}
              <span className={NEXT_BADGE_CLASS}>Next: {nextNumber.next_no}</span>
            </div>
          )}
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <RegisterForm
            layout={layout}
            fieldDefs={fieldDefs}
            getValue={getFieldValue}
            getOptions={getFieldOptions}
            getListProps={getFieldListProps}
            onChange={onFieldChange}
            actionContent={(
              <>
                <button type="submit" disabled={loading} className={PRIMARY_BUTTON_CLASS}>
                  {editing ? <Pencil size={16} /> : <Plus size={16} />}
                  {editing ? 'Update Entry' : 'Add Entry'}
                </button>
                {editing && (
                  <button type="button" onClick={onCancel} className={SECONDARY_BUTTON_CLASS}>
                    <RotateCcw size={16} />
                    Cancel
                  </button>
                )}
              </>
            )}
          />
        </form>
      </div>

      <div className={CARD_CLASS}>
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className={SECTION_TITLE_CLASS}>
              <FileText size={18} />
              {listTitle}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{listDescription}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onExportExcel}
              className={EXPORT_EXCEL_BUTTON_CLASS}
              aria-label="Export Excel"
              title="Export Excel"
            >
              <FaFileExcel size={20} color="#1D6F42" />
            </button>
            <button
              type="button"
              onClick={onExportPDF}
              className={EXPORT_PDF_BUTTON_CLASS}
              aria-label="Export PDF"
              title="Export PDF"
            >
              <FaFilePdf size={20} color="#D32F2F" />
            </button>
          </div>
        </div>
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-2 xl:grid-cols-[minmax(280px,1.8fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(150px,1fr)_auto]">
            <div className="space-y-1">
              <label className={LABEL_CLASS}>{searchLabel}</label>
              <SearchField
                placeholder={searchPlaceholder}
                value={filters.search}
                onChange={(event) => onFiltersChange((prev) => ({ ...prev, search: event.target.value }))}
                inputClassName={SEARCH_INPUT_CLASS}
              />
            </div>
            <div className="space-y-1">
              <label className={LABEL_CLASS}>Type</label>
              <select
                value={filters.type}
                onChange={(event) => onFiltersChange((prev) => ({ ...prev, type: event.target.value }))}
                className={INPUT_CLASS}
              >
                <option value="">All Types</option>
                {typeChoices.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className={LABEL_CLASS}>From Date</label>
              <input
                type="date"
                value={filters.date_from}
                onChange={(event) => onFiltersChange((prev) => ({ ...prev, date_from: event.target.value }))}
                className={INPUT_CLASS}
              />
            </div>
            <div className="space-y-1">
              <label className={LABEL_CLASS}>To Date</label>
              <input
                type="date"
                value={filters.date_to}
                onChange={(event) => onFiltersChange((prev) => ({ ...prev, date_to: event.target.value }))}
                className={INPUT_CLASS}
              />
            </div>
            <div className="xl:min-w-[148px] flex items-center xl:justify-end">
              <span className="text-xs text-slate-500">{loading ? 'Refreshing…' : 'Auto-refreshed'}</span>
            </div>
          </div>
        </div>
        <RegisterTable data={data} columns={columns} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  );
};

export default RegisterSection;