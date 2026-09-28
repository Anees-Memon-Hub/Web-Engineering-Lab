<?php

require_once "db.php";


// ==========================================
// ONLY ALLOW POST REQUEST
// ==========================================

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    die("Invalid request.");
}


// ==========================================
// GET FORM DATA
// ==========================================

$full_name = trim($_POST["full_name"] ?? "");
$email = trim($_POST["email"] ?? "");
$phone = trim($_POST["phone"] ?? "");
$gender = trim($_POST["gender"] ?? "");
$date_of_birth = trim($_POST["date_of_birth"] ?? "");
$student_id = trim($_POST["student_id"] ?? "");
$degree = trim($_POST["degree"] ?? "");
$department = trim($_POST["department"] ?? "");
$graduation_year = intval($_POST["graduation_year"] ?? 0);

$current_job = trim($_POST["current_job"] ?? "");
$company = trim($_POST["company"] ?? "");

$city = trim($_POST["city"] ?? "");
$country = trim($_POST["country"] ?? "");
$address = trim($_POST["address"] ?? "");

$password = $_POST["password"] ?? "";
$confirm_password = $_POST["confirm_password"] ?? "";

$linkedin_url = trim($_POST["linkedin_url"] ?? "");

$skills = trim($_POST["skills"] ?? "");


// ==========================================
// REQUIRED FIELD VALIDATION
// ==========================================

$required_fields = [
    "Full Name" => $full_name,
    "Email" => $email,
    "Phone" => $phone,
    "Gender" => $gender,
    "Date of Birth" => $date_of_birth,
    "Student ID" => $student_id,
    "Degree" => $degree,
    "Department" => $department,
    "Graduation Year" => $graduation_year,
    "City" => $city,
    "Country" => $country,
    "Password" => $password
];

foreach ($required_fields as $field => $value) {

    if (empty($value)) {

        die(
            "<h2>Error</h2>
            <p>$field is required.</p>
            <a href='index.html'>Go Back</a>"
        );
    }
}


// ==========================================
// EMAIL VALIDATION
// ==========================================

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {

    die(
        "<h2>Error</h2>
        <p>Please enter a valid email address.</p>
        <a href='index.html'>Go Back</a>"
    );
}


// ==========================================
// PASSWORD VALIDATION
// ==========================================

if (strlen($password) < 6) {

    die(
        "<h2>Error</h2>
        <p>Password must contain at least 6 characters.</p>
        <a href='index.html'>Go Back</a>"
    );
}


if ($password !== $confirm_password) {

    die(
        "<h2>Error</h2>
        <p>Passwords do not match.</p>
        <a href='index.html'>Go Back</a>"
    );
}


// ==========================================
// GRADUATION YEAR VALIDATION
// ==========================================

if ($graduation_year < 1950 || $graduation_year > 2100) {

    die(
        "<h2>Error</h2>
        <p>Please enter a valid graduation year.</p>
        <a href='index.html'>Go Back</a>"
    );
}


// ==========================================
// LINKEDIN URL VALIDATION
// ==========================================

if ($linkedin_url !== "") {

    if (!filter_var($linkedin_url, FILTER_VALIDATE_URL)) {

        die(
            "<h2>Error</h2>
            <p>Please enter a valid LinkedIn URL.</p>
            <a href='index.html'>Go Back</a>"
        );
    }
}


// ==========================================
// CHECK DUPLICATE EMAIL
// ==========================================

$check_email = $conn->prepare(
    "SELECT id FROM alumni WHERE email = ?"
);

$check_email->bind_param(
    "s",
    $email
);

$check_email->execute();

$result = $check_email->get_result();

if ($result->num_rows > 0) {

    $check_email->close();

    die(
        "<h2>Error</h2>
        <p>This email is already registered.</p>
        <a href='index.html'>Go Back</a>"
    );
}

$check_email->close();


// ==========================================
// PROFILE PHOTO UPLOAD
// ==========================================

$profile_photo = NULL;

