require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

const app = express();

const PORT = process.env.PORT || 3000;

// ==================================================
// EXPRESS CONFIGURATION
// ==================================================

app.set('view engine', 'ejs');

app.use(express.urlencoded({
    extended: true
}));

app.use(express.json());

app.use(express.static(
    path.join(__dirname, 'public')
));

// ==================================================
// UPLOAD DIRECTORIES
// ==================================================

const uploadDir = path.join(
    __dirname,
    'public',
    'uploads'
);

const documentDir = path.join(
    uploadDir,
    'documents'
);

fs.mkdirSync(uploadDir, {
    recursive: true
});

fs.mkdirSync(documentDir, {
    recursive: true
});

// ==================================================
// MYSQL CONNECTION POOL
// ==================================================

const db = mysql.createPool({

    host: process.env.DB_HOST,

    user: process.env.DB_USER,

    password: process.env.DB_PASSWORD,

    database: process.env.DB_NAME,

    waitForConnections: true,

    connectionLimit: 10,

    queueLimit: 0
});

// ==================================================
// DATABASE TEST
// ==================================================

async function testDatabase() {

    try {

        const connection =
            await db.getConnection();

        console.log(
            'MySQL Connected Successfully'
        );

        connection.release();

    } catch (error) {

        console.error(
            'MySQL Connection Error:',
            error.message
        );

        process.exit(1);
    }
}

// ==================================================
// MULTER CONFIGURATION
// ==================================================

const storage = multer.diskStorage({

    destination: (req, file, cb) => {

        if (file.fieldname === 'profile_image') {

            cb(null, uploadDir);

        } else if (file.fieldname === 'resume') {

            cb(null, documentDir);

        } else {

            cb(
                new Error(
                    'Invalid upload field.'
                )
            );
        }
    },

    filename: (req, file, cb) => {

        const extension =
            path.extname(
                file.originalname
            ).toLowerCase();

        const filename =
            `${Date.now()}-${Math.round(
                Math.random() * 1e9
            )}${extension}`;

        cb(null, filename);
    }
});

// ==================================================
// FILE VALIDATION
// ==================================================

const fileFilter = (req, file, cb) => {

    const extension =
        path.extname(
            file.originalname
        ).toLowerCase();

    if (file.fieldname === 'profile_image') {

        const allowed = [
            '.jpg',
            '.jpeg',
            '.png',
            '.gif'
        ];

        if (!allowed.includes(extension)) {

            return cb(
                new Error(
                    'Profile image must be JPG, JPEG, PNG or GIF.'
                )
            );
        }
    }

    if (file.fieldname === 'resume') {

        const allowed = [
            '.pdf',
            '.doc',
            '.docx'
        ];

        if (!allowed.includes(extension)) {

            return cb(
                new Error(
                    'Resume must be PDF, DOC or DOCX.'
                )
            );
        }
    }

    cb(null, true);
};

// ==================================================
// MULTER
// ==================================================

const upload = multer({

    storage,

    limits: {
        fileSize: 2 * 1024 * 1024
    },

    fileFilter
});

const uploadFields = upload.fields([
    {
        name: 'profile_image',
        maxCount: 1
    },
    {
        name: 'resume',
        maxCount: 1
    }
]);

// ==================================================
// HELPER FUNCTIONS
// ==================================================

function getSkills(value) {

    if (Array.isArray(value)) {

        return value.join(', ');
    }

    return value || '';
}

// --------------------------------------------------
// Delete uploaded file
// --------------------------------------------------

function removeFile(filename, document = false) {

    if (!filename) {
        return;
    }

    const directory =
        document
            ? documentDir
            : uploadDir;

    const filePath = path.join(
        directory,
        path.basename(filename)
    );

    try {

        if (fs.existsSync(filePath)) {

            fs.unlinkSync(filePath);
        }

    } catch (error) {

        console.error(
            'File deletion error:',
            error.message
        );
    }
}

// ==================================================
// HOME
// ==================================================

