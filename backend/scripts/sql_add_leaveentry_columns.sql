-- SQL to add new columns to legacy table api_leaveentry
-- Run this in your Postgres database (psql) connected to the admindesk DB.

ALTER TABLE api_leaveentry
    ADD COLUMN IF NOT EXISTS report_date date;

ALTER TABLE api_leaveentry
    ADD COLUMN IF NOT EXISTS leave_remark character varying(100);

ALTER TABLE api_leaveentry
    ADD COLUMN IF NOT EXISTS emp_name character varying(100);

-- Optionally, you can restrict status to the allowed set via a CHECK constraint.
-- Be cautious: adding a CHECK may fail if existing rows have other values.
-- Example (uncomment to enable after ensuring data is clean):
-- ALTER TABLE api_leaveentry
--     ADD CONSTRAINT leaveentry_status_check CHECK (status IN ('Approved','Pending','Cancel'));

-- Always backup your DB before running ALTER statements.
