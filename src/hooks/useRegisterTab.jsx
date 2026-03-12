import { useEffect, useMemo, useState } from 'react';
import { toDateInput } from '../utils/date';
import {
  getInstituteCourses,
  getSubCoursesByMain,
  searchInstitutes,
} from '../services/inoutService';

const normalizeResults = (data) => (Array.isArray(data) ? data : (data?.results || []));

const useRegisterTab = ({
  allMainCourses,
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
  const [nextNumber, setNextNumber] = useState({ last_no: null, next_no: null });
  const [form, setForm] = useState(initialForm);
  const [extra, setExtra] = useState({});
  const [editing, setEditing] = useState(null);
  const [institutes, setInstitutes] = useState([]);
  const [instCourses, setInstCourses] = useState([]);
  const [subBranches, setSubBranches] = useState([]);
  const [loading, setLoading] = useState(false);

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
    } catch (error) {
      console.error(`Error fetching next ${modeLabel.toLowerCase()} number:`, error);
    }
  };

  useEffect(() => {
    fetchNextNumber(initialForm[typeFieldKey]);
  }, []);

  useEffect(() => {
    if (isActive) {
      loadData();
    }
  }, [isActive]);

  useEffect(() => {
    if (institutes.length === 0 || !extra.college || instCourses.length > 0) {
      return;
    }

    const match = institutes.find((item) => item.institute_name === extra.college);

    if (!match) {
      return;
    }

    getInstituteCourses(match.institute_id)
      .then((response) => setInstCourses(normalizeResults(response)))
      .catch(() => {});
  }, [extra.college, instCourses.length, institutes]);

  const applyFilters = () => loadData(filters, 'Failed to filter data');

  const fetchInstituteSearch = (value) => {
    if (!value || value.length < 2) {
      setInstitutes([]);
      return;
    }

    searchInstitutes(value)
      .then((response) => setInstitutes(normalizeResults(response)))
      .catch(() => {});
  };

  const handleCollegeChange = (value) => {
    setExtra((prev) => ({
      ...prev,
      main_course: '',
      sub_course: '',
    }));
    setInstCourses([]);
    setSubBranches([]);
    fetchInstituteSearch(value);
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
    if (fieldKey !== 'college') {
      return {};
    }

    return {
      listId,
      listOptions: institutes,
    };
  };

  const resetFormState = () => {
    setForm(initialForm);
    setExtra({});
    setEditing(null);
    setInstCourses([]);
    setSubBranches([]);
    setInstitutes([]);
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
      searchInstitutes(nextExtra.college)
        .then((response) => setInstitutes(normalizeResults(response)))
        .catch(() => {});
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