app.get('/', async (req, res) => {

    try {

        const q =
            String(req.query.q || '').trim();

        let rows;

        if (q) {

            const [result] =
                await db.query(
                    `
                    SELECT *
                    FROM alumni
                    WHERE full_name LIKE ?
                       OR email LIKE ?
                       OR department LIKE ?
                    ORDER BY id DESC
                    `,
                    [
                        `%${q}%`,
                        `%${q}%`,
                        `%${q}%`
                    ]
                );

            rows = result;

        } else {

            const [result] =
                await db.query(
                    `
                    SELECT *
                    FROM alumni
                    ORDER BY id DESC
                    `
                );

            rows = result;
        }

        res.render('index', {

            alumni: rows,

            q
        });

    } catch (error) {

        console.error(error);

        res
            .status(500)
            .send('Database error.');
    }
});

// ==================================================
// REGISTER PAGE
// ==================================================

app.get('/register', (req, res) => {

    res.render('form', {

        alumni: null,

        action: '/register',

        title: 'Register Alumni'
    });
});

// ==================================================
// REGISTER ALUMNI
// ==================================================

app.post(
    '/register',
    uploadFields,
    async (req, res) => {

        const d = req.body;

        let profileImage = null;

        let resume = null;

        try {

            // ------------------------------------------
            // Validation
            // ------------------------------------------

            if (
                !d.full_name ||
                !d.email ||
                !d.password ||
                !d.terms_accepted
            ) {

                return res
                    .status(400)
                    .send(
                        'Full Name, Email, Password and Terms are required.'
                    );
            }

            // ------------------------------------------
            // Files
            // ------------------------------------------

            profileImage =
                req.files?.profile_image?.[0]
                    ?.filename || null;

            resume =
                req.files?.resume?.[0]
                    ?.filename || null;

            // ------------------------------------------
            // Hash password
            // ------------------------------------------

            const hashedPassword =
                await bcrypt.hash(
                    d.password,
                    12
                );

            // ------------------------------------------
            // Insert
            // ------------------------------------------

            const sql = `
                INSERT INTO alumni
                (
                    full_name,
                    email,
                    password,
                    phone,
                    dob,
                    gender,
                    department,
                    graduation_year,
                    cgpa,
                    degree_program,
                    employment_status,
                    company,
                    job_title,
                    skills,
                    contact_preference,
                    linkedin,
                    bio,
                    newsletter,
                    terms_accepted,
                    profile_image,
                    resume
                )
                VALUES
                (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
            `;

            const values = [

                d.full_name.trim(),

                d.email.trim().toLowerCase(),

                hashedPassword,

                d.phone || null,

                d.dob || null,

                d.gender || null,

                d.department || null,

                d.graduation_year || null,

                d.cgpa || null,

                d.degree_program || null,

                d.employment_status || null,

                d.company || null,

                d.job_title || null,

                getSkills(d.skills),

                d.contact_preference || null,

                d.linkedin || null,

                d.bio || null,

                d.newsletter ? 1 : 0,

                d.terms_accepted ? 1 : 0,

                profileImage,

                resume
            ];

            const [result] =
                await db.execute(
                    sql,
                    values
                );

            res.redirect(
                `/view/${result.insertId}`
            );

        } catch (error) {

            console.error(
                'Registration Error:',
                error
            );

            // Delete uploaded files
            removeFile(profileImage);

            removeFile(
                resume,
                true
            );

            if (
                error.code ===
                'ER_DUP_ENTRY'
            ) {

                return res
                    .status(400)
                    .send(
                        'An alumni with this email already exists.'
                    );
            }

            res
                .status(500)
                .send(
                    'Unable to register alumni.'
                );
        }
    }
);

// ==================================================
// VIEW ALUMNI
// ==================================================

app.get(
    '/view/:id',
    async (req, res) => {

        try {

            const id =
                Number(req.params.id);

            if (!Number.isInteger(id)) {

                return res
                    .status(400)
                    .send(
                        'Invalid alumni ID.'
                    );
            }

            const [rows] =
                await db.execute(
                    `
                    SELECT *
                    FROM alumni
                    WHERE id = ?
                    `,
                    [id]
                );

            if (!rows.length) {

                return res
                    .status(404)
                    .send(
                        'Alumni not found.'
                    );
            }

            res.render('view', {

                alumni: rows[0]
            });

        } catch (error) {

            console.error(error);

            res
                .status(500)
                .send(
                    'Database error.'
                );
        }
    }
);

