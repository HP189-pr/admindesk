"""Read-only document analytics shared by dashboard and exports."""
from django.db.models import CharField, Count, DateField, F, Subquery, Value
from django.db.models.functions import Cast, ExtractYear

DOCUMENTS = {
    'degree': dict(label='Degree records', short='Degree', kind='certificate', number='dg_sr_no', student='student_name_dg', date=None, status=None),
    'provisional': dict(label='Provisional issued', short='Provisional', kind='certificate', number='prv_number', student='student_name', date='prv_date', status='prv_status'),
    'migration': dict(label='Migration issued', short='Migration', kind='certificate', number='mg_number', student='student_name', date='mg_date', status='mg_status'),
    'verification': dict(label='Verification completed', short='Verification', kind='process', number='final_no', student='student_name', date='vr_done_date', status='status'),
}


def display_value(value):
    if value is None or (isinstance(value, str) and value.strip().casefold() in {'', 'null', 'none', 'undefined', 'na', 'n/a'}):
        return 'NA'
    return value.strip() if isinstance(value, str) else value


def document_options():
    return [dict(value=key, label=spec['label'], short=spec['short'], kind=spec['kind'], date_available=bool(spec['date'])) for key, spec in DOCUMENTS.items()]


def scoped_documents(sources, enrollments):
    numbers = enrollments.exclude(enrollment_no__isnull=True).exclude(enrollment_no='').order_by().values('enrollment_no')
    return {key: (source.filter(**{field + '__in': Subquery(numbers)}), field) for key, (source, field) in sources.items()}


def document_trend(sources):
    trend = {}
    undated = {}
    for key, (source, _) in sources.items():
        field = DOCUMENTS[key]['date']
        if not field:
            undated[key] = source.count()
            continue
        undated[key] = source.filter(**{field + '__isnull': True}).count()
        for row in source.order_by().annotate(event_year=ExtractYear(field)).values('event_year').annotate(total=Count('pk')):
            if row['event_year'] is not None:
                year = row['event_year']
                trend.setdefault(year, {'year': year, **{name: 0 for name in sources}})[key] = row['total']
    return {'rows': [trend[year] for year in sorted(trend)], 'undated': undated}


def document_page(sources, page, size, export=False):
    queries = []
    for key, (source, field) in sources.items():
        spec = DOCUMENTS[key]
        queries.append(source.order_by().annotate(
            record_id=Cast('pk', CharField()), document_type=Value(key, output_field=CharField()),
            document_number=Cast(spec['number'], CharField()), student=Cast(spec['student'], CharField()),
            enrollment_number=Cast(field, CharField()),
            event_date=F(spec['date']) if spec['date'] else Value(None, output_field=DateField()),
            record_status=Cast(spec['status'], CharField()) if spec['status'] else Value('Recorded', output_field=CharField()),
        ).values('record_id', 'document_type', 'document_number', 'student', 'enrollment_number', 'event_date', 'record_status'))
    if not queries:
        return {'results': [], 'count': 0, 'page': 1, 'pages': 0, 'page_size': size}
    query = queries[0].union(*queries[1:], all=True).order_by('document_type', 'record_id') if len(queries) > 1 else queries[0].order_by('document_type', 'record_id')
    count = query.count()
    pages = (count + size - 1) // size
    page = min(page, max(pages, 1))
    rows = query if export else query[(page - 1) * size:page * size]
    results = []
    for row in rows:
        row = dict(row)
        if row['document_type'] == 'provisional' and not row['record_status']:
            row['record_status'] = 'Issued'
        results.append({key: display_value(value) for key, value in row.items()})
    return {'results': results, 'count': count, 'page': page, 'pages': pages, 'page_size': size}
