// src/components/FormField.jsx
import React from 'react';

const BASE_CLASS = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
const TEXTAREA_CLASS = `${BASE_CLASS} min-h-[88px] resize-y`;
const DATE_INPUT_CLASS = `${BASE_CLASS} md:w-56`;
const LABEL_CLASS = 'mb-1 block text-sm font-medium text-slate-600';

const normalizeOption = (option) => {
  if (typeof option === 'string') {
    return { value: option, label: option };
  }

  return {
    value: option.value ?? option.id ?? option.institute_name ?? '',
    label: option.label ?? option.name ?? option.institute_name ?? option.value ?? option.id ?? '',
    key: option.key ?? option.id ?? option.value ?? option.institute_id ?? option.institute_name,
  };
};

const FormField = ({
  field,
  value,
  onChange,
  options = [],
  listId,
  listOptions = [],
}) => {
  const normalizedValue = value ?? '';

  const renderSelect = () => (
    <select
      value={normalizedValue}
      onChange={(event) => onChange(event.target.value)}
      className={BASE_CLASS}
    >
      <option value="">{field.placeholder || 'Select'}</option>
      {options.map((option) => {
        const normalizedOption = normalizeOption(option);
        return (
          <option
            key={normalizedOption.key || normalizedOption.value}
            value={normalizedOption.value}
          >
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
    <>
      <input
        list={listId}
        value={normalizedValue}
        onChange={(event) => onChange(event.target.value)}
        className={BASE_CLASS}
        placeholder={field.placeholder}
      />
      {listId && (
        <datalist id={listId}>
          {listOptions.map((option) => {
            const normalizedOption = normalizeOption(option);
            return (
              <option
                key={normalizedOption.key || normalizedOption.value}
                value={normalizedOption.value}
              />
            );
          })}
        </datalist>
      )}
    </>
  );

  const renderInput = () => (
    <input
      type={field.type || 'text'}
      value={normalizedValue}
      onChange={(event) => onChange(event.target.value)}
      className={field.type === 'date' ? DATE_INPUT_CLASS : BASE_CLASS}
      placeholder={field.placeholder}
    />
  );

  let control = renderInput();

  if (field.type === 'select') {
    control = renderSelect();
  }

  if (field.type === 'textarea') {
    control = renderTextarea();
  }

  if (field.type === 'autocomplete') {
    control = renderAutocomplete();
  }

  return (
    <div className="space-y-1">
      <label className={LABEL_CLASS}>
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
      </label>
      {control}
    </div>
  );
};

export default FormField;