// ==================================================
// EDIT PAGE
// ==================================================

app.get(
    '/edit/:id',
    async (req, res) => {

        try {

            const id =
                Number(req.params.id);

            if (!Number.isInteger(id)) {

                return res
                    .status(400)
                    .send(
                        'Invalid alumni ID.'
                    );
            }

            const [rows] =
                await db.execute(
                    `
                    SELECT *
                    FROM alumni
                    WHERE id = ?
                    `,
                    [id]
                );

            if (!rows.length) {

                return res
                    .status(404)
                    .send(
                        'Alumni not found.'
                    );
            }

            res.render('form', {

                alumni: rows[0],

                action: `/edit/${id}`,

                title: 'Edit Alumni'
            });

        } catch (error) {

            console.error(error);

            res
                .status(500)
                .send(
                    'Database error.'
                );
        }
    }
);

// ==================================================
// UPDATE ALUMNI
// ==================================================

app.post(
    '/edit/:id',
    uploadFields,
    async (req, res) => {

        const id =
            Number(req.params.id);

        let newProfileImage = null;

        let newResume = null;

        try {

            if (!Number.isInteger(id)) {

                return res
                    .status(400)
                    .send(
                        'Invalid alumni ID.'
                    );
            }

            const [rows] =
                await db.execute(
                    `
                    SELECT *
                    FROM alumni
                    WHERE id = ?
                    `,
                    [id]
                );

            if (!rows.length) {

                return res
                    .status(404)
                    .send(
                        'Alumni not found.'
                    );
            }

            const old = rows[0];

            const d = req.body;

            let profileImage =
                old.profile_image;

            let resume =
                old.resume;

            // ------------------------------------------
            // New profile image
            // ------------------------------------------

            if (
                req.files?.profile_image?.[0]
            ) {

                newProfileImage =
                    req.files
                        .profile_image[0]
                        .filename;

                profileImage =
                    newProfileImage;
            }

            // ------------------------------------------
            // New resume
            // ------------------------------------------

            if (
                req.files?.resume?.[0]
            ) {

                newResume =
                    req.files
                        .resume[0]
                        .filename;

                resume =
                    newResume;
            }

            const sql = `
                UPDATE alumni
                SET
                    full_name = ?,
                    email = ?,
                    phone = ?,
                    dob = ?,
                    gender = ?,
                    department = ?,
                    graduation_year = ?,
                    cgpa = ?,
                    degree_program = ?,
                    employment_status = ?,
                    company = ?,
                    job_title = ?,
                    skills = ?,
                    contact_preference = ?,
                    linkedin = ?,
                    bio = ?,
                    newsletter = ?,
                    profile_image = ?,
                    resume = ?
                WHERE id = ?
            `;

            const values = [

                d.full_name,

                d.email
                    ?.trim()
                    .toLowerCase(),

                d.phone || null,

                d.dob || null,

                d.gender || null,

                d.department || null,

                d.graduation_year || null,

                d.cgpa || null,

                d.degree_program || null,

                d.employment_status || null,

                d.company || null,

                d.job_title || null,

                getSkills(d.skills),

                d.contact_preference || null,

                d.linkedin || null,

                d.bio || null,

                d.newsletter ? 1 : 0,

                profileImage,

                resume,

                id
            ];

            await db.execute(
                sql,
                values
            );

            // Delete old files only after
            // successful database update

            if (
                newProfileImage &&
                old.profile_image
            ) {

                removeFile(
                    old.profile_image
                );
            }

            if (
                newResume &&
                old.resume
            ) {

                removeFile(
                    old.resume,
                    true
                );
            }

            res.redirect(
                `/view/${id}`
            );

        } catch (error) {

            console.error(
                'Update Error:',
                error
            );

            // Remove newly uploaded files
            // if database update failed

            removeFile(
                newProfileImage
            );

            removeFile(
                newResume,
                true
            );

            if (
                error.code ===
                'ER_DUP_ENTRY'
            ) {

                return res
                    .status(400)
                    .send(
                        'This email is already registered.'
                    );
            }

            res
                .status(500)
                .send(
                    'Database error.'
                );
        }
    }
);

