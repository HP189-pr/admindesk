# Automatic DocRec ↔ Service Synchronization Guide

## Overview

The system now provides **fully automatic bidirectional synchronization** between `DocRec` and all service tables (Verification, Migration, Provisional, InstVerification). This means:

- ✅ **No manual scripts needed**
- ✅ **Automatic create**: Creating a DocRec auto-creates linked service record
- ✅ **Automatic update**: Updates sync between DocRec and service records
- ✅ **Automatic delete**: Deleting either DocRec or service record automatically deletes the other

## How It Works

Django signals are used to automatically sync records in the background whenever any save/delete operation occurs through:
- Admin interface
- Bulk upload
- API endpoints
- Direct ORM operations
- Any Python script

### Signal Handlers Location

File: `e:\admindesk\backend\api\signals.py`

## Automatic Behaviors

### 1. Create Operations

**When you create a DocRec:**
- If `apply_for='VR'` → Automatically creates a Verification record
- If `apply_for='IV'` → Automatically creates an InstVerificationMain record
- Migration/Provisional are NOT auto-created (require unique IDs)

**When you create a Service record:**
- If DocRec doesn't exist → Automatically creates a DocRec with minimal data
- Syncs `doc_rec_remark` and `pay_rec_no` fields

### 2. Update Operations

**When you update a Verification:**
- If it has `doc_rec_remark` → Automatically syncs to linked DocRec
- If it has `pay_rec_no` → Automatically syncs to linked DocRec

**When you update a DocRec:**
- Existing linked service records remain linked (no auto-sync of fields on update)
- Use unified API endpoints for atomic updates

### 3. Delete Operations (NEW!)

**When you delete a DocRec:**
- ✅ Automatically deletes ALL linked service records
  - All Verifications
  - All Migrations
  - All Provisionals
  - All InstVerifications

**When you delete a Verification/Migration/Provisional/InstVerification:**
- ✅ Checks if any other services reference the same DocRec
- ✅ If NO other services exist → Automatically deletes the DocRec
- ✅ If other services exist → Keeps the DocRec (prevents data loss)

## Your Use Case: Bulk Upload Sync

### Problem You Reported
After bulk uploading Verification records, the DocRec page showed verification numbers `vr_25_0934` to `vr_25_0928`, but when you opened the Verification page, you only saw up to `vr_25_0928`. When you deleted all Verification records and re-uploaded, the DocRec records remained.

### Solution Implemented
Now with automatic delete signals:

1. **Delete Verification from Admin/UI**
   - Signal automatically deletes corresponding DocRec
   - Both pages stay in sync

2. **Delete Verification via Bulk Operation**
   - Signal runs for each deleted Verification
   - Corresponding DocRec records are automatically deleted

3. **Delete DocRec from Admin/UI**
   - Signal automatically deletes all linked Verifications
   - Both pages stay in sync

## Testing the Automatic Sync

### Test 1: Create Sync
```python
# In Django shell or script
from api.models import DocRec

# Create a DocRec
doc = DocRec.objects.create(
    doc_rec_id='vr_25_9999',
    apply_for='VR',
    pay_by='ONLINE'
)

# Check Verification table - should auto-create
from api.models import Verification
vr = Verification.objects.filter(doc_rec__doc_rec_id='vr_25_9999').first()
print(vr)  # Should exist!
```

### Test 2: Delete from DocRec Side
```python
# Delete the DocRec
DocRec.objects.filter(doc_rec_id='vr_25_9999').delete()

# Check Verification table - should be auto-deleted
vr = Verification.objects.filter(doc_rec__doc_rec_id='vr_25_9999').first()
print(vr)  # Should be None
```

### Test 3: Delete from Verification Side
```python
# Create a DocRec and Verification
doc = DocRec.objects.create(doc_rec_id='vr_25_9998', apply_for='VR', pay_by='NA')
# Verification auto-created by signal

# Delete the Verification
Verification.objects.filter(doc_rec__doc_rec_id='vr_25_9998').delete()

# Check DocRec table - should be auto-deleted
doc = DocRec.objects.filter(doc_rec_id='vr_25_9998').first()
print(doc)  # Should be None
```

