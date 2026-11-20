const fs = require("fs");
const path = require("path");

const BLUE = "#1b3a57";
const GRAY = "#5a6472";
const LINE = "#e0e5eb";
const STRIPE = "#f4f6f8";

// Built-in PDF fonts (Helvetica) only cover Latin text, so we draw safe strings.
function text(value) {
    return value === null || value === undefined ? "" : String(value);
}

// Cut a string so it fits inside `width` points, adding "..." if shortened.
// We measure with the font that is currently selected on the document.
function fit(doc, value, width) {
    let s = text(value);
    if (doc.widthOfString(s) <= width) return s;
    while (s.length > 1 && doc.widthOfString(s + "...") > width) {
        s = s.slice(0, -1);
    }
    return s + "...";
}

// Write "Generated ... Page X of Y" on every page after all content exists.
// Needs `bufferPages: true` when the document is created.
function addFooters(doc) {
    const range = doc.bufferedPageRange();
    const date = new Date().toISOString().slice(0, 10);

    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);

        // The footer sits inside the bottom margin. PDFKit starts a new page
        // if you write below the margin, so we zero it just for this line.
        const savedBottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;

        doc.font("Helvetica").fontSize(8).fillColor("#888888").text(
            `Alumni Management System  |  Generated ${date}  |  Page ${i + 1} of ${range.count}`,
            doc.page.margins.left,
            doc.page.height - 28,
            {
                width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
                align: "center",
                lineBreak: false
            }
        );

        doc.page.margins.bottom = savedBottom;
    }
}

/* ------------------------------------------------------------------
   One alumnus -> a one-page profile
------------------------------------------------------------------ */
function renderProfilePdf(doc, a, uploadDir) {
    const left = doc.page.margins.left;
    const contentWidth = doc.page.width - left - doc.page.margins.right;
    const pageBottom = () => doc.page.height - doc.page.margins.bottom - 20;

    // Header band
    doc.rect(0, 0, doc.page.width, 120).fill(BLUE);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(22)
        .text("ALUMNI PROFILE", left, 44, { lineBreak: false });
    doc.font("Helvetica").fontSize(10).fillColor("#c9d6e3")
        .text("Alumni Management System", left, 76, { lineBreak: false });

    // Circular profile photo on the right side of the band (JPG/PNG only)
    if (a.profile_photo) {
        const photoPath = path.join(uploadDir, path.basename(a.profile_photo));
        if (fs.existsSync(photoPath)) {
            try {
                const size = 84;
                const cx = doc.page.width - left - size / 2;
                const cy = 60;
                doc.save();
                doc.circle(cx, cy, size / 2).clip();
                doc.image(photoPath, cx - size / 2, cy - size / 2, {
                    cover: [size, size],
                    align: "center",
                    valign: "center"
                });
                doc.restore();
                doc.circle(cx, cy, size / 2).lineWidth(2).stroke("#ffffff");
            } catch (error) {
                console.error("PDF image skipped:", error.message);
            }
        }
    }

    // Name and subtitle
    let y = 145;
    doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(20)
        .text(fit(doc, a.full_name, contentWidth), left, y, { lineBreak: false });
    y += 28;

    const subtitle = [a.current_job, a.company].filter(Boolean).join(" at ") ||
        a.employment_status || "Alumnus";
    doc.fillColor(GRAY).font("Helvetica").fontSize(12)
        .text(fit(doc, subtitle, contentWidth), left, y, { lineBreak: false });
    y += 30;

    // Label / value rows
    const rows = [
        ["Email", a.email],
        ["Phone", a.phone],
        ["Location", [a.city, a.country].filter(Boolean).join(", ")],
        ["Degree", a.degree],
        ["Degree level", a.degree_level],
        ["Department", a.department],
        ["Batch (graduation year)", a.graduation_year],
        ["CGPA", a.cgpa],
        ["Employment status", a.employment_status],
        ["Job title", a.current_job],
        ["Company", a.company],
        ["Skills", a.skills],
        ["Preferred contact", a.contact_preference],
        ["LinkedIn", a.linkedin]
    ].filter(([, value]) => text(value).trim() !== "");

    const labelWidth = 150;
    const valueX = left + labelWidth + 10;
    const valueWidth = contentWidth - labelWidth - 10;

    rows.forEach(([label, value]) => {
        const str = text(value);
        const height = doc.font("Helvetica").fontSize(10).heightOfString(str, { width: valueWidth });

        if (y + height > pageBottom()) {
            doc.addPage();
            y = doc.page.margins.top;
        }

        doc.fillColor(GRAY).font("Helvetica-Bold").fontSize(10)
            .text(label, left, y, { width: labelWidth, lineBreak: false });
        doc.fillColor("#222222").font("Helvetica").fontSize(10)
            .text(str, valueX, y, { width: valueWidth });

        y += Math.max(height, 12) + 8;
        doc.moveTo(left, y - 4).lineTo(left + contentWidth, y - 4)
            .lineWidth(0.5).strokeColor(LINE).stroke();
    });

    // Bio paragraph
    if (text(a.bio).trim()) {
        y += 10;
        const bioHeight = doc.font("Helvetica").fontSize(10).heightOfString(text(a.bio), { width: contentWidth });

        if (y + 20 + bioHeight > pageBottom()) {
            doc.addPage();
            y = doc.page.margins.top;
        }

        doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(12).text("About", left, y, { lineBreak: false });
        y += 20;
        doc.fillColor("#222222").font("Helvetica").fontSize(10)
            .text(text(a.bio), left, y, { width: contentWidth });
    }

    addFooters(doc);
}

