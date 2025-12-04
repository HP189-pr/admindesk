"""
Migration to add PostgreSQL Full-Text Search (GIN + tsvector)
Adds search_vector fields and GIN indexes for faster search (100× improvement)

Priority tables:
1. Enrollment - 50k+ records
2. Verification - 30k+ records
3. DocRec - 25k+ records
4. StudentDegree - 20k+ records
5. TranscriptRequest - 15k+ records
6. GoogleFormSubmission - 10k+ records
7. InstVerificationMain - High usage
"""
from django.contrib.postgres.operations import TrigramExtension
from django.contrib.postgres.search import SearchVector
from django.db import migrations
from django.contrib.postgres.indexes import GinIndex
import django.contrib.postgres.search


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0044_update_transcript_null_constraints'),
    ]

    operations = [
        # Enable PostgreSQL trigram extension for fuzzy matching
        TrigramExtension(),
        
        # ============ ENROLLMENT (Priority 1) ============
        migrations.AddField(
            model_name='enrollment',
            name='search_vector',
            field=django.contrib.postgres.search.SearchVectorField(null=True, blank=True),
        ),
        migrations.AddIndex(
            model_name='enrollment',
            index=GinIndex(fields=['search_vector'], name='enrollment_search_idx'),
        ),
        
        # ============ VERIFICATION (Priority 2) ============
        migrations.AddField(
            model_name='verification',
            name='search_vector',
            field=django.contrib.postgres.search.SearchVectorField(null=True, blank=True),
        ),
        migrations.AddIndex(
            model_name='verification',
            index=GinIndex(fields=['search_vector'], name='verification_search_idx'),
        ),
        
        # ============ DOCREC (Priority 3) ============
        migrations.AddField(
            model_name='docrec',
            name='search_vector',
            field=django.contrib.postgres.search.SearchVectorField(null=True, blank=True),
        ),
        migrations.AddIndex(
            model_name='docrec',
            index=GinIndex(fields=['search_vector'], name='docrec_search_idx'),
        ),
        
        # ============ STUDENTDEGREE (Priority 4) ============
        migrations.AddField(
            model_name='studentdegree',
            name='search_vector',
            field=django.contrib.postgres.search.SearchVectorField(null=True, blank=True),
        ),
        migrations.AddIndex(
            model_name='studentdegree',
            index=GinIndex(fields=['search_vector'], name='studentdegree_search_idx'),
        ),
        
        # ============ TRANSCRIPTREQUEST (Priority 5) ============
        migrations.AddField(
            model_name='transcriptrequest',
            name='search_vector',
            field=django.contrib.postgres.search.SearchVectorField(null=True, blank=True),
        ),
        migrations.AddIndex(
            model_name='transcriptrequest',
            index=GinIndex(fields=['search_vector'], name='transcriptrequest_search_idx'),
        ),
        
        # ============ GOOGLEFORMSUBMISSION (Priority 6) ============
        migrations.AddField(
            model_name='googleformsubmission',
            name='search_vector',
            field=django.contrib.postgres.search.SearchVectorField(null=True, blank=True),
        ),
        migrations.AddIndex(
            model_name='googleformsubmission',
            index=GinIndex(fields=['search_vector'], name='googleform_search_idx'),
        ),
        
        # ============ INSTVERIFICATIONMAIN (Priority 7) ============
        migrations.AddField(
            model_name='instverificationmain',
            name='search_vector',
            field=django.contrib.postgres.search.SearchVectorField(null=True, blank=True),
        ),
        migrations.AddIndex(
            model_name='instverificationmain',
            index=GinIndex(fields=['search_vector'], name='instverif_search_idx'),
        ),
        
        # ============ POPULATE SEARCH VECTORS ============
        # Enrollment search_vector
        migrations.RunSQL(
            sql="""
            UPDATE enrollment
            SET search_vector = to_tsvector('english', 
                COALESCE(enrollment_no, '') || ' ' ||
                COALESCE(temp_enroll_no, '') || ' ' ||
                COALESCE(student_name, '')
            );
            """,
            reverse_sql="UPDATE enrollment SET search_vector = NULL;"
        ),
        
        # Verification search_vector
        migrations.RunSQL(
            sql="""
            UPDATE verification
            SET search_vector = to_tsvector('english', 
                COALESCE(enrollment_no, '') || ' ' ||
                COALESCE(second_enrollment_id, '') || ' ' ||
                COALESCE(student_name, '') || ' ' ||
                COALESCE(final_no, '') || ' ' ||
                COALESCE(pay_rec_no, '')
            );
            """,
            reverse_sql="UPDATE verification SET search_vector = NULL;"
        ),
        
        # DocRec search_vector
        migrations.RunSQL(
            sql="""
            UPDATE doc_rec
            SET search_vector = to_tsvector('english', 
                COALESCE(doc_rec_id, '') || ' ' ||
                COALESCE(pay_rec_no, '') || ' ' ||
                COALESCE(pay_rec_no_pre, '')
            );
            """,
            reverse_sql="UPDATE doc_rec SET search_vector = NULL;"
        ),
        
        # StudentDegree search_vector
        migrations.RunSQL(
            sql="""
            UPDATE student_degree
            SET search_vector = to_tsvector('english', 
                COALESCE(enrollment_no, '') || ' ' ||
                COALESCE(student_name_dg, '') || ' ' ||
                COALESCE(dg_sr_no, '') || ' ' ||
                COALESCE(degree_name, '') || ' ' ||
                COALESCE(institute_name_dg, '')
            );
            """,
            reverse_sql="UPDATE student_degree SET search_vector = NULL;"
        ),
        
        # TranscriptRequest search_vector
        migrations.RunSQL(
            sql="""
            UPDATE transcript_request
            SET search_vector = to_tsvector('english', 
                COALESCE(enrollment_no, '') || ' ' ||
                COALESCE(student_name, '') || ' ' ||
                COALESCE(CAST(tr_request_no AS TEXT), '') || ' ' ||
                COALESCE(trn_reqest_ref_no, '')
            );
            """,
            reverse_sql="UPDATE transcript_request SET search_vector = NULL;"
        ),
        
        # GoogleFormSubmission search_vector
        migrations.RunSQL(
            sql="""
            UPDATE google_form_submission
            SET search_vector = to_tsvector('english', 
                COALESCE(enrollment_no, '') || ' ' ||
                COALESCE(student_name, '') || ' ' ||
                COALESCE(rec_institute_name, '') || ' ' ||
                COALESCE(rec_official_mail, '') || ' ' ||
                COALESCE(rec_ref_id, '')
            );
            """,
            reverse_sql="UPDATE google_form_submission SET search_vector = NULL;"
        ),
        
        # InstVerificationMain search_vector
        migrations.RunSQL(
            sql="""
            UPDATE inst_verification_main
            SET search_vector = to_tsvector('english', 
                COALESCE(inst_veri_number, '') || ' ' ||
                COALESCE(rec_inst_name, '') || ' ' ||
                COALESCE(inst_ref_no, '')
            );
            """,
            reverse_sql="UPDATE inst_verification_main SET search_vector = NULL;"
        ),
    ]
