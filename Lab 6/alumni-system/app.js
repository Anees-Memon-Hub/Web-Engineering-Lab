const express = require("express");
const path = require("path");
const session = require("express-session");
const dotenv = require("dotenv");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const db = require("./db");

dotenv.config();

const app = express();
const PORT = 3000;

// ===============================
// EJS CONFIGURATION
// ===============================

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ===============================
// MIDDLEWARE
// ===============================

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

app.use(
    session({
        secret: process.env.SESSION_SECRET || "alumni-secret",
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24
        }
    })
);

// ===============================
// MULTER CONFIGURATION
// ===============================

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, "public", "uploads"));
    },

    filename: function (req, file, cb) {
        const uniqueName =
            Date.now() +
            "-" +
            Math.round(Math.random() * 1E9) +
            path.extname(file.originalname);

        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,

    limits: {
        fileSize: 2 * 1024 * 1024
    },

    fileFilter: function (req, file, cb) {

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only JPG, PNG and WEBP images are allowed."));
        }
    }
});

// ===============================
// HOME / REGISTER PAGE
// ===============================

app.get("/", (req, res) => {
    res.render("register");
});

// ===============================
// DATABASE TEST
// ===============================

app.get("/test", async (req, res) => {

    try {

        await db.query("SELECT 1");

        res.send(`
            <h1>Alumni Management System</h1>
            <p>Node.js + Express is working.</p>
            <p>MySQL database connection is working.</p>
        `);

    } catch (error) {

        console.error(error);

        res.status(500).send(
            "Database connection failed: " + error.message
        );
    }
});

// ===============================
// REGISTER ALUMNI
// ===============================

app.post(
    "/register",
    upload.single("profile_photo"),

    async (req, res) => {

        try {

            const {
                full_name,
                email,
                phone,
                gender,
                date_of_birth,
                student_id,
                degree,
                department,
                graduation_year,
                current_job,
                company,
                city,
                country,
                address,
                password,
                confirm_password,
                linkedin_url,
                skills
            } = req.body;

            // ---------------------------
            // Required fields
            // ---------------------------

            if (
                !full_name ||
                !email ||
                !phone ||
                !gender ||
                !date_of_birth ||
                !student_id ||
                !degree ||
                !department ||
                !graduation_year ||
                !city ||
                !country ||
                !password
            ) {

                return res.send(`
                    <h2>Error</h2>
                    <p>Please fill in all required fields.</p>
                    <a href="/">Go Back</a>
                `);
            }

            // ---------------------------
            // Email validation
            // ---------------------------

            const emailPattern =
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (!emailPattern.test(email)) {

                return res.send(`
                    <h2>Error</h2>
                    <p>Please enter a valid email address.</p>
                    <a href="/">Go Back</a>
                `);
            }

            // ---------------------------
            // Password validation
            // ---------------------------

            if (password.length < 6) {

                return res.send(`
                    <h2>Error</h2>
                    <p>Password must contain at least 6 characters.</p>
                    <a href="/">Go Back</a>
                `);
            }

            if (password !== confirm_password) {

                return res.send(`
                    <h2>Error</h2>
                    <p>Passwords do not match.</p>
                    <a href="/">Go Back</a>
                `);
            }

            // ---------------------------
            // Graduation year
            // ---------------------------

            if (
                graduation_year < 1950 ||
                graduation_year > 2100
            ) {

                return res.send(`
                    <h2>Error</h2>
                    <p>Please enter a valid graduation year.</p>
                    <a href="/">Go Back</a>
                `);
            }

            // ---------------------------
            // LinkedIn validation
            // ---------------------------

            if (linkedin_url) {

                try {
                    new URL(linkedin_url);
                } catch {

                    return res.send(`
                        <h2>Error</h2>
                        <p>Please enter a valid LinkedIn URL.</p>
                        <a href="/">Go Back</a>
                    `);
                }
            }

            // ---------------------------
            // Check duplicate email
            // ---------------------------

            const [existingEmail] = await db.query(
                "SELECT id FROM alumni WHERE email = ?",
                [email]
            );

            if (existingEmail.length > 0) {

                return res.send(`
                    <h2>Error</h2>
                    <p>This email is already registered.</p>
                    <a href="/">Go Back</a>
                `);
            }

            // ---------------------------
            // Check duplicate student ID
            // ---------------------------

            const [existingStudent] = await db.query(
                "SELECT id FROM alumni WHERE student_id = ?",
                [student_id]
            );

            if (existingStudent.length > 0) {

                return res.send(`
                    <h2>Error</h2>
                    <p>This Student ID is already registered.</p>
                    <a href="/">Go Back</a>
                `);
            }

            // ---------------------------
            // Hash password
            // ---------------------------

            const hashedPassword =
                await bcrypt.hash(password, 10);

            // ---------------------------
            // Profile photo
            // ---------------------------

            let profilePhoto = null;

            if (req.file) {
                profilePhoto = "/uploads/" + req.file.filename;
            }

            // ---------------------------
            // Insert into MySQL
            // ---------------------------

            const sql = `
                INSERT INTO alumni (
                    full_name,
                    email,
                    phone,
                    gender,
                    date_of_birth,
                    student_id,
                    degree,
                    department,
                    graduation_year,
                    current_job,
                    company,
                    city,
                    country,
                    address,
                    password,
                    profile_photo,
                    linkedin_url,
                    skills
                )

                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            await db.query(sql, [
                full_name,
                email,
                phone,
                gender,
                date_of_birth,
                student_id,
                degree,
                department,
                graduation_year,
                current_job || null,
                company || null,
                city,
                country,
                address || null,
                hashedPassword,
                profilePhoto,
                linkedin_url || null,
                skills || null
            ]);

            // ---------------------------
            // Success
            // ---------------------------

            res.send(`
                <!DOCTYPE html>

                <html>

                <head>
                    <title>Registration Successful</title>
                    <link rel="stylesheet" href="/style.css">
                </head>

                <body>

                    <main class="container">

                        <div class="page-heading">

                            <h2>Registration Successful!</h2>

                            <p>
                                Your alumni account has been created successfully.
                            </p>

                            <p>
                                Welcome, ${full_name}!
                            </p>

                            <a href="/">
                                Register Another Alumni
                            </a>

                            <br><br>

                            <a href="/alumni">
                                View Alumni Directory
                            </a>

                        </div>

                    </main>

                </body>

                </html>
            `);

        } catch (error) {

            console.error("Registration error:", error);

            res.status(500).send(`
                <h2>Registration Failed</h2>
                <p>${error.message}</p>
                <a href="/">Go Back</a>
            `);
        }
    }
);

// ===============================
// ALUMNI DIRECTORY
// ===============================

app.get("/alumni", async (req, res) => {

    try {

        const [alumni] = await db.query(`
            SELECT
                id,
                full_name,
                email,
                phone,
                gender,
                student_id,
                degree,
                department,
                graduation_year,
                current_job,
                company,
                city,
                country,
                profile_photo,
                linkedin_url,
                skills,
                created_at
            FROM alumni
            ORDER BY id DESC
        `);

        res.render("alumni", {
            alumni
        });

    } catch (error) {

        console.error(error);

        res.status(500).send(
            "Could not load alumni: " + error.message
        );
    }
});

// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {

    console.log(
        `Alumni system running at http://localhost:${PORT}`
    );

});