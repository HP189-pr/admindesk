//src/components/RegisterSection.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  Eye,
  FileText,
  Layers,
  MoreVertical,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { FaFileExcel, FaFilePdf } from 'react-icons/fa6';
import SearchField from './SearchField';

const CARD_CLASS = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
const LABEL_CLASS = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500';
const INPUT_CLASS = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15';
const SEARCH_INPUT_CLASS = 'h-11 rounded-xl border-slate-200 bg-white text-slate-700 focus:border-blue-500 focus:ring-blue-500/15';
const SECONDARY_BUTTON_CLASS = 'inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50';
const BASE_FIELD_CLASS = 'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
const TEXTAREA_CLASS = `${BASE_FIELD_CLASS} min-h-[88px] resize-y`;
const DATE_INPUT_CLASS = BASE_FIELD_CLASS;
const FIELD_LABEL_CLASS = 'mb-1 block text-sm font-medium text-slate-600';
const FIELD_HELPER_CLASS = 'min-h-[16px] text-xs text-slate-500';
const HEAD_CELL_CLASS = 'sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600';
const CELL_CLASS = 'border-b border-slate-100 px-4 py-3 align-middle text-sm text-slate-700';
const SERIES_STYLES = {
  STUDENT: 'border-blue-100 bg-blue-50 text-blue-700',
  EXAM: 'border-violet-100 bg-violet-50 text-violet-700',
  FEES: 'border-orange-100 bg-orange-50 text-orange-700',
  APPOINTMENT: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  GENERAL: 'border-slate-200 bg-slate-50 text-slate-700',
};

const typeLabel = (type) => ({
  GEN: 'General',
  ENR: 'Enrollment',
  CAN: 'Cancellation',
  TRN: 'Transfer',
  ERP: 'ERP Updation',
  OTH: 'Other',
  EXAM: 'Examination',
  APPT: 'Appointment',
  FEE: 'Fees',
}[type] || type || '');

const seriesForType = (type) => {
  if (['ENR', 'CAN', 'TRN', 'ERP', 'OTH'].includes(type)) return 'Student Register';
  if (type === 'EXAM') return 'Examination Register';
  if (type === 'FEE') return 'Fees Register';
  if (type === 'APPT') return 'Appointment Register';
  return 'General Register';
};

const seriesCategoryForType = (type) => {
  if (['ENR', 'CAN', 'TRN', 'ERP', 'OTH'].includes(type)) return 'STUDENT';
  if (type === 'EXAM') return 'EXAM';
  if (type === 'FEE') return 'FEES';
  if (type === 'APPT') return 'APPOINTMENT';
  return 'GENERAL';
};

const normalizeOption = (option) => {
  if (typeof option === 'string') {
    return { value: option, label: option };
  }

  if (option.institute_code || option.institute_name) {
    const code = option.institute_code || '';
    const name = option.institute_name || '';
    return {
      value: name || code,
      label: [code, name].filter(Boolean).join(' - '),
      key: option.key ?? option.institute_id ?? code ?? name,
    };
  }

  return {
    value: option.value ?? option.id ?? option.institute_name ?? '',
    label: option.label ?? option.name ?? option.institute_name ?? option.value ?? option.id ?? '',
    key: option.key ?? option.id ?? option.value ?? option.institute_id ?? option.institute_name,
  };
};

