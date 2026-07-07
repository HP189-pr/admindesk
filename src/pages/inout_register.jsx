// src/pages/inout_register.jsx
import React, { useEffect, useState } from 'react';
import { FileText, Inbox, Send } from 'lucide-react';
import PageTopbar from '../components/PageTopbar';
import RegisterSection from '../components/RegisterSection';
import {
  FIELD_DEFS,
  FORM_CONFIG,
  INWARD_FIELD_DEFS,
  INWARD_FORM_CONFIG,
} from './subpages/inoutRegisterConfig';
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
  { value: 'GEN', label: 'General', group: 'General' },
  { value: 'ENR', label: 'Enrollment', group: 'Student' },
  { value: 'CAN', label: 'Cancellation', group: 'Student' },
  { value: 'TRN', label: 'Transfer', group: 'Student' },
  { value: 'ERP', label: 'ERP Updation', group: 'Student' },
  { value: 'OTH', label: 'Other', group: 'Student' },
  { value: 'EXAM', label: 'Examination', group: 'Examination' },
  { value: 'APPT', label: 'Appointment', group: 'Appointment' },
  { value: 'FEE', label: 'Fees', group: 'Fees' },
];

const REC_TYPE_CHOICES = [
  { value: 'Internal', label: 'Internal' },
  { value: 'External', label: 'External' },
];

const SEND_TYPE_CHOICES = [
  { value: 'Internal', label: 'Internal' },
  { value: 'External', label: 'External' },
];

const INWARD_TYPES_WITH_REC_TYPE = ['GEN', 'EXAM', 'APPT', 'FEE'];
const OUTWARD_TYPES_WITH_SEND_TYPE = ['EXAM', 'APPT', 'FEE'];

const INWARD_EXTRA_FIELD_KEYS = [
  'file_no',
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
  'file_no',
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
  in_common_ref: '',
  inward_no: '',
  inward_type: 'GEN',
  inward_from: '',
  rec_type: 'Internal',
  details: '',
  remark: '',
};

const INITIAL_OUTWARD_FORM = {
  outward_date: '',
  out_common_ref: '',
  outward_no: '',
  outward_type: 'GEN',
  outward_to: '',
  send_type: 'Internal',
  details: '',
  remark: '',
};

const INWARD_TABLE_COLUMNS = [
  { key: 'in_common_ref', label: 'Reference No.' },
  { key: 'inward_no', label: 'Register No.' },
  { key: 'file_no', label: 'File No.', render: (record) => record.extra_data?.file_no || '' },
  { key: 'series', label: 'Series' },
  { key: 'inward_type', label: 'Type' },
  { key: 'inward_from', label: 'From' },
  { key: 'subject', label: 'Subject', render: (record) => record.extra_data?.subject || getRegisterDetail(record) },
  { key: 'inward_date', label: 'Date' },
  { key: 'status', label: 'Status' },
];

const OUTWARD_TABLE_COLUMNS = [
  { key: 'out_common_ref', label: 'Reference No.' },
  { key: 'outward_no', label: 'Register No.' },
  { key: 'file_no', label: 'File No.', render: (record) => record.extra_data?.file_no || '' },
  { key: 'series', label: 'Series' },
  { key: 'outward_type', label: 'Type' },
  { key: 'outward_to', label: 'To' },
  { key: 'subject', label: 'Subject', render: (record) => record.extra_data?.subject || getRegisterDetail(record) },
  { key: 'outward_date', label: 'Date' },
  { key: 'status', label: 'Status' },
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
    commonRefFieldKey: 'in_common_ref',
    registerNoFieldKey: 'inward_no',
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
    commonRefFieldKey: 'out_common_ref',
    registerNoFieldKey: 'outward_no',
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
          commonRefKey: 'in_common_ref',
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
          commonRefKey: 'in_common_ref',
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
        direction: 'inward',
        theme: 'blue',
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
          commonRefKey: 'out_common_ref',
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
          commonRefKey: 'out_common_ref',
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
        direction: 'outward',
        theme: 'orange',
      };

  return (
    <div className="space-y-3 px-4 py-2 md:px-6 md:py-3">
      <PageTopbar
        titleSlot={(
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <FileText size={20} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Document Register</h2>
                <p className="text-xs font-medium text-slate-500">University Inward / Outward Tracking</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:ml-4">
              <button
                type="button"
                onClick={() => setActiveTab('inward')}
                className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 ${
                  activeTab === 'inward'
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Inbox size={16} /> Inward Register <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{inward.data.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('outward')}
                className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 ${
                  activeTab === 'outward'
                    ? 'border-orange-600 bg-orange-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Send size={16} /> Outward Register <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{outward.data.length}</span>
              </button>
            </div>
          </div>
        )}
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

      <RegisterSection {...activeSection} />
    </div>
  );
};

export default InOutRegister;
