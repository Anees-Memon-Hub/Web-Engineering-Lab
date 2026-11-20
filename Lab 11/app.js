require("dotenv").config();

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const http = require("http");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const nodemailer = require("nodemailer");
const { Server } = require("socket.io");
const pool = require("./db");
const { renderProfilePdf, renderListPdf } = require("./pdf");
const setupChat = require("./chat");

const SESSION_MINUTES = Number(process.env.SESSION_MINUTES) || 120;
const isProduction = process.env.NODE_ENV === "production";
const SESSION_COOKIE = "alumni.sid";

if (!process.env.SESSION_SECRET) {
    if (isProduction) throw new Error("Set SESSION_SECRET before running in production.");
    console.warn("WARNING: SESSION_SECRET is not set in .env. Using an insecure development secret.");
}

const app = express();
// Lab 11: Socket.IO needs a plain HTTP server that Express and Socket.IO share.
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// Lab 10: SMTP email configuration (credentials are read from .env).
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const SMTP_SECURE = process.env.SMTP_SECURE !== "false";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const CONTACT_TO = process.env.CONTACT_TO || SMTP_USER;

const mailTransporter = SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: { user: SMTP_USER, pass: SMTP_PASS }
    })
    : null;
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
const DOCUMENT_DIR = path.join(UPLOAD_DIR, "documents");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DOCUMENT_DIR, { recursive: true });

/* ---------- App setup ---------- */
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
if (isProduction) app.set("trust proxy", 1);   // needed for "secure" cookies behind a proxy/HTTPS host

// Only the stylesheet is public. It sits BEFORE the session middleware so a
// CSS request never touches the session. Uploads are served later, after login.
app.use("/css", express.static(path.join(__dirname, "public", "css")));
app.use("/js", express.static(path.join(__dirname, "public", "js")));   // Lab 11: chat client script
app.use(express.urlencoded({ extended: false }));   // reads normal form fields into req.body

const sessionMiddleware = session({
    name: SESSION_COOKIE,                       // custom cookie name (not the default "connect.sid")
    secret: process.env.SESSION_SECRET || "dev-only-secret-change-me",
    resave: false,                              // do not re-save a session nobody changed
    saveUninitialized: false,                   // no cookie until we actually store something
    cookie: {
        httpOnly: true,                         // JavaScript in the page cannot read the cookie
        sameSite: "lax",                        // not sent on cross-site POSTs (helps against CSRF)
        secure: isProduction,                   // HTTPS-only in production
        maxAge: SESSION_MINUTES * 60 * 1000     // session expires after 2 hours by default
    }
});
app.use(sessionMiddleware);   // Lab 11: the same middleware is shared with Socket.IO (see chat.js)

// Values every EJS template can use: the logged-in user, and a one-time "flash" message
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.flash = null;

    // Show the flash once, then delete it. Skip file-like requests (favicon.ico etc.)
    // so a browser's background request cannot swallow the message.
    if (req.session.flash && !path.extname(req.path)) {
        res.locals.flash = req.session.flash;
        delete req.session.flash;
    }
    next();
});

/* ---------- Small helpers ---------- */
function showMessage(res, status, title, message) {
    return res.status(status).render("message", { title, message });
}

function parseId(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
}

// Edit and delete are limited to the record's owner: you may change your own
// profile, but not somebody else's. (The login gate below already guarantees
// there is a session by the time this runs.)
function requireOwner(req, res, next) {
    const id = parseId(req.params.id);
    if (!id) return showMessage(res, 400, "Invalid request", "That alumni ID is not valid.");
    if (req.session.user.id !== id) {
        return showMessage(res, 403, "Not allowed", "You can only edit or delete your own record.");
    }
    req.alumniId = id;
    next();
}

// express-session uses callbacks; these wrappers let us use async/await instead.
const regenerateSession = (req) => new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
const saveSession = (req) => new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
const destroySession = (req) => new Promise((resolve, reject) => req.session.destroy((e) => (e ? reject(e) : resolve())));

