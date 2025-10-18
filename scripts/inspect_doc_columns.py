"""
Script: inspect_doc_columns.py
Purpose: Startup Django environment and print column names for specified tables using Django's connection introspection.
Usage: run with the project's manage.py environment: python scripts/inspect_doc_columns.py
"""
import os
import sys

# Add project's backend directory to sys.path (so DJANGO_SETTINGS_MODULE resolves like manage.py)
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
sys.path.insert(0, BASE_DIR)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

import django
from django.db import connection

def print_columns(table_name):
    with connection.cursor() as cursor:
        try:
            cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name=%s ORDER BY ordinal_position", [table_name])
            rows = cursor.fetchall()
            print(f"Columns for table '{table_name}':")
            if not rows:
                print("  (no columns found)")
            for r in rows:
                print(" ", r[0])
        except Exception as e:
            print(f"Error reading columns for {table_name}: {e}")


def main():
    try:
        django.setup()
    except Exception as e:
        print('Django setup failed:', e)
        return

    print_columns('doc_rec')
    print_columns('migration')
    print_columns('provisional')

if __name__ == '__main__':
    main()