// ==================================================
// DELETE ALUMNI
// ==================================================

app.post(
    '/delete/:id',
    async (req, res) => {

        try {

            const id =
                Number(req.params.id);

            if (!Number.isInteger(id)) {

                return res
                    .status(400)
                    .send(
                        'Invalid alumni ID.'
                    );
            }

            const [rows] =
                await db.execute(
                    `
                    SELECT
                        profile_image,
                        resume
                    FROM alumni
                    WHERE id = ?
                    `,
                    [id]
                );

            if (!rows.length) {

                return res
                    .status(404)
                    .send(
                        'Alumni not found.'
                    );
            }

            await db.execute(
                `
                DELETE FROM alumni
                WHERE id = ?
                `,
                [id]
            );

            removeFile(
                rows[0].profile_image
            );

            removeFile(
                rows[0].resume,
                true
            );

            res.redirect('/');

        } catch (error) {

            console.error(
                'Delete Error:',
                error
            );

            res
                .status(500)
                .send(
                    'Unable to delete alumni.'
                );
        }
    }
);

// ==================================================
// INDIVIDUAL PDF
// ==================================================

app.get(
    '/pdf/:id',
    async (req, res) => {

        try {

            const id =
                Number(req.params.id);

            if (!Number.isInteger(id)) {

                return res
                    .status(400)
                    .send(
                        'Invalid alumni ID.'
                    );
            }

            const [rows] =
                await db.execute(
                    `
                    SELECT *
                    FROM alumni
                    WHERE id = ?
                    `,
                    [id]
                );

            if (!rows.length) {

                return res
                    .status(404)
                    .send(
                        'Alumni not found.'
                    );
            }

            const a = rows[0];

            const doc =
                new PDFDocument({
                    margin: 45,
                    size: 'A4'
                });

            res.setHeader(
                'Content-Type',
                'application/pdf'
            );

            res.setHeader(
                'Content-Disposition',
                `attachment; filename="alumni-${a.id}.pdf"`
            );

            doc.pipe(res);

            doc
                .fontSize(22)
                .font('Helvetica-Bold')
                .text(
                    'ALUMNI PROFILE',
                    {
                        align: 'center'
                    }
                );

            doc.moveDown();

            if (a.profile_image) {

                const imagePath =
                    path.join(
                        uploadDir,
                        path.basename(
                            a.profile_image
                        )
                    );

                if (
                    fs.existsSync(imagePath)
                ) {

                    try {

                        doc.image(
                            imagePath,
                            420,
                            65,
                            {
                                width: 110,
                                height: 110
                            }
                        );

                    } catch (error) {

                        console.error(
                            'PDF Image Error:',
                            error.message
                        );
                    }
                }
            }

            let y = 80;

            const information = [

                ['Registration ID', a.id],

                ['Full Name', a.full_name],

                ['Email', a.email],

                ['Phone', a.phone],

                ['Date of Birth', a.dob],

                ['Gender', a.gender],

                ['Department', a.department],

                ['Graduation Year', a.graduation_year],

                ['CGPA', a.cgpa],

                ['Degree Program', a.degree_program],

                ['Employment Status',
                    a.employment_status],

                ['Company', a.company],

                ['Job Title', a.job_title],

                ['Skills', a.skills],

                ['Contact Preference',
                    a.contact_preference],

                ['LinkedIn', a.linkedin],

                ['Bio', a.bio],

                [
                    'Newsletter',
                    a.newsletter
                        ? 'Yes'
                        : 'No'
                ]
            ];

            information.forEach(
                ([label, value]) => {

                    if (y > 700) {

                        doc.addPage();

                        y = 50;
                    }

                    doc
                        .font('Helvetica-Bold')
                        .fontSize(10)
                        .text(
                            `${label}:`,
                            50,
                            y,
                            {
                                continued: true,
                                width: 125
                            }
                        );

                    doc
                        .font('Helvetica')
                        .text(
                            ` ${value ?? ''}`,
                            {
                                width: 300
                            }
                        );

                    y += 24;
                }
            );

            doc
                .fontSize(9)
                .fillColor('gray')
                .text(
                    'Generated by Alumni Management System',
                    45,
                    800,
                    {
                        align: 'center',
                        width: 500
                    }
                );

            doc.end();

        } catch (error) {

            console.error(
                'PDF Error:',
                error
            );

            if (!res.headersSent) {

                res
                    .status(500)
                    .send(
                        'Unable to generate PDF.'
                    );
            }
        }
    }
);

