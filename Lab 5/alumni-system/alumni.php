<?php

require_once "db.php";


// ==========================================
// GET ALL ALUMNI
// ==========================================

$sql = "
    SELECT
        id,
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
        profile_photo,
        linkedin_url,
        skills,
        created_at
    FROM alumni
    ORDER BY id DESC
";


$result = $conn->query($sql);


if (!$result) {

    die(
        "Database query failed: "
        . htmlspecialchars($conn->error)
    );
}

?>


<!DOCTYPE html>

<html lang="en">

<head>

    <meta charset="UTF-8">

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >

    <title>Alumni Directory</title>

    <link
        rel="stylesheet"
        href="style.css"
    >

</head>


<body>


<header class="site-header">

    <div class="container">

        <h1>
            Alumni Registration System
        </h1>


        <nav>

            <a href="index.html">
                Register
            </a>

            <a href="alumni.php">
                Alumni Directory
            </a>

        </nav>

    </div>

</header>


<main class="container directory-container">


    <div class="page-heading">

        <h2>
            Alumni Directory
        </h2>

        <p>
            Registered alumni members
        </p>

    </div>


    <?php if ($result->num_rows > 0): ?>


        <div class="table-wrapper">

            <table class="alumni-table">

                <thead>

                    <tr>

                        <th>
                            Photo
                        </th>

                        <th>
                            Name
                        </th>

                        <th>
                            Email
                        </th>

                        <th>
                            Phone
                        </th>

                        <th>
                            Gender
                        </th>

                        <th>
                            Student ID
                        </th>

                        <th>
                            Degree
                        </th>

                        <th>
                            Department
                        </th>

                        <th>
                            Graduation
                        </th>

                        <th>
                            Job
                        </th>

                        <th>
                            Company
                        </th>

                        <th>
                            Skills
                        </th>

                        <th>
                            Location
                        </th>

                        <th>
                            LinkedIn
                        </th>

                    </tr>

                </thead>


                <tbody>


                    <?php while ($row = $result->fetch_assoc()): ?>


                        <tr>


                            <!-- PHOTO -->

                            <td>

                                <?php if (!empty($row["profile_photo"])): ?>

                                    <img
                                        src="<?php echo htmlspecialchars($row["profile_photo"]); ?>"
                                        alt="Profile Photo"
                                        class="profile-photo"
                                    >

                                <?php else: ?>

                                    <div class="no-photo">
                                        N/A
                                    </div>

                                <?php endif; ?>

                            </td>


                            <!-- NAME -->

                            <td>

                                <strong>

                                    <?php
                                    echo htmlspecialchars(
                                        $row["full_name"]
                                    );
                                    ?>

                                </strong>

                            </td>


                            <!-- EMAIL -->

                            <td>

                                <?php
                                echo htmlspecialchars(
                                    $row["email"]
                                );
                                ?>

                            </td>


                            <!-- PHONE -->

                            <td>

                                <?php
                                echo htmlspecialchars(
                                    $row["phone"]
                                );
                                ?>

                            </td>


                            <!-- GENDER -->

                            <td>

                                <?php
                                echo htmlspecialchars(
                                    $row["gender"]
                                );
                                ?>

                            </td>


                            <!-- STUDENT ID -->

                            <td>

                                <?php
                                echo htmlspecialchars(
                                    $row["student_id"]
                                );
                                ?>

                            </td>


                            <!-- DEGREE -->

                            <td>

                                <?php
                                echo htmlspecialchars(
                                    $row["degree"]
                                );
                                ?>

                            </td>


                            <!-- DEPARTMENT -->

                            <td>

                                <?php
                                echo htmlspecialchars(
                                    $row["department"]
                                );
                                ?>

                            </td>


                            <!-- GRADUATION -->

                            <td>

                                <?php
                                echo htmlspecialchars(
                                    $row["graduation_year"]
                                );
                                ?>

                            </td>


                            <!-- JOB -->

                            <td>

                                <?php

                                if (!empty($row["current_job"])) {

                                    echo htmlspecialchars(
                                        $row["current_job"]
                                    );

                                } else {

                                    echo "N/A";

                                }

                                ?>

                            </td>


                            <!-- COMPANY -->

                            <td>

                                <?php

                                if (!empty($row["company"])) {

                                    echo htmlspecialchars(
                                        $row["company"]
                                    );

                                } else {

                                    echo "N/A";

                                }

                                ?>

                            </td>


                            <!-- SKILLS -->

                            <td class="skills-cell">

                                <?php

                                if (!empty($row["skills"])) {

                                    echo htmlspecialchars(
                                        $row["skills"]
                                    );

                                } else {

                                    echo "N/A";

                                }

                                ?>

                            </td>


                            <!-- LOCATION -->

                            <td>

                                <?php
                                echo htmlspecialchars(
                                    $row["city"]
                                );
                                ?>

                                ,

                                <?php
                                echo htmlspecialchars(
                                    $row["country"]
                                );
                                ?>

                            </td>


                            <!-- LINKEDIN -->

                            <td>

                                <?php

                                if (!empty($row["linkedin_url"])):

                                ?>

                                    <a
                                        href="<?php echo htmlspecialchars($row["linkedin_url"]); ?>"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="linkedin-link"
                                    >
                                        View Profile
                                    </a>

                                <?php else: ?>

                                    N/A

                                <?php endif; ?>

                            </td>


                        </tr>


                    <?php endwhile; ?>


                </tbody>

            </table>

        </div>


    <?php else: ?>


        <div class="empty-state">

            <h3>
                No Alumni Registered
            </h3>

            <p>
                There are currently no alumni records.
            </p>

            <a href="index.html">
                Register First Alumni
            </a>

        </div>


    <?php endif; ?>


</main>


<footer class="site-footer">

    <p>
        Alumni Registration System &copy; 2026
    </p>

</footer>


</body>

</html>


<?php

$conn->close();

?>