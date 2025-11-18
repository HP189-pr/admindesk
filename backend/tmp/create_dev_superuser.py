from django.contrib.auth import get_user_model

def ensure_superuser():
    User = get_user_model()
    username = "devadmin"
    email = "devadmin@example.com"
    password = "DevAdmin123"
    try:
        u = User.objects.filter(username=username).first()
        if u:
            print("superuser exists")
            return
        User.objects.create_superuser(username=username, email=email, password=password)
        print("superuser created")
    except Exception as e:
        print("failed:", e)

if __name__ == '__main__':
    # Setup Django environment if manage.py is used to run this script, DJANGO_SETTINGS_MODULE will be set automatically.
    ensure_superuser()
