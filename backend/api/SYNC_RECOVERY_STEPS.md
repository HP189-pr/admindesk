# Google Sheets Sync - Recovery Steps

## Current Status

🔴 **Automatic sync is TEMPORARILY DISABLED** to let the Google Sheets API quota recover.

The Django server reloaded with these fixes:
1. ✅ Batch API calls (multiple cells in 1 request instead of N requests)
2. ✅ Better retry logic with exponential backoff (2s, 4s, 8s)
3. ✅ Graceful failure (drops updates instead of crashing after max retries)
4. 🔴 Signal handler disabled (temporary)

## Wait Period

**You need to wait ~1-2 minutes** for the quota to reset before re-enabling sync.

Google Sheets API quotas:
- **Write requests**: 60 per minute per user
- **Quota resets**: Every 60 seconds (rolling window)

## Re-enable Sync

After waiting 1-2 minutes, re-enable automatic sync:

### Step 1: Edit signals.py

Open: `e:\admindesk\backend\api\signals.py`

Find this code (around line 295):
```python
@receiver(post_save, sender=TranscriptRequest)
def transcript_request_post_save(sender, instance: TranscriptRequest, created, **kwargs):
    """When TranscriptRequest is saved, queue sync to Google Sheet (rate-limited)."""
    
    # TEMPORARY: Sync disabled to let quota recover
    # Remove this return statement to re-enable sync
    return  # ← DELETE THIS LINE
```

**Delete the `return` line** to re-enable sync.

### Step 2: Save and Django will auto-reload

The server will detect the change and reload automatically.

You should see in logs:
```
SheetSyncQueue initialized
SheetSyncQueue worker thread started
```

## Test the Fix

After re-enabling:

1. **Update a single record** in the app (e.g., change pdf_generate to "Yes")
2. **Check Django logs** - should see:
   ```
   Queued sync for TranscriptRequest 123
   Processing batch of 1 updates
   Synced TranscriptRequest 123
   Batch complete (1 writes in last minute)
   ```
3. **Check Google Sheet** - the update should appear within 2 seconds

## Why This Fix Works

**Before (causing quota errors)**:
```
Update 3 fields → 3 separate API calls → Hit quota after ~20 records
```

**After (quota-friendly)**:
```
Update 3 fields → 1 batched API call → Can handle ~60 records per minute
```

**Additional improvements**:
- Queue batches updates every 2 seconds
- Tracks API usage (max 50/minute with safety margin)
- Waits automatically when approaching quota
- Exponential backoff on 429 errors
- Graceful degradation (drops updates if retries fail)

## Monitor Performance

Check queue status:
```bash
python manage.py sync_transcript_queue --status
```

Expected output:
```
Queue status:
  Running: True
  Queued items: 0
  Writes in last minute: 5/50
```

## If Issues Persist

**Still seeing 429 errors?**

Lower the rate limit further by editing `sheet_sync_queue.py`:
```python
self.max_writes_per_minute = 30  # Reduce from 50 to 30
self.batch_interval = 5  # Increase from 2 to 5 seconds
```

**Manual sync alternative:**

Disable automatic sync and use manual refresh button in the UI:
1. Keep the `return` statement in signals.py
2. Users click "Refresh" button to pull from sheet (read-only, no quota issues)
3. Manually update sheet directly for critical changes

---

**Next Step**: Wait 1-2 minutes, then delete the `return` line in signals.py to re-enable sync.
