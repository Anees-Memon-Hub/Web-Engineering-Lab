CREATE DATABASE IF NOT EXISTS alumni_db;
USE alumni_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alumni (
 id INT AUTO_INCREMENT PRIMARY KEY, full_name VARCHAR(100) NOT NULL, email VARCHAR(100) NOT NULL,
 password VARCHAR(255) NOT NULL, phone VARCHAR(30), dob DATE, gender VARCHAR(20), department VARCHAR(100),
 graduation_year INT, cgpa DECIMAL(3,2), degree_program VARCHAR(100), employment_status VARCHAR(50),
 company VARCHAR(150), job_title VARCHAR(100), skills TEXT, contact_preference VARCHAR(50), linkedin VARCHAR(255),
 bio TEXT, newsletter BOOLEAN DEFAULT FALSE, terms_accepted BOOLEAN DEFAULT FALSE, profile_image VARCHAR(255),
 resume VARCHAR(255), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
