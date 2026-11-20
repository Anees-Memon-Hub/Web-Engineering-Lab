// Lab 11: real-time chat (Socket.IO) for the Alumni Management System.
//
// How it differs from the plain lab demo:
//   * Only signed-in alumni can connect: the socket re-uses the Express session.
//   * The sender's name and id come from that session on the SERVER, so a
//     browser can never pretend to be someone else.
//   * Messages are saved in MySQL (chat_messages) so new visitors see recent history.
//   * "Online" is counted per person, not per browser tab.

const MAX_MESSAGE_LENGTH = 500;
const HISTORY_LIMIT = 50;
const MIN_SECONDS_BETWEEN_MESSAGES = 0.4;   // tiny flood guard per connection

module.exports = function setupChat(io, sessionMiddleware, pool) {
    // Share the login session with Socket.IO. Every handshake request now has req.session.
    io.engine.use(sessionMiddleware);

    // Gate: refuse the connection unless the session holds a logged-in alumnus.
    io.use((socket, next) => {
        const user = socket.request.session && socket.request.session.user;
        if (!user) return next(new Error("unauthorized"));
        socket.data.user = { id: user.id, name: user.name };
        next();
    });

    // userId -> { name, sockets: number }   (same person in 2 tabs = 1 online user)
    const online = new Map();

    const onlineList = () =>
        [...online.entries()].map(([id, u]) => ({ id, name: u.name }))
            .sort((a, b) => a.name.localeCompare(b.name));

    const broadcastOnline = () => io.emit("online users", onlineList());

    async function loadHistory() {
        try {
            const [rows] = await pool.query(
                `SELECT id, user_id AS userId, sender_name AS name, message,
                        UNIX_TIMESTAMP(created_at) * 1000 AS ts
                 FROM chat_messages ORDER BY id DESC LIMIT ?`, [HISTORY_LIMIT]
            );
            return rows.reverse().map((r) => ({ ...r, ts: Number(r.ts) }));
        } catch (error) {
            // Most likely the chat_messages table has not been created yet.
            console.error("Chat history unavailable:", error.code || error.message);
            return [];
        }
    }

    async function saveMessage(user, text) {
        try {
            await pool.execute(
                "INSERT INTO chat_messages (user_id, sender_name, message) VALUES (?, ?, ?)",
                [user.id, user.name, text]
            );
        } catch (error) {
            console.error("Chat message not saved:", error.code || error.message);
        }
    }

    io.on("connection", async (socket) => {
        const user = socket.data.user;

        // A private room per person lets us kick all of their tabs out on logout.
        socket.join(`user:${user.id}`);

        const entry = online.get(user.id);
        const isFirstTab = !entry;
        if (entry) entry.sockets++;
        else online.set(user.id, { name: user.name, sockets: 1 });

        console.log(`Chat: ${user.name} connected (${online.size} online)`);

        // Tell this browser who it is, and give it the recent history.
        socket.emit("welcome", { me: user, history: await loadHistory() });
        broadcastOnline();
        if (isFirstTab) {
            socket.broadcast.emit("user notification", `${user.name} joined the chat.`);
        }

        let lastSent = 0;

        socket.on("chat message", async (text) => {
            if (typeof text !== "string") return;   // ignore anything that is not plain text
            const message = text.trim().slice(0, MAX_MESSAGE_LENGTH);
            if (!message) return;

            const now = Date.now();
            if (now - lastSent < MIN_SECONDS_BETWEEN_MESSAGES * 1000) return;
            lastSent = now;

            // Show it to everyone straight away, save it in the background.
            io.emit("chat message", { userId: user.id, name: user.name, message, ts: now });
            socket.broadcast.emit("stop typing", { userId: user.id });
            saveMessage(user, message);
        });

        socket.on("typing", () => {
            socket.broadcast.emit("typing", { userId: user.id, name: user.name });
        });

        socket.on("stop typing", () => {
            socket.broadcast.emit("stop typing", { userId: user.id });
        });

        socket.on("disconnect", () => {
            const current = online.get(user.id);
            if (!current) return;
            current.sockets--;
            if (current.sockets <= 0) {
                online.delete(user.id);
                socket.broadcast.emit("stop typing", { userId: user.id });
                socket.broadcast.emit("user notification", `${user.name} left the chat.`);
            }
            console.log(`Chat: ${user.name} disconnected (${online.size} online)`);
            broadcastOnline();
        });
    });
};
