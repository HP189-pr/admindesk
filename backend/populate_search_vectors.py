"""Populate search_vector fields for all tables"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

# SQL to populate search vectors
populate_sqls = [
    # Enrollment
    """
    UPDATE enrollment
    SET search_vector = to_tsvector('english', 
        COALESCE(enrollment_no, '') || ' ' ||
        COALESCE(temp_enroll_no, '') || ' ' ||
        COALESCE(student_name, '')
    )
    WHERE search_vector IS NULL OR search_vector = ''::tsvector;
    """,
    
    # Verification
    """
    UPDATE verification
    SET search_vector = to_tsvector('english', 
        COALESCE(enrollment_no, '') || ' ' ||
        COALESCE(second_enrollment_id, '') || ' ' ||
        COALESCE(student_name, '') || ' ' ||
        COALESCE(final_no, '') || ' ' ||
        COALESCE(pay_rec_no, '')
    )
    WHERE search_vector IS NULL OR search_vector = ''::tsvector;
    """,
    
    # DocRec
    """
    UPDATE doc_rec
    SET search_vector = to_tsvector('english', 
        COALESCE(doc_rec_id, '') || ' ' ||
        COALESCE(pay_rec_no, '') || ' ' ||
        COALESCE(pay_rec_no_pre, '')
    )
    WHERE search_vector IS NULL OR search_vector = ''::tsvector;
    """,
    
    # StudentDegree
    """
    UPDATE student_degree
    SET search_vector = to_tsvector('english', 
        COALESCE(enrollment_no, '') || ' ' ||
        COALESCE(student_name_dg, '') || ' ' ||
        COALESCE(dg_sr_no, '') || ' ' ||
        COALESCE(degree_name, '') || ' ' ||
        COALESCE(institute_name_dg, '') || ' ' ||
        COALESCE(specialisation, '') || ' ' ||
        COALESCE(class_obtain, '') || ' ' ||
        COALESCE(dg_contact, '') || ' ' ||
        COALESCE(course_language, '') || ' ' ||
        COALESCE(dg_address, '') || ' ' ||
        COALESCE(dg_rec_no, '') || ' ' ||
        COALESCE(seat_last_exam, '')
    )
    WHERE search_vector IS NULL OR search_vector = ''::tsvector;
    """,
    
    # TranscriptRequest
    """
    UPDATE transcript_request
    SET search_vector = to_tsvector('english', 
        COALESCE(enrollment_no, '') || ' ' ||
        COALESCE(student_name, '') || ' ' ||
        COALESCE(CAST(tr_request_no AS TEXT), '') || ' ' ||
        COALESCE(trn_reqest_ref_no, '')
    )
    WHERE search_vector IS NULL OR search_vector = ''::tsvector;
    """,
    
    # GoogleFormSubmission
    """
    UPDATE google_form_submission
    SET search_vector = to_tsvector('english', 
        COALESCE(enrollment_no, '') || ' ' ||
        COALESCE(student_name, '') || ' ' ||
        COALESCE(rec_institute_name, '') || ' ' ||
        COALESCE(rec_official_mail, '') || ' ' ||
        COALESCE(rec_ref_id, '')
    )
    WHERE search_vector IS NULL OR search_vector = ''::tsvector;
    """,
    
    # InstVerificationMain
    """
    UPDATE inst_verification_main
    SET search_vector = to_tsvector('english', 
        COALESCE(inst_veri_number, '') || ' ' ||
        COALESCE(rec_inst_name, '') || ' ' ||
        COALESCE(inst_ref_no, '')
    )
    WHERE search_vector IS NULL OR search_vector = ''::tsvector;
    """,
]

print("=" * 60)
print("Populating search_vector fields")
print("=" * 60)

cursor = connection.cursor()

tables = ['enrollment', 'verification', 'doc_rec', 'student_degree', 
          'transcript_request', 'google_form_submission', 'inst_verification_main']

for sql, table in zip(populate_sqls, tables):
    print(f"\nPopulating {table}...", end=' ')
    cursor.execute(sql)
    rows_updated = cursor.rowcount
    print(f"✓ {rows_updated} rows updated")

print("\n" + "=" * 60)
print("Population complete!")
print("=" * 60)
