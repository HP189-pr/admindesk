# Transcript Request Sync Pattern

## Overview

The transcript request system now uses the **same sync pattern** as the official mail request system.

## How It Works

### ✅ Sync Happens in ViewSet.update() Method

**Both systems use identical pattern:**

```python
def update(self, request, *args, **kwargs):
    # 1. Capture original values
    instance = self.get_object()
    original_status = instance.mail_status
    original_remark = instance.transcript_remark  # or instance.remark
    original_pdf_generate = instance.pdf_generate  # transcript only
    original_tr_request_no = instance.tr_request_no  # transcript only
    
    # 2. Update via serializer
    serializer.is_valid(raise_exception=True)
    self.perform_update(serializer)
    
    # 3. Check what changed
    instance.refresh_from_db()
    changed = {}
    if instance.field != original_field:
        changed["field"] = instance.field
    
    # 4. Sync to Google Sheet if anything changed
    if changed:
        sync_to_sheet(instance, changed)
```

### ✅ No Signal-Based Sync

Both systems **do NOT use** post_save signals for sync:
- ❌ `signals_transcript.py` - Signal disabled (commented out)
- ❌ Background queue workers - Not used
- ✅ Direct sync in `update()` method only

### ✅ When Sync Happens

**Official Mail Requests:**
- User updates `mail_status` → syncs to sheet
- User updates `remark` → syncs to sheet

**Transcript Requests:**
- User updates `tr_request_no` → syncs to sheet
- User updates `mail_status` → syncs to sheet
- User updates `transcript_remark` → syncs to sheet
- User updates `pdf_generate` → syncs to sheet

### ✅ When Sync Does NOT Happen

- ❌ Sheet imports (`sync-from-sheet` API)
- ❌ Bulk operations in admin
- ❌ Model.save() calls outside ViewSet
- ❌ Django shell operations
- ❌ Background jobs

## File Structure

### Official Mail Request (Reference)

```
domain_mail_request.py          → GoogleFormSubmission model
serializers_mail_request.py     → GoogleFormSubmissionSerializer
views_mail_request.py           → GoogleFormSubmissionViewSet
  └── update()                  → Syncs to sheet
sheets_sync.py                  
  └── sync_mail_submission_to_sheet()
```

### Transcript Request (Matching Pattern)

```
domain_transcript_generate.py   → TranscriptRequest model
serializers_transcript_generate.py → TranscriptRequestSerializer
view_transcript_generate.py     → TranscriptRequestViewSet
  └── update()                  → Syncs to sheet ✅
sheets_sync.py
  └── sync_transcript_request_to_sheet()
signals_transcript.py           → Signal DISABLED ✅
```

## Benefits

✅ **Predictable** - Sync only on user actions via API  
✅ **No quota issues** - Controlled sync prevents API limits  
✅ **Consistent** - Both systems work identically  
✅ **Simple** - No background workers or complex queues  
✅ **Debuggable** - Sync happens in request/response cycle  

## Batch Operations

Both systems handle bulk updates:

```python
@action(detail=False, methods=['post'], url_path='bulk-status')
def bulk_status(self, request):
    for item in items:
        item.mail_status = new_status
        item.save(update_fields=['mail_status'])
        sync_to_sheet(item, {'mail_status': item.mail_status})
```

Each item syncs individually - this is intentional to maintain consistency.

## Rate Limiting

The `_apply_updates()` function in `sheets_sync.py` handles rate limits:

- ✅ Batch multiple field updates into 1 API call
- ✅ Retry with exponential backoff (2s, 4s, 8s)
- ✅ Gracefully drop update after 3 failed retries
- ✅ Log warnings but don't crash

## Testing Sync

**Test single record update:**
1. Open transcript request in UI
2. Change `pdf_generate` to "Yes"
3. Click Save
4. Check Google Sheet - should update within 1-2 seconds

**Test bulk update:**
1. Select multiple records
2. Change status to "Sent"
3. Each record syncs individually
4. Takes ~1 second per record (API call each)

---

**Last Updated:** December 3, 2025  
**Status:** ✅ Production Ready - Matches Official Mail Pattern
