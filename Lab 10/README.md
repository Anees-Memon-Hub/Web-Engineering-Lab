# Alumni Management System (Express + EJS + MySQL)

Session-authenticated alumni system: sign up / log in / log out, directory with search,
CRUD on your own record, photo + resume upload, PDF export.

## Run
1. `npm install`
2. Create the tables: run `database.sql` in phpMyAdmin (select your database first).
3. Copy `.env.example` to `.env` and fill in your database details and a long random `SESSION_SECRET`.
4. `npm start`, then open http://localhost:3000 (you will be sent to the login page).

## How sessions work here
| Concept | Where |
|---|---|
| `express-session` stores the login on the **server**; the browser only keeps a random session id in a cookie | `app.js`, `session({...})` |
| Cookie hardening: custom name `alumni.sid`, `httpOnly`, `sameSite: "lax"`, `secure` in production, 2-hour `maxAge` | `app.js`, `cookie: {...}` |
| `resave: false`, `saveUninitialized: false`: no cookie is given to visitors who have not logged in | `app.js` |
| New session id on every login/signup (`regenerate`) to stop session fixation, then `save` before redirecting | `loginUser()` |
| Logout is a **POST** that destroys the session on the server and clears the cookie | `endSession()` |
| **Login gate**: a middleware placed after the public routes, so every route below it needs `req.session.user` | `LOGIN GATE` in `app.js` |
| Uploaded photos and resumes are served only after the gate | `app.use("/uploads", ...)` |
| Ownership check (`requireOwner`): you can edit/delete only your own record | `app.js` |
| Flash message: stored in the session, shown once, then deleted | `req.session.flash` |

## Routes
| Route | Needs login? | What |
|---|---|---|
| `GET/POST /register` (alias `/signup`) | no | create account (password 8+ chars + confirm), signs you in |
| `GET/POST /login` | no | sign in |
| `POST /logout` | no | sign out |
| `GET /` | yes | dashboard with live counts |
| `GET /alumni?q=` | yes | directory + search |
| `GET /view/:id` | yes | one alumnus's profile |
| `GET /profile` | yes | redirects to your own `/view/:id` |
| `GET/POST /edit/:id` | yes, owner only | update your record |
| `POST /delete/:id` | yes, owner only | delete your record + files, then end the session |
| `GET /pdf/:id`, `GET /pdf?q=` | yes | PDF profile / PDF directory |
| `GET /uploads/...` | yes | uploaded photos and resumes |

## Settings (`.env`)
- `SESSION_SECRET` - long random text used to sign the session cookie. Required when `NODE_ENV=production`.
- `SESSION_MINUTES` - session lifetime in minutes (default 120). Set `1` to demonstrate expiry.
- `DB_POOL_LIMIT` - database connections (default 1, free hosts allow very few).

## Limits (honest notes)
- Sessions live in memory (`MemoryStore`): restarting the server logs everyone out. A real deployment needs a persistent store.
- No CSRF tokens or login rate limiting yet; `sameSite: "lax"` and POST-only logout give partial protection.
- PDFs use Helvetica, so non-Latin names (e.g. Urdu script) will not display in them.

## Troubleshooting
**"max_user_connections" / `ER_TOO_MANY_USER_CONNECTIONS` / `ECONNRESET`**: free MySQL hosts (freedb.tech) allow only a few
connections per user. Close every other running server (`taskkill /F /IM node.exe` in PowerShell), wait a minute, run `npm start` again.
The terminal should print `Database connection OK`.

## Lab 10 — Send Emails via SMTP using Nodemailer

The existing AlumniConnect application now includes a **Contact** page for signed-in alumni.
Submitting the form sends an email to the configured administration address using Nodemailer
and Gmail SMTP. The logged-in user's registered email is set as `replyTo`; the application
does not allow visitors to spoof the SMTP sender address.

### Install and configure
1. From the project folder, run `npm install`.
2. Copy `.env.example` to `.env` if you have not already done so.
3. In Google Account settings, enable 2-Step Verification and create a Google App Password.
4. Set these values in `.env`:
   - `SMTP_HOST=smtp.gmail.com`
   - `SMTP_PORT=465`
   - `SMTP_SECURE=true`
   - `SMTP_USER=your Gmail address`
   - `SMTP_PASS=your 16-character Google App Password` (not your normal Gmail password)
   - `CONTACT_TO=the email address that should receive contact messages`
5. Restart the app with `npm start`, sign in, and open **Contact** in the navigation bar.
6. Submit a test message and check the inbox configured in `CONTACT_TO`.

### Lab 10 implementation
| Item | Location |
|---|---|
| Nodemailer dependency | `package.json` |
| SMTP transporter | `app.js` |
| Contact form | `views/contact.ejs` |
| Navigation link | `views/partials/header.ejs` |
| Send email handler | `POST /contact` in `app.js` |
| SMTP settings | `.env` (not committed) |

### Important
- Keep `.env` private. Never upload SMTP credentials or App Passwords to GitHub or include them in screenshots.
- The `from` address is the configured SMTP account. The logged-in user's address is used as `replyTo`.
- Email delivery cannot be verified until valid SMTP credentials and a recipient address are configured.
- If Gmail rejects authentication, generate a new App Password and check that 2-Step Verification is enabled.
