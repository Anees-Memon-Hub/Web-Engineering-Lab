require('dotenv').config();
const express = require("express");
const mysql = require("mysql2");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");
const app = express();
const PORT = 3000;
app.set("view engine", "ejs");
app.use(
  express.urlencoded({
    extended: true,
  }),
);
app.use(express.static(path.join(__dirname, "public")));
// Session authentication. Set SESSION_SECRET in your environment before deployment.
app.use(
  session({
    name: "alumni.sid",
    secret:
      process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 2,
    },
  }),
);
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});
const uploadDir = path.join(__dirname, "public", "uploads"),
  documentDir = path.join(uploadDir, "documents");
fs.mkdirSync(documentDir, {
  recursive: true,
});
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
db.connect((e) =>
  e ? console.error("MySQL:", e.message) : console.log("MySQL Connected"),
);
const storage = multer.diskStorage({
  destination: (req, file, cb) =>
    cb(null, file.fieldname === "profile_image" ? uploadDir : documentDir),
  filename: (req, file, cb) =>
    cb(
      null,
      Date.now() +
        "-" +
        Math.round(Math.random() * 1e9) +
        path.extname(file.originalname).toLowerCase(),
    ),
});
const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (
      file.fieldname === "profile_image" &&
      ![".jpg", ".jpeg", ".png", ".gif"].includes(ext)
    )
      return cb(new Error("Profile image must be JPG, JPEG, PNG, or GIF."));
    if (file.fieldname === "resume" && ![".pdf", ".doc", ".docx"].includes(ext))
      return cb(new Error("Resume must be PDF, DOC, or DOCX."));
    cb(null, true);
  },
});
const uploadFields = upload.fields([
  {
    name: "profile_image",
    maxCount: 1,
  },
  {
    name: "resume",
    maxCount: 1,
  },
]);
const skills = (v) => (Array.isArray(v) ? v.join(", ") : v || "");

// ---------- Authentication routes (public) ----------
app.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/");
  res.render("login", {
    error: null,
    email: "",
  });
});
app.post("/login", (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";
  if (!email || !password)
    return res.status(400).render("login", {
      error: "Email and password are required.",
      email,
    });
  db.query(
    "SELECT id,name,email,password_hash FROM users WHERE email=? LIMIT 1",
    [email],
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).render("login", {
          error: "Database error. Please try again.",
          email,
        });
      }
      if (!rows.length || !bcrypt.compareSync(password, rows[0].password_hash))
        return res.status(401).render("login", {
          error: "Invalid email or password.",
          email,
        });
      // Regenerate session to help prevent session fixation.
      req.session.regenerate((sessionErr) => {
        if (sessionErr) {
          console.error(sessionErr);
          return res.status(500).send("Could not start session.");
        }
        req.session.user = {
          id: rows[0].id,
          name: rows[0].name,
          email: rows[0].email,
        };
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error(saveErr);
            return res.status(500).send("Could not save session.");
          }
          res.redirect("/");
        });
      });
    },
  );
});
app.get("/signup", (req, res) => {
  if (req.session.user) return res.redirect("/");
  res.render("signup", {
    error: null,
    name: "",
    email: "",
  });
});
app.post("/signup", (req, res) => {
  const name = (req.body.name || "").trim();
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";
  const confirm = req.body.confirm_password || "";
  if (!name || !email || !password || !confirm)
    return res.status(400).render("signup", {
      error: "All fields are required.",
      name,
      email,
    });
  if (!/^\S+@\S+\.\S+$/.test(email))
    return res.status(400).render("signup", {
      error: "Enter a valid email address.",
      name,
      email,
    });
  if (password.length < 8)
    return res.status(400).render("signup", {
      error: "Password must be at least 8 characters.",
      name,
      email,
    });
  if (password !== confirm)
    return res.status(400).render("signup", {
      error: "Passwords do not match.",
      name,
      email,
    });
  const passwordHash = bcrypt.hashSync(password, 12);
  db.query(
    "INSERT INTO users (name,email,password_hash) VALUES (?,?,?)",
    [name, email, passwordHash],
    (err, result) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY")
          return res.status(409).render("signup", {
            error: "An account with this email already exists.",
            name,
            email,
          });
        console.error(err);
        return res.status(500).render("signup", {
          error: "Could not create account. Check the database setup.",
          name,
          email,
        });
      }
      req.session.regenerate((sessionErr) => {
        if (sessionErr) {
          console.error(sessionErr);
          return res
            .status(500)
            .send(
              "Account created, but session could not start. Please log in.",
            );
        }
        req.session.user = {
          id: result.insertId,
          name,
          email,
        };
        req.session.save((saveErr) =>
          saveErr
            ? res
                .status(500)
                .send(
                  "Account created, but session could not be saved. Please log in.",
                )
            : res.redirect("/"),
        );
      });
    },
  );
});
app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Could not log out.");
    }
    res.clearCookie("alumni.sid");
    res.redirect("/login");
  });
});

