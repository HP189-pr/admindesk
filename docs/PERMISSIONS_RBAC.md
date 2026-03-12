# Authentication and RBAC

Last updated: March 12, 2026

AdminDesk uses JWT-based authentication for the React frontend and module/menu permissions for feature-level access inside the dashboard shell.

## Authentication Flow

### Main endpoints

| Endpoint | Purpose |
| --- | --- |
| `/api/backlogin/` | Primary login endpoint |
| `/api/token/refresh/` | Refresh access token |
| `/api/token/verify/` | Verify token validity |
| `/api/profile/` | Current-user profile |
| `/api/change-password/` | Self-service password change |
| `/api/users/<id>/change-password/` | Admin-triggered password change |

### Frontend flow

1. `Login.jsx` submits credentials to `/api/backlogin/`.
2. `AuthContext.jsx` stores `access_token`, `refresh_token`, and user metadata.
3. `axiosInstance.js` attaches the bearer token automatically.
4. `ProtectedRoute` blocks `/dashboard` until a user session is confirmed.
5. Logout clears tokens and returns the user to `/login`.

## Permission Sources

### Navigation and permission APIs

| Endpoint | Purpose |
| --- | --- |
| `/api/my-navigation/` | Returns the current user's navigation permissions |
| `/api/userpermissions/` | Lists or manages permission rows |
| `/api/check-admin-access/` | Confirms admin capability on the server |
| `/api/verify-admin-panel-password/` | Secondary admin-panel confirmation |

The frontend uses these responses to determine which modules should be visible and whether a wrapped module can be opened.

## Current Frontend Permission Wrappers

The dashboard shell still includes dedicated wrappers for modules that need explicit permission validation before render:

- `AuthInventory`
- `AuthDocRegister`
- `AuthFees`
- `AuthCCTV`

These wrappers follow a common pattern:

1. Confirm a token exists.
2. Fetch permission/navigation data.
3. Allow admins through.
4. Check module-level access.
5. Render the real page or an access-denied state.

## Admin Panel Access

Admin tooling has two layers:

- Role and permission checks through navigation data
- Optional password confirmation through `/api/verify-admin-panel-password/`

Current behavior:

- In development, admin-password gating can be effectively relaxed when no secret is configured.
- In stricter environments, missing admin-secret configuration is treated as a server-side setup problem.

## Dashboard Navigation Model

Permissions do not map directly to many React routes. Instead:

- The user enters the protected `/dashboard` shell.
- Sidebar choices update dashboard state.
- `WorkArea.jsx` decides which page to render.
- Permission wrappers protect high-risk modules inside that shell.

This means permission bugs often show up as a sidebar item appearing or failing to open, not as route-level 403 pages.

## Recommended Auth Checks During Changes

- Verify login still returns both access and refresh tokens.
- Confirm `AuthContext.jsx` refresh behavior still works after token expiry.
- Confirm `/api/my-navigation/` still returns the data shape expected by the sidebar and wrappers.
- Check admin-only actions with both admin and non-admin accounts.
- If a new module is added, document whether it needs a wrapper or can rely on simple sidebar visibility.

## Related Docs

- [docs/FRONTEND_GUIDE.md](./FRONTEND_GUIDE.md)
- [docs/BACKEND_API.md](./BACKEND_API.md)
- [docs/README.md](./README.md)
