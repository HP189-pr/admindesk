-- Add dg_contact column to student_degree table
-- Run this script to add the contact field to the database

ALTER TABLE student_degree 
ADD COLUMN IF NOT EXISTS dg_contact VARCHAR(15);

-- Add comment to the column
COMMENT ON COLUMN student_degree.dg_contact IS 'Student contact number';

-- Verify the column was added
SELECT column_name, data_type, character_maximum_length 
FROM information_schema.columns 
WHERE table_name = 'student_degree' AND column_name = 'dg_contact';
