from django.db import connection
print('running fix_updated_at')
with connection.cursor() as c:
    c.execute("UPDATE receipt SET updated_at = now() WHERE updated_at IS NULL;")
    c.execute("ALTER TABLE receipt ALTER COLUMN updated_at SET DEFAULT now();")
    # keep column nullable if desired, or enforce NOT NULL
    # c.execute("ALTER TABLE receipt ALTER COLUMN updated_at SET NOT NULL;")
print('done')
