-- Alumni Management System - database schema
-- Run this in phpMyAdmin (SQL tab) AFTER selecting your database.
-- On freedb.tech the database already exists, so there is no CREATE DATABASE here.

CREATE TABLE IF NOT EXISTS alumni (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    phone VARCHAR(20) NOT NULL,
    gender VARCHAR(20) NOT NULL,
    date_of_birth DATE NOT NULL,
    student_id VARCHAR(50) NOT NULL,
    degree VARCHAR(100) NOT NULL,
    degree_level VARCHAR(10),
    department VARCHAR(100) NOT NULL,
    graduation_year YEAR NOT NULL,
    cgpa DECIMAL(3,2),
    current_job VARCHAR(150),
    company VARCHAR(150),
    employment_status VARCHAR(50),
    skills TEXT,
    contact_preference VARCHAR(50),
    linkedin VARCHAR(255),
    bio TEXT,
    city VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL,
    address TEXT,
    profile_photo VARCHAR(255),
    resume VARCHAR(255),
    newsletter BOOLEAN DEFAULT FALSE,
    terms_accepted BOOLEAN DEFAULT FALSE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------
-- Lab 7 upgrade: if your `alumni` table already has data from
-- Labs 5/6, DO NOT drop it. Run these ALTER statements instead to
-- add the new columns without losing existing registrations.
-- ---------------------------------------------------------------
-- ALTER TABLE alumni ADD COLUMN degree_level VARCHAR(10) AFTER degree;
-- ALTER TABLE alumni ADD COLUMN cgpa DECIMAL(3,2) AFTER graduation_year;
-- ALTER TABLE alumni ADD COLUMN employment_status VARCHAR(50) AFTER company;
-- ALTER TABLE alumni ADD COLUMN skills TEXT AFTER employment_status;
-- ALTER TABLE alumni ADD COLUMN contact_preference VARCHAR(50) AFTER skills;
-- ALTER TABLE alumni ADD COLUMN linkedin VARCHAR(255) AFTER contact_preference;
-- ALTER TABLE alumni ADD COLUMN bio TEXT AFTER linkedin;
-- ALTER TABLE alumni ADD COLUMN resume VARCHAR(255) AFTER profile_photo;
-- ALTER TABLE alumni ADD COLUMN newsletter BOOLEAN DEFAULT FALSE AFTER resume;
-- ALTER TABLE alumni ADD COLUMN terms_accepted BOOLEAN DEFAULT FALSE AFTER newsletter;

-- The dashboard cards "Events" and "Jobs Posted" count rows in these two tables.
CREATE TABLE IF NOT EXISTS events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    event_date DATE NOT NULL,
    location VARCHAR(150)
);

CREATE TABLE IF NOT EXISTS jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    company VARCHAR(150) NOT NULL,
    posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sample rows so the dashboard has something to show
INSERT INTO events (title, event_date, location) VALUES
    ('Annual Alumni Reunion', '2026-12-20', 'Main Campus'),
    ('Career Fair', '2026-11-15', 'Auditorium'),
    ('Tech Talk: Web Engineering', '2026-10-30', 'Online');

INSERT INTO jobs (title, company) VALUES
    ('Junior Web Developer', 'TechNova'),
    ('Data Analyst', 'DataBridge'),
    ('QA Engineer', 'SoftServe'),
    ('Marketing Executive', 'BrandWorks');

-- ---------------------------------------------------------------
-- Lab 11: chat history. Run this once (phpMyAdmin, SQL tab).
-- The chat still works without it, but messages will not be saved.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    sender_name VARCHAR(100) NOT NULL,
    message VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_chat_user FOREIGN KEY (user_id) REFERENCES alumni(id) ON DELETE SET NULL
);