// ==================================================
// ALL ALUMNI PDF
// ==================================================

app.get(
    '/pdf',
    async (req, res) => {

        try {

            const [rows] =
                await db.query(
                    `
                    SELECT
                        id,
                        full_name,
                        email,
                        department,
                        graduation_year,
                        employment_status
                    FROM alumni
                    ORDER BY id DESC
                    `
                );

            const doc =
                new PDFDocument({
                    margin: 40,
                    size: 'A4'
                });

            res.setHeader(
                'Content-Type',
                'application/pdf'
            );

            res.setHeader(
                'Content-Disposition',
                'attachment; filename="alumni-list.pdf"'
            );

            doc.pipe(res);

            doc
                .fontSize(20)
                .font('Helvetica-Bold')
                .text(
                    'ALUMNI REGISTRATION LIST',
                    {
                        align: 'center'
                    }
                );

            let y = 90;

            const headers = [
                ['ID', 40],
                ['Name', 75],
                ['Email', 220],
                ['Department', 335],
                ['Year', 445],
                ['Status', 485]
            ];

            doc
                .fontSize(9)
                .font('Helvetica-Bold');

            headers.forEach(
                ([text, x]) => {

                    doc.text(
                        text,
                        x,
                        y
                    );
                }
            );

            y += 28;

            doc.font('Helvetica');

            rows.forEach(
                (a) => {

                    if (y > 750) {

                        doc.addPage();

                        y = 50;

                        doc
                            .font(
                                'Helvetica-Bold'
                            );

                        headers.forEach(
                            ([text, x]) => {

                                doc.text(
                                    text,
                                    x,
                                    y
                                );
                            }
                        );

                        y += 25;

                        doc.font(
                            'Helvetica'
                        );
                    }

                    doc.text(
                        String(a.id),
                        40,
                        y,
                        {
                            width: 30
                        }
                    );

                    doc.text(
                        a.full_name || '',
                        75,
                        y,
                        {
                            width: 140,
                            ellipsis: true
                        }
                    );

                    doc.text(
                        a.email || '',
                        220,
                        y,
                        {
                            width: 105,
                            ellipsis: true
                        }
                    );

                    doc.text(
                        a.department || '',
                        335,
                        y,
                        {
                            width: 100,
                            ellipsis: true
                        }
                    );

                    doc.text(
                        String(
                            a.graduation_year || ''
                        ),
                        445,
                        y
                    );

                    doc.text(
                        a.employment_status || '',
                        485,
                        y,
                        {
                            width: 70,
                            ellipsis: true
                        }
                    );

                    y += 20;
                }
            );

            doc
                .fontSize(8)
                .fillColor('gray')
                .text(
                    `Total records: ${rows.length}`,
                    40,
                    780
                );

            doc.end();

        } catch (error) {

            console.error(
                'List PDF Error:',
                error
            );

            if (!res.headersSent) {

                res
                    .status(500)
                    .send(
                        'Unable to generate PDF.'
                    );
            }
        }
    }
);

// ==================================================
// ERROR HANDLER
// ==================================================

app.use(
    (err, req, res, next) => {

        console.error(
            'Application Error:',
            err
        );

        if (
            err instanceof multer.MulterError
        ) {

            if (
                err.code ===
                'LIMIT_FILE_SIZE'
            ) {

                return res
                    .status(400)
                    .send(
                        'Maximum file size is 2 MB.'
                    );
            }

            return res
                .status(400)
                .send(err.message);
        }

        res
            .status(400)
            .send(
                err.message ||
                'Request error.'
            );
    }
);

// ==================================================
// START APPLICATION
// ==================================================

async function startServer() {

    await testDatabase();

    app.listen(
        PORT,
        () => {

            console.log(
                `Server running at http://localhost:${PORT}`
            );
        }
    );
}

startServer();