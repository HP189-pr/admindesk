// src/components/SearchField.jsx
import React from 'react';
import { FaSearch } from 'react-icons/fa';

const BASE_INPUT_CLASS = 'w-full rounded-full border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-700 shadow-sm transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100';

const SearchField = React.forwardRef(function SearchField(
  {
    className = '',
    inputClassName = '',
    placeholder = 'Search...',
    type = 'search',
    ...props
  },
  ref
) {
  return (
    <div className={`relative ${className}`.trim()}>
      <FaSearch
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-blue-500"
      />
      <input
        ref={ref}
        type={type}
        placeholder={placeholder}
        className={`${BASE_INPUT_CLASS} search-field-input ${inputClassName}`.trim()}
        {...props}
      />
    </div>
  );
});

export default SearchField;