// Start a logged-in session for this account.
async function loginUser(req, account, flash) {
    await regenerateSession(req);                 // brand-new session id: stops session fixation
    req.session.user = { id: account.id, name: account.full_name };
    if (flash) req.session.flash = flash;
    await saveSession(req);                       // make sure it is stored BEFORE we redirect
}

// End the session on the server and remove the cookie from the browser.
async function endSession(req, res) {
    const userId = req.session.user && req.session.user.id;
    await destroySession(req);
    if (userId) io.in(`user:${userId}`).disconnectSockets(true);   // Lab 11: close their chat connections
    res.clearCookie(SESSION_COOKIE);
    res.redirect("/login");
}

/* ---------- File uploads (photo + resume) ---------- */
const ALLOWED_IMAGE_EXT = /\.(jpe?g|png)$/i;     // PDFKit can embed JPG/PNG only
const ALLOWED_DOCUMENT_EXT = /\.(pdf|docx?)$/i;

const storage = multer.diskStorage({
    destination(req, file, cb) {
        cb(null, file.fieldname === "resume" ? DOCUMENT_DIR : UPLOAD_DIR);
    },
    filename(req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${file.fieldname}_${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 },   // 2 MB per file
    fileFilter(req, file, cb) {
        if (file.fieldname === "profile_photo" && !ALLOWED_IMAGE_EXT.test(file.originalname)) {
            return cb(new Error("Profile photo must be a JPG, JPEG, or PNG image."));
        }
        if (file.fieldname === "resume" && !ALLOWED_DOCUMENT_EXT.test(file.originalname)) {
            return cb(new Error("Resume must be PDF, DOC, or DOCX."));
        }
        cb(null, true);
    }
}).fields([
    { name: "profile_photo", maxCount: 1 },
    { name: "resume", maxCount: 1 }
]);

// Wrap multer so an upload problem becomes req.uploadError instead of an
// exception; each route then re-shows its form with a friendly message.
function uploadFields(req, res, next) {
    upload(req, res, (err) => {
        if (err) req.uploadError = err;
        next();
    });
}

function uploadMessage(err) {
    if (err.code === "LIMIT_FILE_SIZE") return "Each file must be smaller than 2MB.";
    return err.message || "File upload failed. Please try again.";
}

// Check the photo's real bytes (magic numbers), not just its extension.
function isRealJpgOrPng(filePath) {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const isPng = buf.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    return isJpg || isPng;
}

function removeFile(filename, isDocument = false) {
    if (!filename) return;
    const dir = isDocument ? DOCUMENT_DIR : UPLOAD_DIR;
    fs.unlink(path.join(dir, path.basename(filename)), () => {});   // ignore "already gone"
}

// Delete files saved by this request (used when the request then fails).
function cleanupUploads(req) {
    const photo = req.files?.profile_photo?.[0];
    const resume = req.files?.resume?.[0];
    if (photo) fs.unlink(photo.path, () => {});
    if (resume) fs.unlink(resume.path, () => {});
}

/* ---------- Form handling shared by Register and Edit ---------- */
const TEXT_FIELDS = [
    "full_name", "email", "phone", "gender", "date_of_birth", "student_id",
    "degree", "degree_level", "department", "graduation_year", "cgpa",
    "current_job", "company", "employment_status", "contact_preference",
    "linkedin", "bio", "city", "country", "address"
];

const REQUIRED_FIELDS = [
    "full_name", "email", "phone", "gender", "date_of_birth", "student_id",
    "degree", "department", "graduation_year", "city", "country"
];

// The one place that lists which columns a profile form writes.
// INSERT and UPDATE are both built from it, so they can never drift apart.
const PROFILE_COLUMNS = [...TEXT_FIELDS, "skills", "newsletter"];

// Never SELECT * into a template: it would drag the password hash along.
const PUBLIC_COLUMNS = `id, full_name, email, phone, degree, degree_level, department,
    graduation_year, cgpa, current_job, company, employment_status, skills,
    contact_preference, linkedin, bio, city, country, profile_photo, resume, created_at`;
const PRIVATE_COLUMNS = "gender, date_of_birth, student_id, address, newsletter";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readForm(body) {
    const data = {};
    for (const field of TEXT_FIELDS) data[field] = String(body[field] ?? "").trim();
    data.email = data.email.toLowerCase();

    // Checkboxes sharing a name arrive as undefined, a string, or an array.
    const skills = body.skills ?? "";
    data.skills = Array.isArray(skills) ? skills.join(", ") : String(skills);
    data.newsletter = body.newsletter ? 1 : 0;
    return data;
}

function validateForm(data) {
    if (REQUIRED_FIELDS.some((f) => !data[f])) return "Please fill all required fields.";
    if (!EMAIL_PATTERN.test(data.email)) return "Invalid email address.";
    if (data.cgpa && !(Number(data.cgpa) >= 0 && Number(data.cgpa) <= 4)) {
        return "CGPA must be a number between 0 and 4.";
    }
    return null;
}

// Empty text becomes NULL in the database; 0 (unticked newsletter) stays 0.
const columnValues = (data) => PROFILE_COLUMNS.map((c) => (data[c] === "" ? null : data[c]));

function formModel(mode, extra = {}) {
    const base = mode === "edit"
        ? { mode, title: "Edit Profile", submitLabel: "Save Changes" }
        : { mode, title: "Alumni Registration", submitLabel: "Register as Alumni", action: "/register" };
    return { error: null, values: {}, current: null, ...base, ...extra };
}

// Shared by the directory page and the PDF list so both honour the search box.
async function findAlumni(q, columns) {
    let sql = `SELECT ${columns} FROM alumni`;
    const params = [];
    if (q) {
        sql += " WHERE full_name LIKE ? OR email LIKE ? OR department LIKE ? OR company LIKE ? OR city LIKE ?";
        const like = `%${q}%`;
        params.push(like, like, like, like, like);
    }
    sql += " ORDER BY id DESC";
    const [rows] = await pool.query(sql, params);
    return rows;
}

/* ---------- PDF helper ---------- */
// Build the whole PDF in memory first. If drawing fails, nothing has been sent
// yet, so the error handler can still answer with a normal error page.
function buildPdf(options, draw) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", bufferPages: true, ...options });
        const chunks = [];
        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
        try {
            draw(doc);
            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

function sendPdf(res, buffer, filename) {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.send(buffer);
}

/* ---------- Public: sign up (register) ---------- */
app.get("/register", (req, res) => {
    if (req.session.user) return res.redirect("/");   // already signed in
    res.render("form", formModel("register"));
});

// The lab README calls account creation "signup"; here it is the same page as /register
app.get("/signup", (req, res) => res.redirect("/register"));

app.post("/register", uploadFields, async (req, res) => {
    const values = req.body || {};
    const fail = (message) => {
        cleanupUploads(req);
        return res.status(400).render("form", formModel("register", { error: message, values }));
    };

    if (req.uploadError) return fail(uploadMessage(req.uploadError));

    const data = readForm(values);
    const password = values.password || "";

    const problem = validateForm(data) ||
        (!password ? "Please fill all required fields." : null) ||
        (password.length < 8 ? "Password must be at least 8 characters." : null) ||
        (password !== (values.confirm_password || "") ? "Passwords do not match." : null) ||
        (!values.terms_accepted ? "You must accept the Terms & Conditions to register." : null);
    if (problem) return fail(problem);

    const photo = req.files?.profile_photo?.[0] || null;
    const resume = req.files?.resume?.[0] || null;
    if (photo && !isRealJpgOrPng(photo.path)) {
        return fail("Profile photo must be a genuine JPG, JPEG, or PNG image.");
    }

    const [existing] = await pool.query("SELECT id FROM alumni WHERE email = ?", [data.email]);
    if (existing.length > 0) return fail("This email address is already registered.");

    let newId;
    try {
        const passwordHash = await bcrypt.hash(password, 12);
        const columns = [...PROFILE_COLUMNS, "profile_photo", "resume", "terms_accepted", "password"];

        const [result] = await pool.execute(
            `INSERT INTO alumni (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
            [...columnValues(data), photo ? photo.filename : null, resume ? resume.filename : null, 1, passwordHash]
        );
        newId = result.insertId;
    } catch (error) {
        cleanupUploads(req);
        if (error.code === "ER_DUP_ENTRY") return fail("This email address is already registered.");
        throw error;
    }

    // Send welcome email after registration
    try {
        await mailTransporter.sendMail({
            from: `"AlumniConnect" <${SMTP_USER}>`,
            to: data.email,
            subject: "Welcome to AlumniConnect",

            text: `Hello ${data.full_name},

    Your AlumniConnect account has been created successfully.

    Welcome to our alumni community!`
        });

    } catch (error) {
        console.error("Registration email failed:", error.message);
    }

    // A new account is signed in straight away (new session id, saved before redirecting)
    await loginUser(req, { id: newId, full_name: data.full_name },
        "Welcome! Your account was created and you are signed in.");
    res.redirect("/");
});

/* ---------- Public: login and logout ---------- */
app.get("/login", (req, res) => {
    if (req.session.user) return res.redirect("/");   // already signed in
    res.render("login", { error: null, email: "" });
});

app.post("/login", async (req, res) => {
    const email = (req.body.email || "").trim().toLowerCase();
    const password = req.body.password || "";

    if (!email || !password) {
        return res.status(400).render("login", { error: "Email and password are required.", email });
    }

    const [rows] = await pool.query("SELECT id, full_name, password FROM alumni WHERE email = ? LIMIT 1", [email]);
    const account = rows[0];

    // Same message for "no such email" and "wrong password" so we don't reveal which emails exist
    const valid = account && (await bcrypt.compare(password, account.password));
    if (!valid) {
        return res.status(401).render("login", { error: "Invalid email or password.", email });
    }

    await loginUser(req, account);
    res.redirect("/");
});

// Logout is a POST (a form button), not a link: a link can be triggered by
// another site or a browser prefetch, a POST form cannot be done by accident.
app.post("/logout", endSession);

/* ---------- LOGIN GATE: everything below this line needs a signed-in session ---------- */
app.use((req, res, next) => {
    if (req.session.user) return next();
    res.redirect("/login");
});

/* ---------- Lab 10: Contact Administration by email (Nodemailer + SMTP) ---------- */
app.get("/contact", (req, res) => {
    res.render("contact", {
        title: "Contact Administration",
        active: "contact",
        error: null,
        values: { subject: "", message: "" }
    });
});

app.post("/contact", async (req, res) => {
    const subject = String(req.body.subject || "").trim();
    const message = String(req.body.message || "").trim();

    const renderError = (error) => res.status(400).render("contact", {
        title: "Contact Administration",
        active: "contact",
        error,
        values: { subject, message }
    });

    if (!subject || !message) return renderError("Please enter both a subject and a message.");
    if (subject.length > 150) return renderError("Subject must be 150 characters or fewer.");
    if (message.length > 5000) return renderError("Message must be 5,000 characters or fewer.");

    if (!mailTransporter || !CONTACT_TO) {
        return renderError("Email is not configured yet. Add SMTP_USER, SMTP_PASS and CONTACT_TO to your .env file.");
    }

    const senderName = String(req.session.user.name || "Alumni member").replace(/[\r\n]/g, " ");
    const senderEmail = await pool.query(
        "SELECT email FROM alumni WHERE id = ? LIMIT 1", [req.session.user.id]
    ).then(([rows]) => rows[0]?.email);

    if (!senderEmail) return renderError("Your account email could not be found. Please sign in again.");

    try {
        await mailTransporter.sendMail({
            from: `"AlumniConnect" <${SMTP_USER}>`,
            to: CONTACT_TO,
            replyTo: { name: senderName, address: senderEmail },
            subject: `[AlumniConnect] ${subject}`,
            text: `Message from: ${senderName} <${senderEmail}>\n\n${message}`,
            html: `<h2>New AlumniConnect message</h2><p><strong>From:</strong> ${escapeHtml(senderName)} (${escapeHtml(senderEmail)})</p><p><strong>Subject:</strong> ${escapeHtml(subject)}</p><hr><p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`
        });

        req.session.flash = "Your message has been sent to the administration successfully.";
        res.redirect("/contact");
    } catch (error) {
        console.error("Lab 10 email delivery failed:", error.code || error.message);
        renderError("The email could not be sent. Please check the SMTP settings and try again.");
    }
});

// Escape user-provided content before placing it in the HTML email body.
function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
}

/* ---------- Lab 11: Chat page (the live part runs over Socket.IO, see chat.js) ---------- */
app.get("/chat", (req, res) => {
    res.render("chat", { title: "Alumni Chat", active: "chat" });
});

// Uploaded photos and resumes are personal data, so they are only served to signed-in users
app.use("/uploads", express.static(UPLOAD_DIR));

/* ---------- Dashboard ---------- */
app.get("/", async (req, res) => {
    // Two queries, one after the other. Running many in parallel would open many
    // connections at once, which free MySQL hosts do not allow.
    const [[stats]] = await pool.query(`
        SELECT
            (SELECT COUNT(*) FROM alumni) AS alumni,
            (SELECT COUNT(*) FROM events) AS events,
            (SELECT COUNT(*) FROM jobs) AS jobs,
            (SELECT COUNT(*) FROM alumni WHERE created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')) AS newThisMonth
    `);
    const [recent] = await pool.query(
        "SELECT id, full_name, graduation_year, department FROM alumni ORDER BY id DESC LIMIT 5"
    );

    res.render("index", { stats, recent });
});

/* ---------- Read: directory (with search) ---------- */
app.get("/alumni", async (req, res) => {
    const q = (req.query.q || "").trim();
    const rows = await findAlumni(q, `id, full_name, email, phone, student_id, degree, department,
        graduation_year, cgpa, current_job, company, city, country, profile_photo, resume, created_at`);
    res.render("alumni", { alumni: rows, q });
});

/* ---------- Read: one profile ---------- */
app.get("/view/:id", async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return showMessage(res, 400, "Invalid request", "That alumni ID is not valid.");

    const [rows] = await pool.execute(`SELECT ${PUBLIC_COLUMNS} FROM alumni WHERE id = ?`, [id]);
    if (rows.length === 0) return showMessage(res, 404, "Not found", "No alumnus with that ID exists.");

    const isOwner = req.session.user.id === id;
    res.render("view", { alumnus: rows[0], isOwner });
});

// "Profile" in the navbar is simply your own /view page.
app.get("/profile", (req, res) => {
    res.redirect(`/view/${req.session.user.id}`);
});

/* ---------- Update: edit your own profile ---------- */
app.get("/edit/:id", requireOwner, async (req, res) => {
    const [rows] = await pool.execute(
        `SELECT ${PUBLIC_COLUMNS}, ${PRIVATE_COLUMNS} FROM alumni WHERE id = ?`, [req.alumniId]
    );
    if (rows.length === 0) return endSession(req, res);

    res.render("form", formModel("edit", {
        action: `/edit/${req.alumniId}`,
        values: rows[0],
        current: rows[0]
    }));
});

app.post("/edit/:id", requireOwner, uploadFields, async (req, res) => {
    const id = req.alumniId;
    const [rows] = await pool.execute(
        `SELECT ${PUBLIC_COLUMNS}, ${PRIVATE_COLUMNS} FROM alumni WHERE id = ?`, [id]
    );
    if (rows.length === 0) {
        cleanupUploads(req);
        return endSession(req, res);
    }
    const old = rows[0];

    const values = req.body || {};
    const fail = (message) => {
        cleanupUploads(req);
        return res.status(400).render("form", formModel("edit", {
            action: `/edit/${id}`, error: message, values, current: old
        }));
    };

    if (req.uploadError) return fail(uploadMessage(req.uploadError));

    const data = readForm(values);
    const problem = validateForm(data);
    if (problem) return fail(problem);

    const newPhoto = req.files?.profile_photo?.[0] || null;
    const newResume = req.files?.resume?.[0] || null;
    if (newPhoto && !isRealJpgOrPng(newPhoto.path)) {
        return fail("Profile photo must be a genuine JPG, JPEG, or PNG image.");
    }

    try {
        await pool.execute(
            `UPDATE alumni SET ${[...PROFILE_COLUMNS, "profile_photo", "resume"].map((c) => `${c} = ?`).join(", ")}
             WHERE id = ?`,
            [
                ...columnValues(data),
                newPhoto ? newPhoto.filename : old.profile_photo,   // keep the old file unless replaced
                newResume ? newResume.filename : old.resume,
                id
            ]
        );
    } catch (error) {
        cleanupUploads(req);
        if (error.code === "ER_DUP_ENTRY") return fail("This email address is already used by another alumnus.");
        throw error;
    }

    // Delete the replaced files only after the database update succeeded
    if (newPhoto) removeFile(old.profile_photo);
    if (newResume) removeFile(old.resume, true);

    req.session.user.name = data.full_name;   // keep the navbar greeting current
    req.session.flash = "Profile updated.";   // shown once on the next page, then removed
    res.redirect(`/view/${id}`);
});

/* ---------- Delete: remove your own record ---------- */
app.post("/delete/:id", requireOwner, async (req, res) => {
    const id = req.alumniId;
    const [rows] = await pool.execute("SELECT profile_photo, resume FROM alumni WHERE id = ?", [id]);
    if (rows.length === 0) return showMessage(res, 404, "Not found", "No alumnus with that ID exists.");

    await pool.execute("DELETE FROM alumni WHERE id = ?", [id]);
    removeFile(rows[0].profile_photo);
    removeFile(rows[0].resume, true);

    // The account no longer exists, so end the session too
    await endSession(req, res);
});

/* ---------- PDF export ---------- */
app.get("/pdf/:id", async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return showMessage(res, 400, "Invalid request", "That alumni ID is not valid.");

    const [rows] = await pool.execute(`SELECT ${PUBLIC_COLUMNS} FROM alumni WHERE id = ?`, [id]);
    if (rows.length === 0) return showMessage(res, 404, "Not found", "No alumnus with that ID exists.");
    const alumnus = rows[0];

    const pdf = await buildPdf(
        { margin: 45, info: { Title: `Alumni Profile - ${alumnus.full_name}` } },
        (doc) => renderProfilePdf(doc, alumnus, UPLOAD_DIR)
    );
    sendPdf(res, pdf, `alumni-${alumnus.id}.pdf`);
});

app.get("/pdf", async (req, res) => {
    const q = (req.query.q || "").trim();
    const rows = await findAlumni(q, "id, full_name, email, department, graduation_year, employment_status");

    const pdf = await buildPdf(
        { margin: 40, info: { Title: "Alumni Directory" } },
        (doc) => renderListPdf(doc, rows, q)
    );
    sendPdf(res, pdf, "alumni-directory.pdf");
});

/* ---------- 404 and error handling ---------- */
app.use((req, res) => {
    showMessage(res, 404, "Page not found", "That page does not exist.");
});

app.use((err, req, res, next) => {
    console.error(err);
    const busy = ["ER_TOO_MANY_USER_CONNECTIONS", "ER_USER_LIMIT_REACHED", "ECONNRESET", "PROTOCOL_CONNECTION_LOST"];
    if (busy.includes(err.code)) {
        return showMessage(res, 503, "Database is busy",
            "The database has too many open connections. Close any other running copies of this app (and other labs' servers), wait a minute, then refresh.");
    }
    showMessage(res, 500, "Something went wrong", "The server hit an unexpected problem. Check the terminal for details.");
});

setupChat(io, sessionMiddleware, pool);   // Lab 11

server.listen(PORT, () => {
    console.log(`Alumni system running at http://localhost:${PORT}`);
    pool.query("SELECT 1")
        .then(() => console.log("Database connection OK"))
        .catch((err) => console.error("Database connection FAILED:", err.code || err.message));
});