if (
    isset($_FILES["profile_photo"]) &&
    $_FILES["profile_photo"]["error"] !== UPLOAD_ERR_NO_FILE
) {

    // Check upload error

    if ($_FILES["profile_photo"]["error"] !== UPLOAD_ERR_OK) {

        die(
            "<h2>Error</h2>
            <p>There was a problem uploading the profile photo.</p>
            <a href='index.html'>Go Back</a>"
        );
    }


    // Maximum file size = 2 MB

    $max_size = 2 * 1024 * 1024;

    if ($_FILES["profile_photo"]["size"] > $max_size) {

        die(
            "<h2>Error</h2>
            <p>Profile photo must be smaller than 2 MB.</p>
            <a href='index.html'>Go Back</a>"
        );
    }


    // Check that the file is actually an image

    $image_info = getimagesize(
        $_FILES["profile_photo"]["tmp_name"]
    );

    if ($image_info === false) {

        die(
            "<h2>Error</h2>
            <p>The uploaded file is not a valid image.</p>
            <a href='index.html'>Go Back</a>"
        );
    }


    // Allowed MIME types

    $allowed_types = [
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp"
    ];


    $mime_type = $image_info["mime"];


    if (!array_key_exists($mime_type, $allowed_types)) {

        die(
            "<h2>Error</h2>
            <p>Only JPG, PNG, and WEBP images are allowed.</p>
            <a href='index.html'>Go Back</a>"
        );
    }


    // Create uploads directory if it doesn't exist

    $upload_directory = "uploads/";

    if (!is_dir($upload_directory)) {

        mkdir(
            $upload_directory,
            0755,
            true
        );
    }


    // Generate unique file name

    $extension = $allowed_types[$mime_type];

    $unique_name =
        uniqid("alumni_", true)
        . "."
        . $extension;


    $target_file =
        $upload_directory
        . $unique_name;


    // Move uploaded file

    if (
        !move_uploaded_file(
            $_FILES["profile_photo"]["tmp_name"],
            $target_file
        )
    ) {

        die(
            "<h2>Error</h2>
            <p>Unable to save the profile photo.</p>
            <a href='index.html'>Go Back</a>"
        );
    }


    $profile_photo = $target_file;
}


// ==========================================
// HASH PASSWORD
// ==========================================

$password_hash = password_hash(
    $password,
    PASSWORD_DEFAULT
);


// ==========================================
// INSERT DATA
// ==========================================

$sql = "
    INSERT INTO alumni
    (
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
    VALUES
    (
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
";


$stmt = $conn->prepare($sql);


if (!$stmt) {

    die(
        "<h2>Database Error</h2>
        <p>Could not prepare the SQL statement.</p>
        <a href='index.html'>Go Back</a>"
    );
}


// ==========================================
// BIND PARAMETERS
// ==========================================
//
// 8 strings
// 1 integer
// 9 strings
//
// Total = 18 parameters
//

$stmt->bind_param(
    "ssssssssisssssssssss",
    $full_name,
    $email,
    $phone,
    $gender,
    $date_of_birth,
    $student_id,
    $degree,
    $department,
    $graduation_year,
    $current_job,
    $company,
    $city,
    $country,
    $address,
    $password_hash,
    $profile_photo,
    $linkedin_url,
    $skills
);


// ==========================================
// EXECUTE
// ==========================================

if ($stmt->execute()) {

    echo "
    <!DOCTYPE html>

    <html lang='en'>

    <head>

        <meta charset='UTF-8'>

        <meta name='viewport'
              content='width=device-width, initial-scale=1.0'>

        <title>Registration Successful</title>

        <link rel='stylesheet'
              href='style.css'>

    </head>


    <body>

        <div class='success-container'>

            <div class='success-card'>

                <div class='success-icon'>
                    ✓
                </div>

                <h1>
                    Registration Successful!
                </h1>

                <p>
                    Welcome to the Alumni Registration System,
                    " . htmlspecialchars($full_name) . ".
                </p>

                <div class='success-links'>

                    <a href='index.html'>
                        Register Another Alumni
                    </a>

                    <a href='alumni.php'>
                        View Alumni Directory
                    </a>

                </div>

            </div>

        </div>

    </body>

    </html>
    ";

} else {

    echo "
    <h2>Registration Failed</h2>

    <p>
        Something went wrong while saving your information.
    </p>

    <p>
        Error: " . htmlspecialchars($stmt->error) . "
    </p>

    <a href='index.html'>
        Go Back
    </a>
    ";
}


$stmt->close();

$conn->close();

?>