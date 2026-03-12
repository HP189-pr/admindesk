import React, { useEffect, useState } from 'react';
import { Inbox, Send } from 'lucide-react';
import PageTopbar from '../components/PageTopbar';
import RegisterSection from '../components/RegisterSection';
import {
  FIELD_DEFS,
  FORM_CONFIG,
  INWARD_FIELD_DEFS,
  INWARD_FORM_CONFIG,
} from '../config/formConfig';
import useRegisterTab from '../hooks/useRegisterTab';
import {
  addInwardRegister,
  addOutwardRegister,
  deleteInwardRegister,
  deleteOutwardRegister,
  getInwardRegister,
  getMainCourses,
  getNextInwardNumber,
  getNextOutwardNumber,
  getOutwardRegister,
  updateInwardRegister,
  updateOutwardRegister,
} from '../services/inoutService';
import {
  exportRegisterExcel,
  exportRegisterPDF,
  getRegisterDetail,
} from '../utils/registerExport';

const TYPE_CHOICES = [
  { value: 'Gen', label: 'General' },
  { value: 'Exam', label: 'Examination' },
  { value: 'Enr', label: 'Enrollment' },
  { value: 'Can', label: 'Cancellation' },
  { value: 'Doc', label: 'Document' },
];

const REC_TYPE_CHOICES = [
  { value: 'Internal', label: 'Internal' },
  { value: 'External', label: 'External' },
];

const SEND_TYPE_CHOICES = [
  { value: 'Internal', label: 'Internal' },
  { value: 'External', label: 'External' },
];

const INWARD_TYPES_WITH_REC_TYPE = ['Gen', 'Exam', 'Doc'];
const OUTWARD_TYPES_WITH_SEND_TYPE = ['Gen', 'Exam', 'Doc'];

const INWARD_EXTRA_FIELD_KEYS = [
  'place',
  'sender',
  'college',
  'subject',
  'main_course',
  'sub_course',
  'students',
  'inward_ref',
  'enrollment_nos',
];

const OUTWARD_EXTRA_FIELD_KEYS = [
  'place',
  'receiver',
  'college',
  'subject',
  'main_course',
  'sub_course',
  'students',
  'inward_ref',
  'enrollment_nos',
];

const INITIAL_INWARD_FORM = {
  inward_date: '',
  inward_type: 'Gen',
  inward_from: '',
  rec_type: 'Internal',
  details: '',
  remark: '',
};

const INITIAL_OUTWARD_FORM = {
  outward_date: '',
  outward_type: 'Gen',
  outward_to: '',
  send_type: 'Internal',
  details: '',
  remark: '',
};

const INWARD_TABLE_COLUMNS = [
  { key: 'inward_no', label: 'Inward No' },
  { key: 'inward_date', label: 'Date' },
  { key: 'inward_type', label: 'Type' },
  { key: 'inward_from', label: 'From' },
  { key: 'rec_type', label: 'Rec Type', render: (record) => record.rec_type || '' },
  { key: 'details', label: 'Details', render: (record) => getRegisterDetail(record) },
];

const OUTWARD_TABLE_COLUMNS = [
  { key: 'outward_no', label: 'Outward No' },
  { key: 'outward_date', label: 'Date' },
  { key: 'outward_type', label: 'Type' },
  { key: 'outward_to', label: 'To' },
  { key: 'send_type', label: 'Send Type', render: (record) => record.send_type || '' },
  { key: 'details', label: 'Details', render: (record) => getRegisterDetail(record) },
];

const TAB_LABELS = {
  inward: 'Inward Register',
  outward: 'Outward Register',
};

const normalizeResults = (data) => (Array.isArray(data) ? data : (data?.results || []));

