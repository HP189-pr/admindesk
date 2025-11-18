import os
import uuid
import json
from django.utils import timezone
from .domain_leave_balance import compute_and_persist_leave_balances

# Simple file-backed queue for recompute tasks. Each task is a JSON object
# appended to `backend/api/.snapshot_tasks.jsonl`. This is intentionally
# lightweight — suitable for development and small workloads. A real system
# should use Redis/Celery or a DB-backed job table.

QUEUE_PATH = os.path.join(os.path.dirname(__file__), '.snapshot_tasks.jsonl')


def enqueue_recompute_task(period_id=None):
    task = {
        'id': str(uuid.uuid4()),
        'period_id': period_id,
        'status': 'pending',
        'enqueued_at': timezone.now().isoformat(),
    }
    os.makedirs(os.path.dirname(QUEUE_PATH), exist_ok=True)
    with open(QUEUE_PATH, 'a', encoding='utf-8') as f:
        f.write(json.dumps(task, default=str) + '\n')
    return task['id']


def _read_all_tasks():
    if not os.path.exists(QUEUE_PATH):
        return []
    with open(QUEUE_PATH, 'r', encoding='utf-8') as f:
        lines = [l.strip() for l in f if l.strip()]
    tasks = []
    for l in lines:
        try:
            tasks.append(json.loads(l))
        except Exception:
            continue
    return tasks


def process_queue_once():
    """Process all pending tasks once.

    Deduplicates by period_id to avoid repeated work in a single run.
    Returns list of processed task ids.
    """
    tasks = _read_all_tasks()
    pending = [t for t in tasks if t.get('status') == 'pending']
    if not pending:
        return []
    # dedupe by period_id (None allowed -> full compute)
    period_ids = []
    for t in pending:
        pid = t.get('period_id')
        if pid not in period_ids:
            period_ids.append(pid)

    processed = []
    for pid in period_ids:
        try:
            compute_and_persist_leave_balances(period_id=pid)
            processed.append(pid)
        except Exception:
            # swallow; a real worker would log and retry
            processed.append(pid)

    # mark processed tasks by rewriting file with updated status
    remaining = [t for t in tasks if t.get('status') != 'pending']
    now = timezone.now().isoformat()
    for p in pending:
        p['status'] = 'done'
        p['processed_at'] = now
        remaining.append(p)

    with open(QUEUE_PATH, 'w', encoding='utf-8') as f:
        for r in remaining:
            f.write(json.dumps(r, default=str) + '\n')

    return processed
