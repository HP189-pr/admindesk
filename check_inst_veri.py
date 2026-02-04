import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from api.domain_verification import InstVerificationMain, InstVerificationStudent

# Check if any students exist
students_count = InstVerificationStudent.objects.count()
main_count = InstVerificationMain.objects.count()

print(f'Total InstVerificationMain records: {main_count}')
print(f'Total InstVerificationStudent records: {students_count}')
print()

# Check the specific record
main = InstVerificationMain.objects.filter(iv_record_no=25410).first()
if main:
    print(f'Found main record: {main.inst_veri_number}, doc_rec_id={main.doc_rec_id}')
    if main.doc_rec:
        students = InstVerificationStudent.objects.filter(doc_rec_id=main.doc_rec.doc_rec_id)
        print(f'Students for this doc_rec ({main.doc_rec.doc_rec_id}): {students.count()}')
        for s in students[:5]:
            print(f'  - {s.student_name} ({s.enrollment_no_text or s.enrollment})')
    else:
        print('ERROR: No doc_rec linked to this main record!')
        print(f'  doc_rec FK value: {main.doc_rec_id}')
else:
    print('No main record found with iv_record_no=25410')
    # Try listing what we have
    all_mains = InstVerificationMain.objects.all()[:5]
    print(f'\nSample main records:')
    for m in all_mains:
        print(f'  - iv_record_no={m.iv_record_no}, inst_veri={m.inst_veri_number}, doc_rec_id={m.doc_rec_id}')

# Also check if students exist for ANY record
print(f'\n\nFirst 3 students in database:')
for s in InstVerificationStudent.objects.all()[:3]:
    print(f'  Student: {s.student_name}, doc_rec_id={s.doc_rec_id}')