// Everything below this point requires a signed-in session.
app.use((req, res, next) => {
  if (req.session.user) return next();
  return res.redirect("/login");
});

function removeFile(name, doc = false) {
  if (!name) return;
  const p = path.join(doc ? documentDir : uploadDir, path.basename(name));
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
app.get("/", (req, res) => {
  const q = (req.query.q || "").trim();
  const sql = q
    ? "SELECT * FROM alumni WHERE full_name LIKE ? OR email LIKE ? OR department LIKE ? ORDER BY id DESC"
    : "SELECT * FROM alumni ORDER BY id DESC";
  const p = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
  db.query(sql, p, (e, rows) =>
    e
      ? res.status(500).send("Database error.")
      : res.render("index", {
          alumni: rows,
          q,
        }),
  );
});
app.get("/register", (req, res) =>
  res.render("form", {
    alumni: null,
    action: "/register",
    title: "Register Alumni",
  }),
);
app.post("/register", uploadFields, (req, res) => {
  const d = req.body;
  if (!d.full_name || !d.email || !d.password || !d.terms_accepted)
    return res
      .status(400)
      .send("Full Name, Email, Password and Terms are required.");
  const pi = req.files?.profile_image?.[0]?.filename || null,
    resume = req.files?.resume?.[0]?.filename || null;
  const sql = `INSERT INTO alumni (full_name,email,password,phone,dob,gender,department,graduation_year,cgpa,degree_program,employment_status,company,job_title,skills,contact_preference,linkedin,bio,newsletter,terms_accepted,profile_image,resume) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
  const v = [
    d.full_name,
    d.email,
    d.password,
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
    skills(d.skills),
    d.contact_preference || null,
    d.linkedin || null,
    d.bio || null,
    d.newsletter ? 1 : 0,
    d.terms_accepted ? 1 : 0,
    pi,
    resume,
  ];
  db.query(sql, v, (e, r) =>
    e
      ? (console.error(e), res.status(500).send("Database error."))
      : res.redirect("/view/" + r.insertId),
  );
});
app.get("/view/:id", (req, res) =>
  db.query("SELECT * FROM alumni WHERE id=?", [req.params.id], (e, r) =>
    e
      ? res.status(500).send("Database error.")
      : !r.length
        ? res.status(404).send("Not found")
        : res.render("view", {
            alumni: r[0],
          }),
  ),
);
app.get("/edit/:id", (req, res) =>
  db.query("SELECT * FROM alumni WHERE id=?", [req.params.id], (e, r) =>
    e
      ? res.status(500).send("Database error.")
      : !r.length
        ? res.status(404).send("Not found")
        : res.render("form", {
            alumni: r[0],
            action: "/edit/" + r[0].id,
            title: "Edit Alumni",
          }),
  ),
);
app.post("/edit/:id", uploadFields, (req, res) =>
  db.query("SELECT * FROM alumni WHERE id=?", [req.params.id], (e, r) => {
    if (e) return res.status(500).send("Database error.");
    if (!r.length) return res.status(404).send("Not found");
    const old = r[0],
      d = req.body;
    let pi = old.profile_image,
      rr = old.resume;
    if (req.files?.profile_image?.[0]) {
      removeFile(pi);
      pi = req.files.profile_image[0].filename;
    }
    if (req.files?.resume?.[0]) {
      removeFile(rr, true);
      rr = req.files.resume[0].filename;
    }
    const sql = `UPDATE alumni SET full_name=?,email=?,phone=?,dob=?,gender=?,department=?,graduation_year=?,cgpa=?,degree_program=?,employment_status=?,company=?,job_title=?,skills=?,contact_preference=?,linkedin=?,bio=?,newsletter=?,profile_image=?,resume=? WHERE id=?`;
    const v = [
      d.full_name,
      d.email,
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
      skills(d.skills),
      d.contact_preference || null,
      d.linkedin || null,
      d.bio || null,
      d.newsletter ? 1 : 0,
      pi,
      rr,
      req.params.id,
    ];
    db.query(sql, v, (e) =>
      e
        ? res.status(500).send("Database error.")
        : res.redirect("/view/" + req.params.id),
    );
  }),
);
app.post("/delete/:id", (req, res) =>
  db.query(
    "SELECT profile_image,resume FROM alumni WHERE id=?",
    [req.params.id],
    (e, r) => {
      if (e) return res.status(500).send("Database error.");
      if (!r.length) return res.status(404).send("Not found");
      db.query("DELETE FROM alumni WHERE id=?", [req.params.id], (e) => {
        if (e) return res.status(500).send("Database error.");
        removeFile(r[0].profile_image);
        removeFile(r[0].resume, true);
        res.redirect("/");
      });
    },
  ),
);
app.get("/pdf/:id", (req, res) =>
  db.query("SELECT * FROM alumni WHERE id=?", [req.params.id], (e, r) => {
    if (e) return res.status(500).send("Database error.");
    if (!r.length) return res.status(404).send("Not found");
    const a = r[0],
      doc = new PDFDocument({
        margin: 45,
      });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="alumni-${a.id}.pdf"`,
    );
    doc.pipe(res);
    doc.fontSize(22).text("ALUMNI PROFILE", {
      align: "center",
    });
    doc.moveDown();
    if (a.profile_image) {
      const ip = path.join(uploadDir, path.basename(a.profile_image));
      if (fs.existsSync(ip))
        try {
          doc.image(ip, 420, 65, {
            width: 110,
            height: 110,
          });
        } catch {}
    }
    let y = 80;
    [
      ["Registration ID", a.id],
      ["Full Name", a.full_name],
      ["Email", a.email],
      ["Phone", a.phone],
      ["Date of Birth", a.dob],
      ["Gender", a.gender],
      ["Department", a.department],
      ["Graduation Year", a.graduation_year],
      ["CGPA", a.cgpa],
      ["Degree Program", a.degree_program],
      ["Employment Status", a.employment_status],
      ["Company", a.company],
      ["Job Title", a.job_title],
      ["Skills", a.skills],
      ["Contact Preference", a.contact_preference],
      ["LinkedIn", a.linkedin],
      ["Bio", a.bio],
      ["Newsletter", a.newsletter ? "Yes" : "No"],
    ].forEach(([k, v]) => {
      doc.font("Helvetica-Bold").text(k + ":", 50, y, {
        continued: true,
      });
      doc.font("Helvetica").text(" " + (v ?? ""), {
        width: 330,
      });
      y += 24;
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
    });
    doc
      .fontSize(9)
      .fillColor("gray")
      .text("Generated by Alumni Management System", {
        align: "center",
      });
    doc.end();
  }),
);
app.get("/pdf", (req, res) =>
  db.query(
    "SELECT id,full_name,email,department,graduation_year,employment_status FROM alumni ORDER BY id DESC",
    (e, rows) => {
      if (e) return res.status(500).send("Database error.");
      const doc = new PDFDocument({
        margin: 40,
        size: "A4",
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="alumni-list.pdf"',
      );
      doc.pipe(res);
      doc.fontSize(20).text("ALUMNI REGISTRATION LIST", {
        align: "center",
      });
      let y = 90;
      doc.fontSize(9).font("Helvetica-Bold");
      [
        ["ID", 40],
        ["Name", 75],
        ["Email", 220],
        ["Department", 335],
        ["Year", 445],
        ["Status", 485],
      ].forEach(([t, x]) => doc.text(t, x, y));
      y += 28;
      doc.font("Helvetica");
      rows.forEach((a) => {
        if (y > 760) {
          doc.addPage();
          y = 50;
        }
        doc.text(String(a.id), 40, y, {
          width: 30,
        });
        doc.text(a.full_name || "", 75, y, {
          width: 140,
          ellipsis: true,
        });
        doc.text(a.email || "", 220, y, {
          width: 105,
          ellipsis: true,
        });
        doc.text(a.department || "", 335, y, {
          width: 100,
          ellipsis: true,
        });
        doc.text(String(a.graduation_year || ""), 445, y);
        doc.text(a.employment_status || "", 485, y, {
          width: 70,
          ellipsis: true,
        });
        y += 20;
      });
      doc
        .fontSize(8)
        .fillColor("gray")
        .text("Total records: " + rows.length, 40, 780);
      doc.end();
    },
  ),
);
app.use((err, req, res, next) =>
  res.status(400).send(err.message || "Request error."),
);
app.listen(PORT, () =>
  console.log("Server running at http://localhost:" + PORT),
);
