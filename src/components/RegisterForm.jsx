import React from 'react';

import FormField from './FormField';

const getRowGridClass = (count) => {
  switch (Math.min(Math.max(count, 1), 4)) {
    case 1:
      return 'grid grid-cols-1 gap-4';
    case 2:
      return 'grid grid-cols-1 gap-4 md:grid-cols-2';
    case 3:
      return 'grid grid-cols-1 gap-4 md:grid-cols-3';
    default:
      return 'grid grid-cols-1 gap-4 md:grid-cols-4';
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
}) => {
  return (
    <div className="space-y-2">
      {layout.map((row, rowIndex) => {
        const isActionRow = row.length === 1 && row[0] === 'remark' && actionContent;

        return (
          <div
            key={`register-form-row-${rowIndex}`}
            className={isActionRow
              ? 'grid grid-cols-1 items-end gap-4 md:grid-cols-[minmax(0,1fr)_auto]'
              : getRowGridClass(row.length)}
          >
            {row.map((fieldKey) => {
              const field = fieldDefs[fieldKey];

              if (!field) {
                return null;
              }

              return (
                <FormField
                  key={fieldKey}
                  field={field}
                  value={getValue(fieldKey)}
                  options={getOptions(fieldKey)}
                  {...getListProps(fieldKey)}
                  onChange={(value) => onChange(fieldKey, value)}
                />
              );
            })}
            {isActionRow && (
              <div className="flex flex-wrap gap-2 md:pb-[1px]">
                {actionContent}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default RegisterForm;