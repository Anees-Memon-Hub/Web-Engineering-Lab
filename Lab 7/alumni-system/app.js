const express = require("express");
const path = require("path");
const session = require("express-session");
const dotenv = require("dotenv");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const fs = require("fs");

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
        saveUninitialized: false
    })
);

// ===============================
// UPLOAD DIRECTORIES
// ===============================

const uploadDirectory = path.join(__dirname, "public", "uploads");

if (!fs.existsSync(uploadDirectory)) {
    fs.mkdirSync(uploadDirectory, { recursive: true });
}

// ===============================
// MULTER CONFIGURATION
// ===============================

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDirectory);
    },

    filename: function (req, file, cb) {
        const uniqueName =
            Date.now() +
            "-" +
            Math.round(Math.random() * 1e9) +
            path.extname(file.originalname);

        cb(null, uniqueName);
    }
});

// Allowed file types
const allowedImageTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
];

const allowedResumeTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
];

const fileFilter = function (req, file, cb) {

    // Profile image
    if (file.fieldname === "profile_image") {

        if (allowedImageTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(
                new Error(
                    "Profile image must be JPG, PNG, or WEBP."
                )
            );
        }

        return;
    }

    // Resume
    if (file.fieldname === "resume") {

        if (allowedResumeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(
                new Error(
                    "Resume must be PDF, DOC, or DOCX."
                )
            );
        }

        return;
    }

    cb(null, false);
};

const upload = multer({
    storage: storage,

    limits: {
        fileSize: 2 * 1024 * 1024
    },

    fileFilter: fileFilter
});

// ===============================
// HOME PAGE
// ===============================

app.get("/", (req, res) => {
    res.render("register");
});

// ===============================
// TEST DATABASE
// ===============================

app.get("/test", async (req, res) => {

    try {

        const [rows] = await db.query("SELECT 1 AS result");

        res.json({
            success: true,
            message: "Database connection working",
            data: rows
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Database connection failed"
        });
    }
});

// ===============================
// REGISTER ALUMNI
// ===============================

app.post(
    "/register",

    upload.fields([
        {
            name: "profile_image",
            maxCount: 1
        },
        {
            name: "resume",
            maxCount: 1
        }
    ]),

    async (req, res) => {

        try {

            console.log("FORM DATA:");
            console.log(req.body);

            console.log("FILES:");
            console.log(req.files);

            // ===============================
            // GET FORM DATA
            // ===============================

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
                cgpa,
                employment_status,
                current_job,
                job_title,
                company,
                city,
                country,
                address,
                linkedin_url,
                skills,
                contact_preference,
                bio,
                password,
                confirm_password
            } = req.body;

            // ===============================
            // BASIC VALIDATION
            // ===============================

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
                !password ||
                !confirm_password
            ) {

                return res.status(400).send(`
                    <h2>Missing Required Fields</h2>
                    <p>Please fill all required fields.</p>
                    <a href="/">Go Back</a>
                `);
            }

            // ===============================
            // PASSWORD VALIDATION
            // ===============================

            if (password !== confirm_password) {

                return res.status(400).send(`
                    <h2>Password Error</h2>
                    <p>Passwords do not match.</p>
                    <a href="/">Go Back</a>
                `);
            }

            // ===============================
            // CHECK DUPLICATE EMAIL
            // ===============================

            const [existingEmail] = await db.query(
                "SELECT id FROM alumni WHERE email = ?",
                [email]
            );

            if (existingEmail.length > 0) {

                return res.status(400).send(`
                    <h2>Email Already Registered</h2>
                    <p>This email address is already registered.</p>
                    <a href="/">Go Back</a>
                `);
            }

            // ===============================
            // CHECK DUPLICATE STUDENT ID
            // ===============================

            const [existingStudent] = await db.query(
                "SELECT id FROM alumni WHERE student_id = ?",
                [student_id]
            );

            if (existingStudent.length > 0) {

                return res.status(400).send(`
                    <h2>Student ID Already Registered</h2>
                    <p>This Student ID is already registered.</p>
                    <a href="/">Go Back</a>
                `);
            }

            // ===============================
            // PASSWORD HASHING
            // ===============================

            const hashedPassword = await bcrypt.hash(
                password,
                10
            );

            // ===============================
            // FILE INFORMATION
            // ===============================

            let profileImage = null;
            let resumeFile = null;

            if (
                req.files &&
                req.files.profile_image &&
                req.files.profile_image.length > 0
            ) {

                profileImage =
                    req.files.profile_image[0].filename;
            }

            if (
                req.files &&
                req.files.resume &&
                req.files.resume.length > 0
            ) {

                resumeFile =
                    req.files.resume[0].filename;
            }

            // ===============================
            // CHECKBOX VALUES
            // ===============================

            const newsletterValue =
                req.body.newsletter ? 1 : 0;

            const termsAcceptedValue =
                req.body.terms_accepted ? 1 : 0;

            // ===============================
            // INSERT INTO DATABASE
            // ===============================

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
                    cgpa,
                    employment_status,
                    current_job,
                    job_title,
                    company,
                    city,
                    country,
                    address,
                    password,
                    profile_photo,
                    resume,
                    linkedin_url,
                    skills,
                    contact_preference,
                    bio,
                    newsletter,
                    terms_accepted
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const values = [
                full_name,
                email,
                phone,
                gender,
                date_of_birth,
                student_id,
                degree,
                department,
                graduation_year,
                cgpa || null,
                employment_status || null,
                current_job || null,
                job_title || null,
                company || null,
                city,
                country,
                address || null,
                hashedPassword,
                profileImage,
                resumeFile,
                linkedin_url || null,
                skills || null,
                contact_preference || null,
                bio || null,
                newsletterValue,
                termsAcceptedValue
            ];

            const [result] = await db.query(
                sql,
                values
            );

            // ===============================
            // SUCCESS PAGE
            // ===============================

            res.render("success", {
                registrationId: result.insertId,
                name: full_name,
                email: email,
                profileImage: profileImage
            });

        } catch (error) {

            console.error(
                "Registration Error:",
                error
            );

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

        const [alumni] = await db.query(
            `
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
                cgpa,
                employment_status,
                job_title,
                current_job,
                company,
                city,
                country,
                profile_photo,
                resume,
                linkedin_url,
                skills,
                contact_preference,
                bio
            FROM alumni
            ORDER BY id DESC
            `
        );

        res.render("alumni", {
            alumni
        });

    } catch (error) {

        console.error(error);

        res.status(500).send(
            "Unable to load alumni directory."
        );
    }
});

// ===============================
// MULTER / GENERAL ERROR HANDLER
// ===============================

app.use((error, req, res, next) => {

    console.error("Server Error:", error);

    if (error instanceof multer.MulterError) {

        if (error.code === "LIMIT_FILE_SIZE") {

            return res.status(400).send(`
                <h2>File Too Large</h2>
                <p>Maximum allowed file size is 2 MB.</p>
                <a href="/">Go Back</a>
            `);
        }

        return res.status(400).send(`
            <h2>Upload Error</h2>
            <p>${error.message}</p>
            <a href="/">Go Back</a>
        `);
    }

    if (error) {

        return res.status(400).send(`
            <h2>Upload Error</h2>
            <p>${error.message}</p>
            <a href="/">Go Back</a>
        `);
    }

    next();
});

// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {

    console.log(
        `Server running at http://localhost:${PORT}`
    );

});