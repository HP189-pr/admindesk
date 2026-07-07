# Generated to repair deployed in/out register tables that predate 0124.

from django.db import migrations


REPAIR_SQL = """
ALTER TABLE inward_register ADD COLUMN IF NOT EXISTS in_common_ref varchar(30);
ALTER TABLE outward_register ADD COLUMN IF NOT EXISTS out_common_ref varchar(30);
ALTER TABLE inward_register ADD COLUMN IF NOT EXISTS extra_data jsonb;
ALTER TABLE outward_register ADD COLUMN IF NOT EXISTS extra_data jsonb;

ALTER TABLE inward_register ALTER COLUMN inward_no TYPE varchar(30);
ALTER TABLE outward_register ALTER COLUMN outward_no TYPE varchar(30);

UPDATE inward_register
SET inward_type = CASE inward_type
    WHEN 'Gen' THEN 'GEN'
    WHEN 'Exam' THEN 'EXAM'
    WHEN 'Enr' THEN 'ENR'
    WHEN 'Can' THEN 'CAN'
    WHEN 'Doc' THEN 'GEN'
    ELSE inward_type
END;

UPDATE outward_register
SET outward_type = CASE outward_type
    WHEN 'Gen' THEN 'GEN'
    WHEN 'Exam' THEN 'EXAM'
    WHEN 'Enr' THEN 'ENR'
    WHEN 'Can' THEN 'CAN'
    WHEN 'Doc' THEN 'GEN'
    ELSE outward_type
END;

UPDATE inward_register
SET in_common_ref = CONCAT(
    'KSV/',
    EXTRACT(YEAR FROM COALESCE(inward_date, CURRENT_DATE))::int,
    '/',
    UPPER(COALESCE(NULLIF(inward_type, ''), 'GEN')),
    '/',
    LPAD(id::text, 4, '0')
)
WHERE in_common_ref IS NULL OR in_common_ref = '';

UPDATE outward_register
SET out_common_ref = CONCAT(
    'KSV/',
    EXTRACT(YEAR FROM COALESCE(outward_date, CURRENT_DATE))::int,
    '/',
    UPPER(COALESCE(NULLIF(outward_type, ''), 'GEN')),
    '/',
    LPAD(id::text, 4, '0')
)
WHERE out_common_ref IS NULL OR out_common_ref = '';

ALTER TABLE inward_register ALTER COLUMN in_common_ref SET NOT NULL;
ALTER TABLE outward_register ALTER COLUMN out_common_ref SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS inward_register_in_common_ref_repair_uniq
    ON inward_register (in_common_ref);
CREATE UNIQUE INDEX IF NOT EXISTS outward_register_out_common_ref_repair_uniq
    ON outward_register (out_common_ref);
CREATE INDEX IF NOT EXISTS inward_register_in_common_ref_repair_idx
    ON inward_register (in_common_ref);
CREATE INDEX IF NOT EXISTS outward_register_out_common_ref_repair_idx
    ON outward_register (out_common_ref);
"""


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0124_inwardregister_outwardregister'),
    ]

    operations = [
        migrations.RunSQL(REPAIR_SQL, reverse_sql=migrations.RunSQL.noop),
    ]
