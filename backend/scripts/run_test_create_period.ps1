Set-Location 'e:\admindesk\backend'
python manage.py shell -c "exec(open('scripts/test_create_period.py').read())"
