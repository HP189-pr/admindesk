export const FORM_CONFIG = {
  Gen: {
    External: [
      ['date', 'type', 'send_type', 'place'],
      ['receiver'],
      ['subject'],
      ['remark'],
    ],
    Internal: [
      ['date', 'type', 'send_type', 'place'],
      ['college'],
      ['subject'],
      ['remark'],
    ],
  },
  Exam: {
    External: [
      ['date', 'type', 'send_type', 'place'],
      ['receiver'],
      ['subject'],
      ['remark'],
    ],
    Internal: [
      ['date', 'type', 'send_type', 'place'],
      ['college', 'main_course', 'sub_course'],
      ['subject'],
      ['remark'],
    ],
  },
  Doc: {
    External: [
      ['date', 'type', 'send_type', 'place'],
      ['receiver'],
      ['subject'],
      ['remark'],
    ],
    Internal: [
      ['date', 'type', 'send_type', 'place'],
      ['college'],
      ['subject'],
      ['remark'],
    ],
  },
  Enr: {
    default: [
      ['date', 'type', 'college'],
      ['main_course', 'sub_course', 'students'],
      ['remark'],
    ],
  },
  Can: {
    default: [
      ['date', 'type', 'college'],
      ['inward_ref', 'enrollment_nos'],
      ['remark'],
    ],
  },
};

export const INWARD_FORM_CONFIG = {
  Gen: {
    External: [
      ['date', 'type', 'rec_type', 'place'],
      ['sender'],
      ['subject'],
      ['remark'],
    ],
    Internal: [
      ['date', 'type', 'rec_type', 'place'],
      ['college'],
      ['subject'],
      ['remark'],
    ],
  },
  Exam: {
    External: [
      ['date', 'type', 'rec_type', 'place'],
      ['sender'],
      ['subject'],
      ['remark'],
    ],
    Internal: [
      ['date', 'type', 'rec_type', 'place'],
      ['college', 'main_course', 'sub_course'],
      ['subject'],
      ['remark'],
    ],
  },
  Doc: {
    External: [
      ['date', 'type', 'rec_type', 'place'],
      ['sender'],
      ['subject'],
      ['remark'],
    ],
    Internal: [
      ['date', 'type', 'rec_type', 'place'],
      ['college'],
      ['subject'],
      ['remark'],
    ],
  },
  Enr: {
    default: [
      ['date', 'type', 'college'],
      ['main_course', 'sub_course', 'students'],
      ['remark'],
    ],
  },
  Can: {
    default: [
      ['date', 'type', 'college'],
      ['inward_ref', 'enrollment_nos'],
      ['remark'],
    ],
  },
};

export const FIELD_DEFS = {
  date: {
    label: 'Date',
    type: 'date',
    source: 'form',
    key: 'outward_date',
    required: true,
  },
  type: {
    label: 'Type',
    type: 'select',
    source: 'form',
    key: 'outward_type',
    optionsKey: 'typeChoices',
    placeholder: 'Select Type',
    required: true,
  },
  send_type: {
    label: 'Send Type',
    type: 'select',
    source: 'form',
    key: 'send_type',
    optionsKey: 'sendTypeChoices',
    placeholder: 'Select Send Type',
    required: true,
  },
  place: {
    label: 'Place',
    type: 'text',
    source: 'extra',
    key: 'place',
    placeholder: 'Enter place',
  },
  receiver: {
    label: 'To (Receiver)',
    type: 'text',
    source: 'extra',
    key: 'receiver',
    placeholder: 'Enter receiver name',
  },
  college: {
    label: 'College Name',
    type: 'autocomplete',
    source: 'extra',
    key: 'college',
    placeholder: 'Type to search college...',
  },
  subject: {
    label: 'Subject',
    type: 'text',
    source: 'extra',
    key: 'subject',
    placeholder: 'Enter subject',
  },
  remark: {
    label: 'Remark',
    type: 'text',
    source: 'form',
    key: 'remark',
    placeholder: 'Enter remark',
  },
  main_course: {
    label: 'Main Course',
    type: 'select',
    source: 'extra',
    key: 'main_course',
    optionsKey: 'mainCourseOptions',
    placeholder: 'Select Course',
  },
  sub_course: {
    label: 'Sub Course',
    type: 'select',
    source: 'extra',
    key: 'sub_course',
    optionsKey: 'subCourseOptions',
    placeholder: 'Select Sub Course',
  },
  students: {
    label: 'No of Students',
    type: 'number',
    source: 'extra',
    key: 'students',
    placeholder: 'Enter student count',
  },
  inward_ref: {
    label: 'Inward Ref No',
    type: 'text',
    source: 'extra',
    key: 'inward_ref',
    placeholder: 'Enter inward reference',
  },
  enrollment_nos: {
    label: 'Enrollment Nos',
    type: 'textarea',
    source: 'extra',
    key: 'enrollment_nos',
    rows: 3,
    placeholder: 'One per line',
  },
};

export const INWARD_FIELD_DEFS = {
  date: {
    label: 'Date',
    type: 'date',
    source: 'form',
    key: 'inward_date',
    required: true,
  },
  type: {
    label: 'Type',
    type: 'select',
    source: 'form',
    key: 'inward_type',
    optionsKey: 'typeChoices',
    placeholder: 'Select Type',
    required: true,
  },
  rec_type: {
    label: 'Rec Type',
    type: 'select',
    source: 'form',
    key: 'rec_type',
    optionsKey: 'recTypeChoices',
    placeholder: 'Select Rec Type',
    required: true,
  },
  place: {
    label: 'Place',
    type: 'text',
    source: 'extra',
    key: 'place',
    placeholder: 'Enter place',
  },
  sender: {
    label: 'From (Sender)',
    type: 'text',
    source: 'extra',
    key: 'sender',
    placeholder: 'Enter sender name',
  },
  college: {
    label: 'College Name',
    type: 'autocomplete',
    source: 'extra',
    key: 'college',
    placeholder: 'Type to search college...',
  },
  subject: {
    label: 'Subject',
    type: 'text',
    source: 'extra',
    key: 'subject',
    placeholder: 'Enter subject',
  },
  remark: {
    label: 'Remark',
    type: 'text',
    source: 'form',
    key: 'remark',
    placeholder: 'Enter remark',
  },
  main_course: {
    label: 'Main Course',
    type: 'select',
    source: 'extra',
    key: 'main_course',
    optionsKey: 'mainCourseOptions',
    placeholder: 'Select Course',
  },
  sub_course: {
    label: 'Sub Course',
    type: 'select',
    source: 'extra',
    key: 'sub_course',
    optionsKey: 'subCourseOptions',
    placeholder: 'Select Sub Course',
  },
  students: {
    label: 'No of Students',
    type: 'number',
    source: 'extra',
    key: 'students',
    placeholder: 'Enter student count',
  },
  inward_ref: {
    label: 'Inward Ref No',
    type: 'text',
    source: 'extra',
    key: 'inward_ref',
    placeholder: 'Enter inward reference',
  },
  enrollment_nos: {
    label: 'Enrollment Nos',
    type: 'textarea',
    source: 'extra',
    key: 'enrollment_nos',
    rows: 3,
    placeholder: 'One per line',
  },
};