"""
Queue-based batch system for Google Sheets sync with rate limiting.

This module prevents Google Sheets API quota exhaustion by:
1. Queuing sync requests instead of immediate writes
2. Batching multiple updates into single API calls
3. Rate limiting to stay under 60 writes/minute quota
"""
import logging
import time
from threading import Thread, Lock
from queue import Queue, Empty
from typing import Dict, Any
from collections import defaultdict

logger = logging.getLogger(__name__)


class SheetSyncQueue:
    """Thread-safe queue for batching Google Sheets sync operations."""
    
    # Class-level singleton
    _instance = None
    _lock = Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self._initialized = True
        self.queue = Queue()
        self.batch_interval = 2  # Batch every 2 seconds
        self.max_writes_per_minute = 50  # Stay under 60 quota (safety margin)
        self.write_timestamps = []  # Track write times for rate limiting
        self.worker_thread = None
        self.running = False
        
        logger.info("SheetSyncQueue initialized")
    
    def start_worker(self):
        """Start the background worker thread."""
        if self.running:
            return
        
        self.running = True
        self.worker_thread = Thread(target=self._worker, daemon=True)
        self.worker_thread.start()
        logger.info("SheetSyncQueue worker thread started")
    
    def stop_worker(self):
        """Stop the background worker thread."""
        self.running = False
        if self.worker_thread:
            self.worker_thread.join(timeout=5)
        logger.info("SheetSyncQueue worker thread stopped")
    
    def enqueue(self, instance_id: int, changed_fields: Dict[str, Any]):
        """Add a sync request to the queue."""
        self.queue.put({
            'instance_id': instance_id,
            'changed_fields': changed_fields,
            'timestamp': time.time()
        })
        logger.debug(f"Queued sync for TranscriptRequest {instance_id}")
        
        # Start worker if not running
        if not self.running:
            self.start_worker()
    
    def _can_write(self) -> bool:
        """Check if we can write without exceeding rate limit."""
        now = time.time()
        # Remove timestamps older than 1 minute
        self.write_timestamps = [ts for ts in self.write_timestamps if now - ts < 60]
        return len(self.write_timestamps) < self.max_writes_per_minute
    
    def _wait_for_quota(self):
        """Wait until we have quota available."""
        while not self._can_write():
            # Wait for oldest write to age out
            if self.write_timestamps:
                oldest = self.write_timestamps[0]
                wait_time = 60 - (time.time() - oldest) + 0.1
                if wait_time > 0:
                    logger.info(f"Rate limit reached, waiting {wait_time:.1f}s")
                    time.sleep(wait_time)
            else:
                break
    
    def _worker(self):
        """Background worker that processes the queue in batches."""
        from .domain_transcript_generate import TranscriptRequest
        from .sheets_sync import sync_transcript_request_to_sheet
        
        logger.info("Worker thread processing started")
        
        while self.running:
            batch = defaultdict(dict)  # instance_id -> merged changed_fields
            batch_deadline = time.time() + self.batch_interval
            
            # Collect items for this batch
            while time.time() < batch_deadline:
                try:
                    timeout = batch_deadline - time.time()
                    if timeout <= 0:
                        break
                    
                    item = self.queue.get(timeout=timeout)
                    instance_id = item['instance_id']
                    
                    # Merge fields for same instance (latest wins)
                    batch[instance_id].update(item['changed_fields'])
                    
                except Empty:
                    break
            
            # Process batch if we have items
            if batch:
                logger.info(f"Processing batch of {len(batch)} updates")
                
                for instance_id, changed_fields in batch.items():
                    try:
                        # Wait for quota if needed
                        self._wait_for_quota()
                        
                        # Get fresh instance from DB
                        instance = TranscriptRequest.objects.filter(id=instance_id).first()
                        if not instance:
                            logger.warning(f"TranscriptRequest {instance_id} not found")
                            continue
                        
                        # Sync to sheet
                        sync_transcript_request_to_sheet(instance, changed_fields)
                        
                        # Record write time
                        self.write_timestamps.append(time.time())
                        
                        logger.debug(f"Synced TranscriptRequest {instance_id}")
                        
                    except Exception as e:
                        logger.warning(f"Failed to sync TranscriptRequest {instance_id}: {e}")
                
                logger.info(f"Batch complete ({len(self.write_timestamps)} writes in last minute)")
            
            # Small sleep to prevent CPU spinning
            time.sleep(0.1)
        
        logger.info("Worker thread processing stopped")


# Global queue instance
_sync_queue = SheetSyncQueue()


def queue_sheet_sync(instance_id: int, changed_fields: Dict[str, Any]):
    """
    Queue a sheet sync operation for later processing.
    
    Args:
        instance_id: TranscriptRequest primary key
        changed_fields: Dictionary of fields that changed
    """
    _sync_queue.enqueue(instance_id, changed_fields)


def start_sync_worker():
    """Start the background sync worker thread."""
    _sync_queue.start_worker()


def stop_sync_worker():
    """Stop the background sync worker thread."""
    _sync_queue.stop_worker()