### Test 4: Bulk Upload then Bulk Delete
```python
# 1. Bulk upload Verifications via admin interface
# 2. Check DocRec page - should show all uploaded records
# 3. Delete all Verifications from admin
# 4. Refresh DocRec page - should all be deleted automatically
```

## Admin Interface Behavior

### Verification Admin
- **Add**: Creates Verification → Signal auto-creates DocRec if missing
- **Edit**: Updates Verification → Signal syncs remarks to DocRec
- **Delete**: Deletes Verification → Signal auto-deletes DocRec (if no other services)
- **Bulk Delete**: Deletes multiple → Signal runs for each, auto-deletes DocRecs

### DocRec Admin
- **Add**: Creates DocRec → Signal auto-creates Verification (if apply_for='VR')
- **Edit**: Updates DocRec → Linked records remain linked
- **Delete**: Deletes DocRec → Signal auto-deletes ALL linked services
- **Bulk Delete**: Deletes multiple → Signal runs for each, auto-deletes all services

## API Behavior

All API operations automatically trigger signals:

```javascript
// Frontend: Delete a verification
await api.delete(`/api/verification/${id}/`);
// Backend signal automatically deletes linked DocRec

// Frontend: Delete a DocRec
await api.delete(`/api/docrec/${id}/`);
// Backend signal automatically deletes all linked services
```

## Bulk Upload Flow

The bulk upload at `/api/bulk-upload/` now has perfect sync:

1. **Upload Excel** → Creates/updates Verification records
2. **Signals auto-create** → DocRec records created automatically
3. **Both pages show** → Same verification numbers
4. **Delete Verifications** → DocRec records auto-deleted
5. **Re-upload** → Fresh DocRec records created

## Signal Safety Features

All signals are **best-effort** and **exception-safe**:
- If a signal fails, it doesn't break the main operation
- All exceptions are caught and swallowed
- Prevents cascade failures
- Logs errors without interrupting user flow

## Edge Cases Handled

### Case 1: Multiple Services on Same DocRec
```
DocRec: vr_25_0001
├── Verification (exists)
└── Migration (exists)

Delete Verification → DocRec KEPT (Migration still references it)
Delete Migration → DocRec DELETED (no more services)
```

### Case 2: Orphaned DocRec
```
DocRec: vr_25_0002 (no services)

Signal creates Verification automatically on next DocRec save
```

### Case 3: Manual Database Edits
If you manually delete from database without Django ORM:
- Signals do NOT run
- Use Django admin or API to maintain sync

## Troubleshooting

### Problem: DocRec exists but no Verification

**Solution**: Run sync command
```powershell
cd backend
python manage.py sync_docrec_services
```

### Problem: Verification exists but no DocRec

This should never happen with signals active, but if it does:
- Signal creates DocRec automatically on next Verification save
- Or run sync command above

### Problem: Delete doesn't sync

**Check**:
1. Verify signals are registered in `api/apps.py`
2. Check Django server logs for errors
3. Ensure deletion is done through Django ORM (not raw SQL)

## Performance Considerations

Signals add minimal overhead:
- **Create**: +1 query (check existence) + 1 query (insert)
- **Update**: +1 query (fetch) + 1 query (update)
- **Delete**: +2-4 queries (check other services + delete)

For bulk operations with 100+ records:
- Signals run individually for each record
- Total time increases proportionally
- Still completes in seconds for typical uploads

## Migration from Old System

If you have existing data from before signals were added:

```powershell
# Sync all existing DocRec → Service records
cd backend
python manage.py sync_docrec_services

# Check results
python manage.py shell
>>> from api.models import DocRec, Verification
>>> DocRec.objects.filter(apply_for='VR').count()
>>> Verification.objects.count()
# Should be equal or close
```

## Summary

**You don't need to do anything special**. The system now automatically keeps DocRec and Service tables in sync for ALL operations:

✅ Create a DocRec → Auto-creates Service
✅ Create a Service → Auto-creates DocRec  
✅ Update a Service → Auto-syncs to DocRec
✅ Delete a DocRec → Auto-deletes all Services
✅ Delete a Service → Auto-deletes DocRec (if no other services)

The sync happens automatically in the background for:
- Admin interface operations
- Bulk uploads
- API calls
- Python scripts
- Any Django ORM operation

**No manual scripts needed ever again!**
