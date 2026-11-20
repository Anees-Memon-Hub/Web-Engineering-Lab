const express = require("express");
const session = require("express-session");

const app = express();
app.use(express.json());

const port = 8000;

// Session configuration
app.use(session({
    secret: "mysecretkey",
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 5 // 5 minutes
    }
}));

// Login route
app.get("/login", (req, res) => {
    req.session.user = {
        name: "Anees",
        age: 20
    };

    res.send("Successfully logged in");
});

// Protected route
app.get("/protected_route", (req, res) => {
    if (req.session.user) {
        res.send("You can access this route");
    } else {
        res.send("Please login first");
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
