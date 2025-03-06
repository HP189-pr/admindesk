from rest_framework_simplejwt.tokens import RefreshToken

def get_tokens_for_user(user):
    """
    Creates refresh & access tokens for custom user.
    Adds user information into the payload (claims).
    """

    refresh = RefreshToken.for_user(user)  # Pass the user to RefreshToken
    access = refresh.access_token

    # Custom payload (add these fields into JWT claims)
    for token in [refresh, access]:
        token['userid'] = user.id                     # Use `id` as primary key
        token['username'] = user.username              # Username (Login Username)
        token['name'] = user.name                      # Full name or display name
        token['usertype'] = user.usertype              # Role or user type

    return {
        'refresh': str(refresh),
        'access': str(access)
    }
