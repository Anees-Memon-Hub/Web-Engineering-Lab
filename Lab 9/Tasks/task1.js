
const express = require("express");
const app = express();
const port = 8000;

// Login middleware
const login = (req, res, next) => {
    if (req.params.id == 1234) {
        next();
    } else {
        res.send("User ID is not valid");
    }
};

// Protected salary route
app.get("/salary/:id", login, (req, res) => {
    res.send("User salary is 20K");
});

// Login route
app.get("/login/:id", login, (req, res) => {
    res.send("This route is protected and login successful");
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
