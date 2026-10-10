
# Security Baseline for Story 1.1

## Environment Configuration
- Keep real credentials in local environment files; never commit them.
- Commit `.env.example` only when it contains placeholder values, not real secrets.
- Keep environment files such as `.env`, `.env.local`, and `.env.*.local` excluded through `.gitignore`.
- Keep `.env.example` synchronized with the variables actually used by the frontend and backend.

## Frontend Security
- Treat every `NEXT_PUBLIC_*` variable as public because its value may be exposed in the browser.
- Never expose Supabase service-role keys, JWT signing secrets, database passwords, or private API keys in frontend code.
- Use the Supabase anonymous/publishable key only with appropriate database permissions and Row Level Security (RLS) policies.

## Backend and Database Security
- Store private API keys, database credentials, and any required JWT signing secrets in backend-only configuration.
- Validate uploaded files and enforce upload-size limits.
- Configure CORS to allow only the intended frontend origins in deployed environments.
- Do not log passwords, API keys, access tokens, or other sensitive credentials.

## Git and Review
- Keep dependency folders and generated build artifacts excluded from Git.
- Before committing, review `git status` and `git add --dry-run .` for unexpected files.
- Search frontend source files for service-role keys and JWT-secret references.
- If a credential is exposed, rotate or revoke it; deleting it from a file alone may not remove it from Git history.