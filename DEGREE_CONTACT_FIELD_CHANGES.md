# Degree Module - dg_contact Field Addition

## Summary
Added a new `dg_contact` field to the Degree management system to store student contact numbers.

## Changes Made

### 1. Backend Changes

#### Database Migration
- **File**: `backend/scripts/migrate_add_dg_contact.py`
- **SQL**: `backend/scripts/add_dg_contact_column.sql`
- Added `dg_contact VARCHAR(15)` column to `student_degree` table
- Migration executed successfully ✓

#### Model Update
- **File**: `backend/api/domain_degree.py`
- Added field: `dg_contact = models.CharField(max_length=15, null=True, blank=True, db_column='dg_contact')`

#### Serializer Update
- **File**: `backend/api/serializers_degree.py`
- Added `dg_contact` to `StudentDegreeSerializer` fields list
- Field now included in API responses

#### Bulk Upload Update
- **File**: `backend/api/views_degree.py`
- Updated `bulk_upload` action to handle `dg_contact` field
- CSV processing now extracts and saves contact numbers

### 2. Frontend Changes

#### Degree Component
- **File**: `src/pages/Degree.jsx`
- Added `dg_contact` to form state in all relevant places:
  - `formData` initial state
  - `handleEdit` function
  - `resetForm` function
- Added Contact column to degrees table (10 columns total now)
- Added Contact Number input field in the add/edit modal form
- Input type: `tel` with placeholder "+91 9876543210"

#### Bulk Upload UI
- **File**: `src/pages/Degree.jsx`
- Added "📤 Bulk Upload CSV" button in the ADD panel
- Created bulk upload modal with:
  - Template download functionality
  - File upload with validation (CSV only)
  - Progress bar
  - Results display (created/updated/errors)
  - Helpful instructions

#### Service Layer
- **File**: `src/services/degreeService.js`
- Imported `bulkUploadDegrees` function (already existed)
- Function sends CSV file to `/api/degrees/bulk_upload/` endpoint

### 3. Template & Documentation

#### CSV Template
- **File**: `backend/scripts/degree_bulk_upload_template.csv`
- Created sample CSV with all fields including `dg_contact`
- Includes 3 example rows with contact numbers
- Template can be downloaded from UI

#### Column List (Complete)
```
1. dg_sr_no - Degree serial number
2. enrollment_no - Student enrollment (required)
3. student_name_dg - Student name
4. dg_address - Address
5. dg_contact - Contact number (NEW)
6. institute_name_dg - Institute name
7. degree_name - Degree name
8. specialisation - Specialisation
9. seat_last_exam - Seat number
10. last_exam_month - Exam month
11. last_exam_year - Exam year
12. class_obtain - Class obtained
13. course_language - Course language
14. dg_rec_no - Record number
15. dg_gender - Gender (Male/Female/Other)
16. convocation_no - Convocation number
```

## How to Use

### Adding Contact via UI
1. Navigate to Degree module
2. Click "➕ Add New Degree" or edit existing
3. Fill in the "Contact Number" field
4. Format: +91 9876543210 (or any phone format)
5. Save

### Bulk Upload with Contact
1. Click "📤 Bulk Upload CSV" button
2. Download template to see required format
3. Fill in CSV with data including contact numbers
4. Upload CSV file
5. View results (created/updated/errors)

## Testing

### Manual Testing Done
✓ Database migration successful
✓ Backend model updated
✓ API serializer includes new field
✓ Bulk upload endpoint processes contact field
✓ Frontend form displays contact input
✓ Table shows contact column
✓ CSV template includes contact field

### To Test
1. Create a new degree record with contact number
2. Edit existing record to add contact
3. Bulk upload CSV with contact numbers
4. Verify data is saved and displayed correctly
5. Search/filter functionality still works

## API Changes

### GET /api/degrees/
Response now includes:
```json
{
  "id": 1,
  "dg_sr_no": "DG001",
  "enrollment_no": "2023001",
  "student_name_dg": "John Doe",
  "dg_contact": "+91 9876543210",
  ...
}
```

### POST /api/degrees/
Request body can include:
```json
{
  "enrollment_no": "2023001",
  "student_name_dg": "John Doe",
  "dg_contact": "+91 9876543210",
  ...
}
```

### POST /api/degrees/bulk_upload/
CSV format (with dg_contact column):
```csv
enrollment_no,student_name_dg,dg_contact,...
2023001,John Doe,+91 9876543210,...
```

## Files Modified

### Backend
- `backend/api/domain_degree.py`
- `backend/api/serializers_degree.py`
- `backend/api/views_degree.py`

### Frontend
- `src/pages/Degree.jsx`

### Scripts
- `backend/scripts/migrate_add_dg_contact.py` (new)
- `backend/scripts/add_dg_contact_column.sql` (new)
- `backend/scripts/degree_bulk_upload_template.csv` (new)

## Database Schema Update

```sql
ALTER TABLE student_degree 
ADD COLUMN IF NOT EXISTS dg_contact VARCHAR(15);
```

Column added to existing `student_degree` table with:
- Type: VARCHAR(15)
- Nullable: Yes
- Default: NULL
- Purpose: Store student contact/phone numbers

## Notes
- Contact field is optional (can be null/blank)
- Max length: 15 characters (supports international formats)
- No validation on format (allows any phone number format)
- Existing records will have NULL for dg_contact
- Bulk upload handles missing contact gracefully