const SeriesBadge = ({ type }) => {
  const series = seriesCategoryForType(type);
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${SERIES_STYLES[series]}`}>
      {series === 'STUDENT' ? 'Student' : series === 'APPOINTMENT' ? 'Appointment' : series === 'FEES' ? 'Fees' : series === 'EXAM' ? 'Examination' : 'General'}
    </span>
  );
};

const EnhancedAutocomplete = ({
  value,
  onChange,
  options = [],
  onInputChange,
  placeholder = 'Type to search...',
  minChars = 3,
  maxSuggestions = 10,
  isLoading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const normalizedOptions = options.slice(0, maxSuggestions).map(normalizeOption);
  const shouldShowOptions = isOpen && value.length >= minChars && normalizedOptions.length > 0;

  const handleInputChange = (event) => {
    const newValue = event.target.value;
    onChange(newValue);
    setHighlightedIndex(-1);
    if (onInputChange) onInputChange(newValue);
    setIsOpen(true);
  };

  const handleOptionSelect = (option) => {
    onChange(option.value || option.label);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (!shouldShowOptions) {
      if (event.key === 'ArrowDown' && value.length >= minChars) {
        setIsOpen(true);
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setHighlightedIndex((prev) => (prev < normalizedOptions.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        event.preventDefault();
        if (highlightedIndex >= 0 && normalizedOptions[highlightedIndex]) {
          handleOptionSelect(normalizedOptions[highlightedIndex]);
        } else {
          setIsOpen(false);
        }
        break;
      case 'Escape':
        event.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (highlightedIndex >= 0 && shouldShowOptions) {
      const highlightedElement = document.getElementById(`autocomplete-option-${highlightedIndex}`);
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, shouldShowOptions]);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (value.length >= minChars) {
              setIsOpen(true);
            }
          }}
          className={`${BASE_FIELD_CLASS} pr-10`}
          placeholder={placeholder}
          autoComplete="off"
        />
        {value.length >= minChars && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <ChevronDown size={16} className={`text-slate-400 transition-transform ${shouldShowOptions ? 'rotate-180' : ''}`} />
          </div>
        )}
      </div>

      {shouldShowOptions && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-300 bg-white shadow-lg">
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-slate-500 text-center">Loading suggestions...</div>
          ) : (
            normalizedOptions.map((option, index) => (
              <button
                key={option.key || `${option.value}-${index}`}
                id={`autocomplete-option-${index}`}
                type="button"
                onClick={() => handleOptionSelect(option)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${index === highlightedIndex ? 'bg-blue-500 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      )}

      <div className={FIELD_HELPER_CLASS}>
        {value && value.length < minChars ? `Type ${minChars} or more characters to search` : ''}
      </div>
    </div>
  );
};

const FormField = ({
  field,
  value,
  onChange,
  options = [],
  listOptions = [],
  onSearch,
  isLoading = false,
}) => {
  const normalizedValue = value ?? '';

  const renderSelect = () => (
    <select value={normalizedValue} onChange={(event) => onChange(event.target.value)} className={BASE_FIELD_CLASS}>
      <option value="">{field.placeholder || 'Select'}</option>
      {options.some((option) => option?.group) ? (
        Object.entries(
          options.reduce((groups, option) => {
            const group = option.group || 'Other';
            groups[group] = groups[group] || [];
            groups[group].push(option);
            return groups;
          }, {})
        ).map(([group, groupOptions]) => (
          <optgroup key={group} label={group}>
            {groupOptions.map((option) => {
              const normalizedOption = normalizeOption(option);
              return (
                <option key={normalizedOption.key || normalizedOption.value} value={normalizedOption.value}>
                  {normalizedOption.label}
                </option>
              );
            })}
          </optgroup>
        ))
      ) : options.map((option) => {
          const normalizedOption = normalizeOption(option);
          return (
            <option key={normalizedOption.key || normalizedOption.value} value={normalizedOption.value}>
              {normalizedOption.label}
            </option>
          );
        })}
    </select>
  );

  const renderTextarea = () => (
    <textarea
      rows={field.rows || 3}
      value={normalizedValue}
      onChange={(event) => onChange(event.target.value)}
      className={TEXTAREA_CLASS}
      placeholder={field.placeholder}
    />
  );

  const renderAutocomplete = () => (
    <EnhancedAutocomplete
      value={normalizedValue}
      onChange={onChange}
      options={listOptions}
      onInputChange={onSearch}
      placeholder={field.placeholder || 'Type to search...'}
      minChars={3}
      maxSuggestions={10}
      isLoading={isLoading}
    />
  );

  const renderInput = () => (
    <input
      type={field.type || 'text'}
      value={normalizedValue}
      onChange={(event) => onChange(event.target.value)}
      className={field.type === 'date' ? DATE_INPUT_CLASS : BASE_FIELD_CLASS}
      placeholder={field.placeholder}
    />
  );

  let control = renderInput();
  if (field.type === 'select') control = renderSelect();
  if (field.type === 'textarea') control = renderTextarea();
  if (field.type === 'autocomplete') control = renderAutocomplete();

  return (
    <div className="min-w-0">
      <label className={FIELD_LABEL_CLASS}>
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
      </label>
      {control}
      {field.type !== 'autocomplete' && <div className={FIELD_HELPER_CLASS} />}
    </div>
  );
};

const getRowGridClass = (count) => {
  switch (Math.min(Math.max(count, 1), 5)) {
    case 1:
      return 'grid grid-cols-1 gap-x-4 gap-y-3';
    case 2:
      return 'grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2';
    case 3:
      return 'grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3';
    default:
      if (count >= 5) {
        return 'grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-5';
      }
      return 'grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-4';
  }
};

const RegisterForm = ({
  layout,
  fieldDefs,
  getValue,
  getOptions,
  getListProps,
  onChange,
  actionContent,
  isLoading = false,
}) => (
  <div className="space-y-2">
    {layout.map((row, rowIndex) => {
      const isActionRow = row.length === 1 && row[0] === 'remark' && actionContent;

      return (
        <div
          key={`register-form-row-${rowIndex}`}
          className={isActionRow
            ? 'grid grid-cols-1 items-end gap-x-4 gap-y-3 md:grid-cols-[minmax(0,1fr)_auto]'
            : getRowGridClass(row.length)}
        >
          {row.map((fieldKey) => {
            const field = fieldDefs[fieldKey];
            if (!field) return null;

            return (
              <FormField
                key={fieldKey}
                field={field}
                value={getValue(fieldKey)}
                options={getOptions(fieldKey)}
                {...getListProps(fieldKey)}
                onChange={(value) => onChange(fieldKey, value)}
                isLoading={isLoading}
              />
            );
          })}
          {isActionRow && <div className="flex flex-wrap gap-2 md:pb-[1px]">{actionContent}</div>}
        </div>
      );
    })}
  </div>
);

const RegisterTable = ({
  data,
  columns,
  onEdit,
  onDelete,
  onView,
  direction = 'inward',
  loading = false,
}) => {
  const [openMenuId, setOpenMenuId] = useState(null);
  const commonKey = direction === 'inward' ? 'in_common_ref' : 'out_common_ref';
  const numberKey = direction === 'inward' ? 'inward_no' : 'outward_no';
  const typeKey = direction === 'inward' ? 'inward_type' : 'outward_type';
  const partyKey = direction === 'inward' ? 'inward_from' : 'outward_to';
  const dateKey = direction === 'inward' ? 'inward_date' : 'outward_date';

  const renderValue = (row, column) => {
    if (column.key === 'series') return <SeriesBadge type={row[typeKey]} />;
    if (column.key === typeKey) return <span className="text-slate-700">{typeLabel(row[typeKey])}</span>;
    if (column.key === 'status') {
      return <span className="inline-flex rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Active</span>;
    }
    return column.render ? column.render(row) : row[column.key];
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {[0, 1, 2, 3, 4].map((item) => (
          <div key={item} className="mb-3 h-12 animate-pulse rounded-lg bg-slate-100 last:mb-0" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
        <div className="max-h-[62vh] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="text-slate-700">
              <tr>
                {columns.map((column) => (
                  <th key={column.key} className={HEAD_CELL_CLASS}>{column.label}</th>
                ))}
                <th className={`${HEAD_CELL_CLASS} text-center`}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {data.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-12 text-center text-slate-500">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-xl">📄</div>
                      <div className="font-semibold text-slate-700">No records found</div>
                      <div className="text-xs text-slate-500">Try changing the search or filters.</div>
                    </div>
                  </td>
                </tr>
              )}

              {data.map((row) => (
                <tr key={row.id} onClick={() => onView && onView(row)} className="cursor-pointer bg-white transition-colors hover:bg-slate-50">
                  {columns.map((column) => {
                    const value = renderValue(row, column);
                    const isNumberColumn = ['in_common_ref', 'out_common_ref', 'inward_no', 'outward_no'].includes(column.key);
                    const cellClassName = `${CELL_CLASS}${isNumberColumn ? ' font-semibold text-slate-800' : ''}`;

                    return (
                      <td key={column.key} className={cellClassName}>
                        {value || '—'}
                      </td>
                    );
                  })}

                  <td className={`${CELL_CLASS} text-center`} onClick={(event) => event.stopPropagation()}>
                    <div className="relative flex justify-center">
                      <button
                        type="button"
                        onClick={() => setOpenMenuId(openMenuId === row.id ? null : row.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
                        title="Actions"
                        aria-label="Actions"
                      >
                        <MoreVertical size={16} />
                      </button>
                      {openMenuId === row.id && (
                        <div className="absolute right-0 top-9 z-20 w-36 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-left shadow-lg">
                          <button type="button" onClick={() => { onView && onView(row); setOpenMenuId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><Eye size={14} /> View</button>
                          <button type="button" onClick={() => { onEdit(row); setOpenMenuId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><Pencil size={14} /> Edit</button>
                          <button type="button" onClick={() => window.print()} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><Printer size={14} /> Print</button>
                          <button type="button" onClick={() => { onDelete(row.id); setOpenMenuId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 size={14} /> Delete</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {data.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-slate-500">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-xl">📄</div>
            <div className="font-semibold text-slate-700">No records found</div>
          </div>
        ) : data.map((row) => (
          <button key={row.id} type="button" onClick={() => onView && onView(row)} className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:bg-slate-50">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500">{row[commonKey]}</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{row[numberKey]}</div>
              </div>
              <MoreVertical size={18} className="text-slate-400" />
            </div>
            <div className="mb-2 flex items-center gap-2">
              <SeriesBadge type={row[typeKey]} />
              <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Active</span>
            </div>
            <div className="text-sm text-slate-700">{row[partyKey] || '—'}</div>
            <div className="mt-1 text-xs text-slate-500">{row[dateKey] || '—'}</div>
          </button>
        ))}
      </div>
    </>
  );
};

const getRecordValue = (record, direction, key) => {
  if (!record) return '';
  const map = direction === 'inward'
    ? {
        common: 'in_common_ref',
        number: 'inward_no',
        type: 'inward_type',
        party: 'inward_from',
        directionType: 'rec_type',
        date: 'inward_date',
      }
    : {
        common: 'out_common_ref',
        number: 'outward_no',
        type: 'outward_type',
        party: 'outward_to',
        directionType: 'send_type',
        date: 'outward_date',
      };
  return record[map[key]];
};

const InfoCard = ({ label, value, icon: Icon, accent = 'slate' }) => {
  const accents = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    orange: 'bg-orange-50 text-orange-700 border-orange-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
  };

  return (
    <div className={`rounded-2xl border p-4 ${accents[accent] || accents.slate}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</div>
          <div className="mt-1 truncate text-lg font-bold">{value || '-'}</div>
        </div>
        {Icon && <Icon size={20} className="shrink-0 opacity-70" />}
      </div>
    </div>
  );
};

