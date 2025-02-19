import { Add, Edit, Search } from "@mui/icons-material";

const menuActions = {
  Transcript: [<Add key="add" />, <Edit key="edit" />, <Search key="search" />],
  Migration: [<Add key="add" />, <Search key="search" />],
  Attendance: [<Search key="search" />],
  Payroll: [<Edit key="edit" />, <Search key="search" />],
  "Leave Management": [<Add key="add" />, <Edit key="edit" />],
  Projects: [<Search key="search" />],
  "User Management": [<Add key="add" />, <Edit key="edit" />],
  Settings: [<Edit key="edit" />]
};

export default menuActions;
