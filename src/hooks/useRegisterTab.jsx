// src/hooks/useRegisterTab.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { toDateInput } from '../utils/date';
import {
  getInstituteCourses,
  getSubCoursesByMain,
  searchInstitutes,
  searchExternalParties,
  searchFileNo,
  searchPlace,
} from '../services/inoutService';

const normalizeResults = (data) => (Array.isArray(data) ? data : (data?.results || []));

const normalizeLookupText = (value) => String(value || '').trim().toLowerCase();

const useRegisterTab = ({
  allMainCourses,
  commonRefFieldKey,
  directionChoices,
  directionFieldKey,
  directionOptionsKey,
  extraFieldKeys,
  externalPartyFieldKey,
  fieldDefs,
  formConfig,
  initialForm,
  isActive,
  listId,
  modeLabel,
  services,
  showAlert,
  sourceFieldKey,
  typeChoices,
  typeFieldKey,
  typesWithDirection,
}) => {
  const [data, setData] = useState([]);
  const [filters, setFilters] = useState({ search: '', type: '', date_from: '', date_to: '' });
  const [nextNumber, setNextNumber] = useState({
    last_common_ref: null,
    next_common_ref: null,
    last_no: null,
    next_no: null,
  });
  const [form, setForm] = useState(initialForm);
  const [extra, setExtra] = useState({});
  const [editing, setEditing] = useState(null);
  const [institutes, setInstitutes] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [fileNoSuggestions, setFileNoSuggestions] = useState([]);
  const [placeSuggestions, setPlaceSuggestions] = useState([]);
  const [instCourses, setInstCourses] = useState([]);
  const [subBranches, setSubBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const searchTimer = useRef({
    institute: null,
    receiver: null,
    fileNo: null,
    place: null,
  });

  const loadData = async (nextFilters = filters, errorMessage = 'Failed to load data') => {
    setLoading(true);
    try {
      const response = await services.getRegister(nextFilters);
      setData(normalizeResults(response));
    } catch (error) {
      showAlert('error', `${errorMessage}: ${error.response?.data?.detail || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchNextNumber = async (type = initialForm[typeFieldKey]) => {
    try {
      const response = await services.getNextNumber(type);
      setNextNumber(response);
      if (commonRefFieldKey && !editing) {
        setForm((prev) => {
          const currentValue = prev[commonRefFieldKey] || '';
          const previousAutoValue = nextNumber.next_common_ref || '';
          const nextAutoValue = response.next_common_ref || '';

          if (currentValue && currentValue !== previousAutoValue) {
            return prev;
          }

          return {
            ...prev,
            [commonRefFieldKey]: nextAutoValue,
          };
        });
      }
    } catch (error) {
      console.error(`Error fetching next ${modeLabel.toLowerCase()} number:`, error);
    }
  };

  useEffect(() => {
    fetchNextNumber(initialForm[typeFieldKey]);
  }, []);

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }

    const handle = setTimeout(() => {
      loadData(filters, filters.search || filters.type || filters.date_from || filters.date_to ? 'Failed to filter data' : 'Failed to load data');
    }, 250);

    return () => clearTimeout(handle);
  }, [filters, isActive]);

  useEffect(() => {
    if (institutes.length === 0 || !extra.college || instCourses.length > 0) {
      return;
    }

    const collegeValue = normalizeLookupText(extra.college);
    const match = institutes.find((item) => (
      normalizeLookupText(item.institute_name) === collegeValue ||
      normalizeLookupText(item.institute_code) === collegeValue ||
      normalizeLookupText(`${item.institute_code || ''} - ${item.institute_name || ''}`) === collegeValue
    ));

    if (!match) {
      return;
    }

    getInstituteCourses(match.institute_id)
      .then((response) => setInstCourses(normalizeResults(response)))
      .catch(() => {});
  }, [extra.college, instCourses.length, institutes]);

  const applyFilters = () => loadData(filters, 'Failed to filter data');

  const fetchInstituteSearch = (value) => {
    if (!value || value.length < 3) {
      setInstitutes([]);
      return;
    }

    searchInstitutes(value)
      .then((response) => setInstitutes(normalizeResults(response).slice(0, 10)))
      .catch(() => {});
  };

  const fetchExternalPartySearch = (value) => {
    if (!value || value.length < 3) {
      setSuggestions([]);
      return;
    }

    searchExternalParties(value)
      .then((response) => setSuggestions(Array.isArray(response) ? response.slice(0, 10) : []))
      .catch(() => {});
  };

  const fetchFileNoSearch = (value) => {
    if (!value || value.length < 2) {
      setFileNoSuggestions([]);
      return;
    }
    const registerType = modeLabel.split(' ')[0].toLowerCase();
    searchFileNo(registerType, value)
      .then((response) => setFileNoSuggestions(Array.isArray(response) ? response.slice(0, 10) : []))
      .catch(() => {});
  };

  const fetchPlaceSearch = (value) => {
    if (!value || value.length < 3) {
      setPlaceSuggestions([]);
      return;
    }
    const registerType = modeLabel.split(' ')[0].toLowerCase();
    searchPlace(registerType, value)
      .then((response) => setPlaceSuggestions(Array.isArray(response) ? response.slice(0, 10) : []))
      .catch(() => {});
  };

  const debouncedInstituteSearch = (value) => {
    if (searchTimer.current.institute) {
      clearTimeout(searchTimer.current.institute);
    }

    searchTimer.current.institute = setTimeout(() => {
      fetchInstituteSearch(value);
    }, 300);
  };

  const debouncedExternalPartySearch = (value) => {
    if (searchTimer.current.receiver) {
      clearTimeout(searchTimer.current.receiver);
    }

    searchTimer.current.receiver = setTimeout(() => {
      fetchExternalPartySearch(value);
    }, 300);
  };

  const debouncedFileNoSearch = (value) => {
    if (searchTimer.current.fileNo) {
      clearTimeout(searchTimer.current.fileNo);
    }
    searchTimer.current.fileNo = setTimeout(() => {
      fetchFileNoSearch(value);
    }, 300);
  };

  const debouncedPlaceSearch = (value) => {
    if (searchTimer.current.place) {
      clearTimeout(searchTimer.current.place);
    }
    searchTimer.current.place = setTimeout(() => {
      fetchPlaceSearch(value);
    }, 300);
  };

  const handleCollegeChange = (value) => {
    setExtra((prev) => ({
      ...prev,
      main_course: '',
      sub_course: '',
    }));
    setInstCourses([]);
    setSubBranches([]);
    debouncedInstituteSearch(value);
  };

  const handleMainCourseChange = (courseId) => {
    setExtra((prev) => ({
      ...prev,
      sub_course: '',
    }));

    if (instCourses.length === 0 && courseId) {
      getSubCoursesByMain(courseId)
        .then((response) => setSubBranches(normalizeResults(response)))
        .catch(() => {});
      return;
    }

    setSubBranches([]);
  };

  const getMainOptions = () => {
    if (instCourses.length > 0) {
      const seen = new Set();

      return instCourses
        .filter((item) => {
          const key = item.maincourse?.maincourse_id;

          if (!key || seen.has(key)) {
            return false;
          }

          seen.add(key);
          return true;
        })
        .map((item) => ({
          id: item.maincourse.maincourse_id,
          name: item.maincourse.name || item.maincourse.maincourse_id,
        }));
    }

    return allMainCourses.map((course) => ({
      id: course.maincourse_id,
      name: course.course_name || course.maincourse_id,
    }));
  };

  const getSubOptions = () => {
    if (instCourses.length > 0 && extra.main_course) {
      const seen = new Set();

      return instCourses
        .filter(
          (item) =>
            item.maincourse?.maincourse_id === extra.main_course && item.subcourse?.subcourse_id
        )
        .filter((item) => {
          const key = item.subcourse.subcourse_id;

          if (seen.has(key)) {
            return false;
          }

          seen.add(key);
          return true;
        })
        .map((item) => ({
          id: item.subcourse.subcourse_id,
          name: item.subcourse.name || item.subcourse.subcourse_id,
        }));
    }

    return subBranches.map((branch) => ({
      id: branch.subcourse_id,
      name: branch.subcourse_name || branch.subcourse_id,
    }));
  };

  const layout = useMemo(() => {
    const config = formConfig[form[typeFieldKey]];

    if (!config) {
      return [];
    }

    if (config.default) {
      return config.default;
    }

    return config[form[directionFieldKey]] || config.Internal || [];
  }, [directionFieldKey, form, formConfig, typeFieldKey]);

  const activeFieldKeys = useMemo(() => layout.flat(), [layout]);

  const buildExtraData = () => {
    const activeFields = new Set(activeFieldKeys);
    const nextExtra = {};

    extraFieldKeys.forEach((key) => {
      const value = extra[key];

      if (!activeFields.has(key)) {
        return;
      }

      if (value === undefined || value === null || `${value}`.trim() === '') {
        return;
      }

      nextExtra[key] = value;
    });

    return Object.keys(nextExtra).length > 0 ? nextExtra : null;
  };

  const getFieldValue = (fieldKey) => {
    const field = fieldDefs[fieldKey];

    if (!field) {
      return '';
    }

    if (fieldKey === 'date') {
      return toDateInput(form[field.key]);
    }

    return field.source === 'form' ? (form[field.key] ?? '') : (extra[field.key] ?? '');
  };

  const getFieldOptions = (fieldKey) => {
    const field = fieldDefs[fieldKey];

    if (!field?.optionsKey) {
      return [];
    }

    const optionMap = {
      typeChoices,
      [directionOptionsKey]: directionChoices,
      mainCourseOptions: getMainOptions(),
      subCourseOptions: getSubOptions(),
    };

    return optionMap[field.optionsKey] || [];
  };

  const getFieldListProps = (fieldKey) => {
    if (fieldKey === 'college') {
      return {
        listId,
        listOptions: institutes,
      };
    }

    if (fieldKey === externalPartyFieldKey) {
      return {
        listId: `${listId}-receiver`,
        listOptions: suggestions.map((item) => ({ value: item })),
      };
    }

    if (fieldKey === 'file_no') {
      return {
        listId: `${listId}-file-no`,
        listOptions: fileNoSuggestions.map((item) => ({ value: item })),
      };
    }

    if (fieldKey === 'place') {
      return {
        listId: `${listId}-place`,
        listOptions: placeSuggestions.map((item) => ({ value: item })),
      };
    }

    return {};
  };

  const resetFormState = () => {
    setForm(initialForm);
    setExtra({});
    setEditing(null);
    setInstCourses([]);
    setSubBranches([]);
    setInstitutes([]);
    setSuggestions([]);
    setFileNoSuggestions([]);
    setPlaceSuggestions([]);
  };

  const handleTypeChange = (value) => {
    setForm((prev) => ({
      ...prev,
      [typeFieldKey]: value,
      [sourceFieldKey]: '',
      details: '',
    }));
    setExtra({});
    setInstCourses([]);
    setSubBranches([]);
    setInstitutes([]);
    setSuggestions([]);
    setFileNoSuggestions([]);
    setPlaceSuggestions([]);

    if (!editing) {
      fetchNextNumber(value);
    }
  };

  const handleDirectionChange = (value) => {
    setForm((prev) => ({
      ...prev,
      [directionFieldKey]: value,
      [sourceFieldKey]: value === 'External' ? (extra[externalPartyFieldKey] || '') : (extra.college || ''),
    }));
    setSuggestions([]);
  };

  const handleFieldChange = (fieldKey, value) => {
    const field = fieldDefs[fieldKey];

    if (!field) {
      return;
    }

    if (fieldKey === 'type') {
      handleTypeChange(value);
      return;
    }

    if (fieldKey === directionFieldKey) {
      handleDirectionChange(value);
      return;
    }

    if (field.source === 'form') {
      setForm((prev) => ({
        ...prev,
        [field.key]: value,
      }));
    }

    if (field.source === 'extra') {
      setExtra((prev) => ({
        ...prev,
        [field.key]: value,
      }));
    }

    if (fieldKey === 'college') {
      handleCollegeChange(value);
      setForm((prev) => ({ ...prev, [sourceFieldKey]: value }));
    }

    if (fieldKey === 'main_course') {
      handleMainCourseChange(value);
    }

    if (fieldKey === externalPartyFieldKey) {
      setForm((prev) => ({ ...prev, [sourceFieldKey]: value }));
      debouncedExternalPartySearch(value);
    }

    if (fieldKey === 'file_no') {
      debouncedFileNoSearch(value);
    }

    if (fieldKey === 'place') {
      debouncedPlaceSearch(value);
    }

    if (fieldKey === 'subject') {
      setForm((prev) => ({ ...prev, details: value }));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const isExternal =
      typesWithDirection.includes(form[typeFieldKey]) && form[directionFieldKey] === 'External';
    const sourceValue = isExternal
      ? (extra[externalPartyFieldKey] || form[sourceFieldKey] || '').trim()
      : (extra.college || form[sourceFieldKey] || '').trim();

    if (!form[fieldDefs.date.key] || !form[typeFieldKey] || !sourceValue) {
      showAlert('error', 'Please fill all required fields');
      return;
    }

    setLoading(true);

    const payload = {
      ...form,
      [sourceFieldKey]: sourceValue,
      details: activeFieldKeys.includes('subject')
        ? (extra.subject || form.details || '').trim()
        : form.details,
      [directionFieldKey]: typesWithDirection.includes(form[typeFieldKey]) ? form[directionFieldKey] : '',
      extra_data: buildExtraData(),
    };

    try {
      if (editing) {
        await services.updateRegister(editing.id, payload);
        showAlert('success', `${modeLabel} updated successfully`);
      } else {
        await services.addRegister(payload);
        showAlert('success', `${modeLabel} added successfully`);
      }

      resetFormState();
      fetchNextNumber(initialForm[typeFieldKey]);
      loadData();
    } catch (error) {
      showAlert(
        'error',
        error.response?.data?.detail || error.response?.data?.[typeFieldKey]?.[0] || 'Operation failed'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (record) => {
    setEditing(record);

    const resolvedDirection = record[directionFieldKey] || 'Internal';
    const nextExtra = { ...(record.extra_data || {}) };

    if (!nextExtra.subject && record.details) {
      nextExtra.subject = record.details;
    }

    if (!nextExtra.inward_ref && nextExtra.outward_ref) {
      nextExtra.inward_ref = nextExtra.outward_ref;
    }

    if (typesWithDirection.includes(record[typeFieldKey]) && resolvedDirection === 'External') {
      nextExtra[externalPartyFieldKey] = nextExtra[externalPartyFieldKey] || record[sourceFieldKey] || '';
    } else {
      nextExtra.college = nextExtra.college || record[sourceFieldKey] || '';
    }

    setForm({
      ...(commonRefFieldKey ? { [commonRefFieldKey]: record[commonRefFieldKey] || '' } : {}),
      [fieldDefs.date.key]: record[fieldDefs.date.key],
      [typeFieldKey]: record[typeFieldKey],
      [sourceFieldKey]: record[sourceFieldKey],
      [directionFieldKey]: resolvedDirection,
      details: record.details || '',
      remark: record.remark || '',
    });
    setExtra(nextExtra);
    setInstCourses([]);
    setSubBranches([]);

    if (nextExtra.college) {
      fetchInstituteSearch(nextExtra.college);
    }

    if (nextExtra[externalPartyFieldKey]) {
      fetchExternalPartySearch(nextExtra[externalPartyFieldKey]);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(`Delete this ${modeLabel.toLowerCase()} entry?`)) {
      return;
    }

    setLoading(true);

    try {
      await services.deleteRegister(id);
      showAlert('success', `${modeLabel} deleted successfully`);
      loadData();
    } catch (error) {
      showAlert('error', error.response?.data?.detail || 'Delete failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    resetFormState();
  };

  return {
    applyFilters,
    columns: [],
    data,
    editing,
    filters,
    getFieldListProps,
    getFieldOptions,
    getFieldValue,
    handleCancel,
    handleDelete,
    handleEdit,
    handleFieldChange,
    handleSubmit,
    layout,
    loading,
    nextNumber,
    setFilters,
  };
};

export default useRegisterTab;