const DetailPanel = ({ record, direction, onClose }) => {
  if (!record) return null;
  const extra = record.extra_data || {};
  const type = getRecordValue(record, direction, 'type');
  const details = [
    ['Reference No.', getRecordValue(record, direction, 'common')],
    ['Register No.', getRecordValue(record, direction, 'number')],
    ['File No.', extra.file_no],
    ['Series', seriesForType(type)],
    ['Type', typeLabel(type)],
    ['Place', extra.place],
    [direction === 'inward' ? 'Sender' : 'Receiver', getRecordValue(record, direction, 'party')],
    ['College', extra.college],
    ['Subject', extra.subject || record.details],
    ['Course', [extra.main_course, extra.sub_course].filter(Boolean).join(' / ')],
    ['Students', extra.students || extra.enrollment_nos],
    ['Remarks', record.remark],
    ['Created Date', record.created_at],
    ['Updated Date', record.updated_at],
  ];

  return (
    <div className="fixed inset-y-0 left-0 right-0 z-40 flex justify-end bg-slate-900/20 p-0 backdrop-blur-[1px] sm:p-4 lg:right-16 lg:p-5">
      <aside className="h-full w-full max-w-md overflow-auto border border-slate-200 bg-white shadow-2xl ring-1 ring-slate-900/5 sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-slate-500">Record Details</div>
            <div className="text-lg font-bold text-slate-900">{getRecordValue(record, direction, 'common')}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3 p-5">
          {details.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
              <div className="mt-1 break-words text-sm font-medium text-slate-800">{value || '-'}</div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
};

const RegisterSection = ({
  columns,
  createIcon: CreateIcon,
  data,
  editing,
  fieldDefs,
  filters,
  formCreateTitle,
  formEditTitle,
  getFieldListProps,
  getFieldOptions,
  getFieldValue,
  layout,
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
  typeChoices,
  direction = 'inward',
  theme = 'blue',
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const accent = theme === 'orange' ? 'orange' : 'blue';
  const activeType = getFieldValue('type');
  const activeSeries = seriesForType(activeType);

  useEffect(() => {
    if (editing) setDrawerOpen(true);
  }, [editing]);

  const todayCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const dateKey = direction === 'inward' ? 'inward_date' : 'outward_date';
    return data.filter((record) => String(record[dateKey] || '').slice(0, 10) === today).length;
  }, [data, direction]);

  const submitAndClose = async (event) => {
    await onSubmit(event);
    if (!editing) setDrawerOpen(false);
  };

  const cancelDrawer = () => {
    onCancel();
    setDrawerOpen(false);
  };

  const openNew = () => {
    onCancel();
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard label="Today's Entries" value={todayCount} icon={CalendarDays} accent={accent} />
        <InfoCard label="Total Records" value={data.length} icon={FileText} />
        <InfoCard label="Next Reference" value={nextNumber.next_common_ref} icon={Layers} accent={accent} />
        <InfoCard label="Next Register No." value={nextNumber.next_no} icon={CreateIcon} />
      </div>

      <div className={`${CARD_CLASS} overflow-hidden`}>
        <div className="border-b border-slate-200 px-4 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent === 'orange' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                <CreateIcon size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">{listTitle}</h2>
                <p className="text-sm text-slate-500">University Inward / Outward Tracking</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={openNew} className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 ${accent === 'orange' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                <Plus size={16} /> New Entry
              </button>
              <button type="button" onClick={onApplyFilters} className={SECONDARY_BUTTON_CLASS}>
                <RefreshCw size={16} /> Refresh
              </button>
              <button type="button" onClick={onExportExcel} className={SECONDARY_BUTTON_CLASS} title="Export Excel">
                <FaFileExcel size={17} color="#1D6F42" /> Export
              </button>
              <button type="button" onClick={onExportPDF} className={SECONDARY_BUTTON_CLASS} title="Export PDF">
                <FaFilePdf size={17} color="#D32F2F" />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(280px,1.8fr)_repeat(3,minmax(140px,1fr))_auto]">
            <div>
              <label className={LABEL_CLASS}>Search</label>
              <SearchField
                placeholder="Search Reference No., Register No., Sender, Receiver, College, Subject..."
                value={filters.search}
                onChange={(event) => onFiltersChange((prev) => ({ ...prev, search: event.target.value }))}
                inputClassName={SEARCH_INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Type</label>
              <select
                value={filters.type}
                onChange={(event) => onFiltersChange((prev) => ({ ...prev, type: event.target.value }))}
                className={INPUT_CLASS}
              >
                <option value="">All Types</option>
                {typeChoices.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>From Date</label>
              <input type="date" value={filters.date_from} onChange={(event) => onFiltersChange((prev) => ({ ...prev, date_from: event.target.value }))} className={INPUT_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>To Date</label>
              <input type="date" value={filters.date_to} onChange={(event) => onFiltersChange((prev) => ({ ...prev, date_to: event.target.value }))} className={INPUT_CLASS} />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => onFiltersChange({ search: '', type: '', date_from: '', date_to: '' })}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
              >
                Reset Filters
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {['Student', 'Examination', 'Fees', 'Appointment', 'General'].map((chip) => (
              <span key={chip} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-semibold text-slate-600">{chip}</span>
            ))}
          </div>

          <RegisterTable
            data={data}
            columns={columns}
            onEdit={onEdit}
            onDelete={onDelete}
            onView={setSelectedRecord}
            direction={direction}
            loading={loading}
          />
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-y-0 left-0 right-0 z-40 flex justify-end bg-slate-900/20 p-0 backdrop-blur-[1px] sm:p-4 lg:right-16 lg:p-5">
          <aside className="h-full w-full max-w-3xl overflow-auto border border-slate-200 bg-white shadow-2xl ring-1 ring-slate-900/5 transition-transform sm:rounded-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-slate-500">{editing ? formEditTitle : formCreateTitle}</div>
                <div className="text-lg font-bold text-slate-900">{activeSeries}</div>
              </div>
              <button type="button" onClick={cancelDrawer} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <InfoCard label="Reference No." value={getFieldValue('common_ref') || nextNumber.next_common_ref} icon={Layers} accent={accent} />
                <InfoCard label="Register No." value={getFieldValue('register_no') || nextNumber.next_no} icon={CreateIcon} />
              </div>

              <form onSubmit={submitAndClose} className="space-y-4">
                <RegisterForm
                  layout={layout}
                  fieldDefs={fieldDefs}
                  getValue={getFieldValue}
                  getOptions={getFieldOptions}
                  getListProps={getFieldListProps}
                  onChange={onFieldChange}
                  isLoading={loading}
                  actionContent={(
                    <>
                      <button type="button" onClick={cancelDrawer} className="reset-button">
                        Cancel
                      </button>
                      <button type="submit" disabled={loading} className="save-button">
                        {editing ? 'Update Entry' : 'Save Entry'}
                      </button>
                    </>
                  )}
                />
              </form>
            </div>
          </aside>
        </div>
      )}

      <DetailPanel record={selectedRecord} direction={direction} onClose={() => setSelectedRecord(null)} />
    </div>
  );
};

export default RegisterSection;