/* ------------------------------------------------------------------
   Many alumni -> a table that repeats its header on every page
------------------------------------------------------------------ */
function renderListPdf(doc, rows, q) {
    const left = doc.page.margins.left;
    const contentWidth = doc.page.width - left - doc.page.margins.right;
    const rowHeight = 22;
    const pageBottom = () => doc.page.height - doc.page.margins.bottom;

    // Column widths add up to the 515pt of usable width on A4 with 40pt margins
    const columns = [
        { title: "ID", width: 28 },
        { title: "Name", width: 112 },
        { title: "Email", width: 150 },
        { title: "Department", width: 105 },
        { title: "Year", width: 40 },
        { title: "Status", width: 80 }
    ];

    doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(20)
        .text("ALUMNI DIRECTORY", left, doc.page.margins.top, { lineBreak: false });

    const summary = `${rows.length} record${rows.length === 1 ? "" : "s"}` +
        (q ? ` matching "${q}"` : "");
    doc.fillColor(GRAY).font("Helvetica").fontSize(10)
        .text(fit(doc, summary, contentWidth), left, doc.page.margins.top + 28, { lineBreak: false });

    let y = doc.page.margins.top + 56;

    function drawHeader() {
        doc.rect(left, y, contentWidth, rowHeight).fill(BLUE);
        let x = left;
        doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9);
        columns.forEach((col) => {
            doc.text(col.title, x + 6, y + 7, { width: col.width - 8, lineBreak: false });
            x += col.width;
        });
        y += rowHeight;
    }

    drawHeader();

    if (rows.length === 0) {
        doc.fillColor(GRAY).font("Helvetica").fontSize(10)
            .text("No alumni found.", left + 6, y + 8, { lineBreak: false });
    }

    rows.forEach((a, index) => {
        if (y + rowHeight > pageBottom()) {
            doc.addPage();
            y = doc.page.margins.top;
            drawHeader();
        }

        if (index % 2 === 1) {
            doc.rect(left, y, contentWidth, rowHeight).fill(STRIPE);
        }

        const cells = [a.id, a.full_name, a.email, a.department, a.graduation_year, a.employment_status];
        let x = left;
        doc.fillColor("#222222").font("Helvetica").fontSize(9);
        cells.forEach((value, i) => {
            const w = columns[i].width - 8;
            doc.text(fit(doc, value, w), x + 6, y + 7, { width: w, lineBreak: false });
            x += columns[i].width;
        });

        y += rowHeight;
    });

    addFooters(doc);
}

module.exports = { renderProfilePdf, renderListPdf };