const InOutRegister = () => {
  const [activeTab, setActiveTab] = useState('inward');
  const [alert, setAlert] = useState({ show: false, type: '', message: '' });
  const [allMainCourses, setAllMainCourses] = useState([]);

  const showAlert = (type, message) => {
    setAlert({ show: true, type, message });
    setTimeout(() => setAlert({ show: false, type: '', message: '' }), 4000);
  };

  useEffect(() => {
    getMainCourses()
      .then((response) => setAllMainCourses(normalizeResults(response)))
      .catch(() => {});
  }, []);

  const inward = useRegisterTab({
    allMainCourses,
    directionChoices: REC_TYPE_CHOICES,
    directionFieldKey: 'rec_type',
    directionOptionsKey: 'recTypeChoices',
    extraFieldKeys: INWARD_EXTRA_FIELD_KEYS,
    externalPartyFieldKey: 'sender',
    fieldDefs: INWARD_FIELD_DEFS,
    formConfig: INWARD_FORM_CONFIG,
    initialForm: INITIAL_INWARD_FORM,
    isActive: activeTab === 'inward',
    listId: 'inward-dynamic-colleges',
    modeLabel: 'Inward register',
    services: {
      addRegister: addInwardRegister,
      deleteRegister: deleteInwardRegister,
      getNextNumber: getNextInwardNumber,
      getRegister: getInwardRegister,
      updateRegister: updateInwardRegister,
    },
    showAlert,
    sourceFieldKey: 'inward_from',
    typeChoices: TYPE_CHOICES,
    typeFieldKey: 'inward_type',
    typesWithDirection: INWARD_TYPES_WITH_REC_TYPE,
  });

  const outward = useRegisterTab({
    allMainCourses,
    directionChoices: SEND_TYPE_CHOICES,
    directionFieldKey: 'send_type',
    directionOptionsKey: 'sendTypeChoices',
    extraFieldKeys: OUTWARD_EXTRA_FIELD_KEYS,
    externalPartyFieldKey: 'receiver',
    fieldDefs: FIELD_DEFS,
    formConfig: FORM_CONFIG,
    initialForm: INITIAL_OUTWARD_FORM,
    isActive: activeTab === 'outward',
    listId: 'outward-dynamic-colleges',
    modeLabel: 'Outward register',
    services: {
      addRegister: addOutwardRegister,
      deleteRegister: deleteOutwardRegister,
      getNextNumber: getNextOutwardNumber,
      getRegister: getOutwardRegister,
      updateRegister: updateOutwardRegister,
    },
    showAlert,
    sourceFieldKey: 'outward_to',
    typeChoices: TYPE_CHOICES,
    typeFieldKey: 'outward_type',
    typesWithDirection: OUTWARD_TYPES_WITH_SEND_TYPE,
  });

  const activeSection = activeTab === 'inward'
    ? {
        columns: INWARD_TABLE_COLUMNS,
        createIcon: Inbox,
        data: inward.data,
        editing: inward.editing,
        fieldDefs: INWARD_FIELD_DEFS,
        filters: inward.filters,
        formCreateTitle: 'Add Inward Register',
        
        formEditTitle: 'Edit Inward Register',
        formPanelClassName: 'border-sky-200 bg-sky-50/70',
        getFieldListProps: inward.getFieldListProps,
        getFieldOptions: inward.getFieldOptions,
        getFieldValue: inward.getFieldValue,
        layout: inward.layout,
        
        listTitle: 'Inward Register List',
        loading: inward.loading,
        nextNumber: inward.nextNumber,
        onApplyFilters: inward.applyFilters,
        onCancel: inward.handleCancel,
        onDelete: inward.handleDelete,
        onEdit: inward.handleEdit,
        onExportExcel: () => exportRegisterExcel({
          data: inward.data,
          dateKey: 'inward_date',
          directionKey: 'rec_type',
          directionLabel: 'Rec Type',
          extraPartyKey: 'sender',
          extraPartyLabel: 'Sender',
          filename: 'Inward_Register.xlsx',
          numberKey: 'inward_no',
          partyKey: 'inward_from',
          partyLabel: 'From',
          referenceKeys: ['inward_ref'],
          sheetName: 'Inward',
          typeKey: 'inward_type',
        }),
        onExportPDF: () => exportRegisterPDF({
          data: inward.data,
          dateKey: 'inward_date',
          filename: 'Inward_Register.pdf',
          numberKey: 'inward_no',
          partyKey: 'inward_from',
          partyLabel: 'From',
          title: 'Inward Register',
          typeKey: 'inward_type',
        }),
        onFieldChange: inward.handleFieldChange,
        onFiltersChange: inward.setFilters,
        onSubmit: inward.handleSubmit,
        searchLabel: 'Search by Sender',
        searchPlaceholder: 'Enter sender name',
        typeChoices: TYPE_CHOICES,
      }
    : {
        columns: OUTWARD_TABLE_COLUMNS,
        createIcon: Send,
        data: outward.data,
        editing: outward.editing,
        fieldDefs: FIELD_DEFS,
        filters: outward.filters,
        formCreateTitle: 'Add Outward Register',
        
        formEditTitle: 'Edit Outward Register',
        formPanelClassName: 'border-orange-200 bg-orange-50/70',
        getFieldListProps: outward.getFieldListProps,
        getFieldOptions: outward.getFieldOptions,
        getFieldValue: outward.getFieldValue,
        layout: outward.layout,
        listTitle: 'Outward Register List',
        loading: outward.loading,
        nextNumber: outward.nextNumber,
        onApplyFilters: outward.applyFilters,
        onCancel: outward.handleCancel,
        onDelete: outward.handleDelete,
        onEdit: outward.handleEdit,
        onExportExcel: () => exportRegisterExcel({
          data: outward.data,
          dateKey: 'outward_date',
          directionKey: 'send_type',
          directionLabel: 'Send Type',
          extraPartyKey: 'receiver',
          extraPartyLabel: 'Receiver Name',
          filename: 'Outward_Register.xlsx',
          numberKey: 'outward_no',
          partyKey: 'outward_to',
          partyLabel: 'To',
          referenceKeys: ['inward_ref', 'outward_ref'],
          sheetName: 'Outward',
          typeKey: 'outward_type',
        }),
        onExportPDF: () => exportRegisterPDF({
          data: outward.data,
          dateKey: 'outward_date',
          filename: 'Outward_Register.pdf',
          numberKey: 'outward_no',
          partyKey: 'outward_to',
          partyLabel: 'To',
          title: 'Outward Register',
          typeKey: 'outward_type',
        }),
        onFieldChange: outward.handleFieldChange,
        onFiltersChange: outward.setFilters,
        onSubmit: outward.handleSubmit,
        searchLabel: 'Search by Receiver',
        searchPlaceholder: 'Enter receiver name',
        typeChoices: TYPE_CHOICES,
      };

  const topbarActions = Object.values(TAB_LABELS);

  return (
    <div className="space-y-3 p-2 md:p-3">
      <PageTopbar
        title="Document Register (Inward/Outward)"
        actions={topbarActions}
        selected={TAB_LABELS[activeTab]}
        onSelect={(action) => {
          const selectedEntry = Object.entries(TAB_LABELS).find(([, label]) => label === action);

          if (selectedEntry) {
            setActiveTab(selectedEntry[0]);
          }
        }}
      />

      {alert.show && (
        <div
          className={`rounded-xl border px-4 py-3 shadow-sm ${
            alert.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {alert.message}
        </div>
      )}

      {activeSection.loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-6 text-center shadow-sm">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <RegisterSection {...activeSection} />
      )}
    </div>
  );
};

export default InOutRegister;