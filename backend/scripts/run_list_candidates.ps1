Set-Location 'e:\admindesk\backend'
python manage.py shell -c "exec(open('scripts/list_seed_candidates.py').read())"
