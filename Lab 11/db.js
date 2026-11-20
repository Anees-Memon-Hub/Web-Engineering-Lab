require("dotenv").config();
const mysql = require("mysql2/promise");

// Free MySQL hosts (like freedb.tech) allow each user only a few simultaneous
// connections, and they keep idle ones alive for a while. So the pool is kept
// small, and idle connections are given back quickly.
// One connection is enough for a lab app: requests simply take turns.
// If your host allows more, raise it with DB_POOL_LIMIT=3 in .env.
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: "utf8mb4",
    dateStrings: true,      // return DATE / TIMESTAMP as plain text, not JS Date objects
    waitForConnections: true,   // extra requests wait in line instead of failing
    connectionLimit: Number(process.env.DB_POOL_LIMIT) || 1,
    maxIdle: 1,             // keep at most 1 idle connection open
    idleTimeout: 10000      // close an idle connection after 10 seconds
});

module.exports = pool;
