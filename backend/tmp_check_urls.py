from django.urls import get_resolver

resolver = get_resolver()
found = False
for pattern in resolver.url_patterns:
    if hasattr(pattern, "url_patterns"):
        for sub in pattern.url_patterns:
            if getattr(sub, "name", None) == "enrollment-stats":
                print("FOUND", sub.pattern)
                found = True

if not found:
    print("NOT FOUND")
