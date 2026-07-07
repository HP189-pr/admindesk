from django.db import migrations


def _shorten_ref(value):
    if not value:
        return value

    parts = str(value).split('/')
    if len(parts) != 4 or parts[0] != 'KSV':
        return value

    tail = parts[-1]
    digit_count = 0
    for char in tail:
        if not char.isdigit():
            break
        digit_count += 1

    if digit_count <= 4:
        return value

    number = int(tail[:digit_count])
    suffix = tail[digit_count:]
    parts[-1] = f'{number:04d}{suffix}'
    return '/'.join(parts)


def _with_suffix(base_value, used_values):
    if base_value not in used_values:
        return base_value

    for index in range(26):
        candidate = f'{base_value}{chr(ord("A") + index)}'
        if candidate not in used_values:
            return candidate

    next_index = 2
    while True:
        candidate = f'{base_value}A{next_index}'
        if candidate not in used_values:
            return candidate
        next_index += 1


def _shorten_model_field(model, field_name):
    rows = list(model.objects.order_by('id').only('id', field_name))
    used_values = {getattr(row, field_name) for row in rows if getattr(row, field_name)}

    for row in rows:
        current_value = getattr(row, field_name)
        if not current_value:
            continue

        used_values.discard(current_value)
        next_value = _with_suffix(_shorten_ref(current_value), used_values)

        if next_value != current_value:
            setattr(row, field_name, next_value)
            row.save(update_fields=[field_name])

        used_values.add(next_value)


def shorten_inout_register_numbers(apps, schema_editor):
    InwardRegister = apps.get_model('api', 'InwardRegister')
    OutwardRegister = apps.get_model('api', 'OutwardRegister')

    _shorten_model_field(InwardRegister, 'in_common_ref')
    _shorten_model_field(InwardRegister, 'inward_no')
    _shorten_model_field(OutwardRegister, 'out_common_ref')
    _shorten_model_field(OutwardRegister, 'outward_no')


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0125_repair_inout_register_schema'),
    ]

    operations = [
        migrations.RunPython(shorten_inout_register_numbers, reverse_code=migrations.RunPython.noop),
    ]
