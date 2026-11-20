# Alumni Management System — CRUD, Uploads, PDF & Session Authentication

## Requirements
- Node.js 18+ recommended
- MySQL or MariaDB (XAMPP is fine)

## Setup
1. Start MySQL in XAMPP.
2. Open phpMyAdmin and import `database.sql`. This creates `alumni_db`, the `users` table for login accounts, and the `alumni` table.
3. Check the MySQL settings near the top of `app.js` (`host`, `user`, `password`, `database`) and adjust them for your machine.
4. In this project folder run:
   ```bash
   npm install
   npm start
   ```
5. Open `http://localhost:3000/signup`, create an account, and you will be redirected to the protected dashboard. Existing users can sign in at `/login`.

## Authentication features
- Signup and login forms
- Passwords hashed with bcryptjs (never stored as plain text)
- Express session cookie with `httpOnly`, `sameSite`, and a two-hour lifetime
- Session regeneration after successful login/signup
- Logout destroys the session
- Dashboard, alumni CRUD, uploads and PDF routes require login

## Important configuration
Before deployment, set a long random `SESSION_SECRET` environment variable. For example in PowerShell:
```powershell
$env:SESSION_SECRET = "replace-with-a-long-random-secret"
npm start
```
For production, use HTTPS and a persistent session store (the default Express MemoryStore is for local development only). Add CSRF protection, rate limiting, account verification and role-based authorization before exposing the app publicly. Signup currently creates a user who can access the whole alumni admin dashboard; restrict account creation or add roles if only trusted administrators should use it.

## Routes
- `GET/POST /signup` — create account
- `GET/POST /login` — sign in
- `POST /logout` — sign out
- `GET /` — protected dashboard
- `/register`, `/view/:id`, `/edit/:id`, `/delete/:id` — protected alumni CRUD
- `/pdf` and `/pdf/:id` — protected PDF exports
