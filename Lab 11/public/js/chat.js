// Lab 11: browser side of the alumni chat.
// Names come from the server (the login session); this file only displays them.
// textContent is used everywhere, so a message can never inject HTML.

(function () {
    const socket = io();

    const statusEl = document.getElementById("chatStatus");
    const messagesEl = document.getElementById("chatMessages");
    const typingEl = document.getElementById("typingIndicator");
    const inputEl = document.getElementById("messageInput");
    const sendBtn = document.getElementById("sendButton");
    const onlineListEl = document.getElementById("onlineList");
    const onlineCountEl = document.getElementById("onlineCount");

    let me = null;
    const typers = new Map();          // userId -> name of people currently typing
    const typerTimeouts = new Map();   // safety: forget a typer if "stop typing" is lost
    let iAmTyping = false;
    let typingTimer = null;

    /* ---------- helpers ---------- */
    function setConnected(connected, text) {
        statusEl.textContent = text;
        statusEl.classList.toggle("is-online", connected);
        inputEl.disabled = !connected;
        sendBtn.disabled = !connected;
    }

    function scrollToBottom() {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function formatTime(ts) {
        return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    function addMessage(msg) {
        const mine = me && msg.userId === me.id;
        const row = document.createElement("div");
        row.className = "chat-message " + (mine ? "mine" : "theirs");

        const meta = document.createElement("div");
        meta.className = "chat-meta";
        meta.textContent = (mine ? "You" : msg.name) + " · " + formatTime(msg.ts);

        const body = document.createElement("div");
        body.className = "chat-text";
        body.textContent = msg.message;

        row.append(meta, body);
        messagesEl.appendChild(row);
        scrollToBottom();
    }

    function addNotice(text) {
        const note = document.createElement("div");
        note.className = "chat-notice";
        note.textContent = text;
        messagesEl.appendChild(note);
        scrollToBottom();
    }

    function renderTyping() {
        const names = [...typers.values()];
        if (names.length === 0) typingEl.textContent = "";
        else if (names.length === 1) typingEl.textContent = names[0] + " is typing...";
        else if (names.length === 2) typingEl.textContent = names[0] + " and " + names[1] + " are typing...";
        else typingEl.textContent = "Several people are typing...";
    }

    function forgetTyper(userId) {
        typers.delete(userId);
        clearTimeout(typerTimeouts.get(userId));
        typerTimeouts.delete(userId);
        renderTyping();
    }

    function renderOnline(list) {
        onlineCountEl.textContent = list.length;
        onlineListEl.replaceChildren(...list.map((person) => {
            const li = document.createElement("li");
            li.textContent = person.name + (me && person.id === me.id ? " (you)" : "");
            return li;
        }));
    }

    /* ---------- sending ---------- */
    function sendMessage() {
        const text = inputEl.value.trim();
        if (!text) return;
        socket.emit("chat message", text);
        inputEl.value = "";
        clearTimeout(typingTimer);
        if (iAmTyping) socket.emit("stop typing");
        iAmTyping = false;
        inputEl.focus();
    }

    sendBtn.addEventListener("click", sendMessage);

    inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            sendMessage();
        }
    });

    // Typing indicator: say "typing" once, then "stop typing" after 1 second of silence.
    inputEl.addEventListener("input", () => {
        if (!inputEl.value) return;
        if (!iAmTyping) {
            socket.emit("typing");
            iAmTyping = true;
        }
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            socket.emit("stop typing");
            iAmTyping = false;
        }, 1000);
    });

    /* ---------- receiving ---------- */
    socket.on("connect", () => setConnected(true, "Connected"));

    socket.on("disconnect", () => {
        setConnected(false, "Disconnected. Trying to reconnect...");
        typers.clear();
        renderTyping();
    });

    socket.on("connect_error", (err) => {
        if (err.message === "unauthorized") {
            setConnected(false, "Your session has expired. Please sign in again.");
            socket.disconnect();
        } else {
            setConnected(false, "Cannot reach the chat server. Retrying...");
        }
    });

    // Sent once per (re)connection: who am I, and what was said recently?
    socket.on("welcome", (data) => {
        me = data.me;
        messagesEl.replaceChildren();
        if (data.history.length === 0) addNotice("No messages yet. Say hello!");
        data.history.forEach(addMessage);
        addNotice("You joined the chat.");
    });

    socket.on("chat message", (msg) => {
        forgetTyper(msg.userId);
        addMessage(msg);
    });

    socket.on("user notification", addNotice);

    socket.on("online users", renderOnline);

    socket.on("typing", ({ userId, name }) => {
        typers.set(userId, name);
        clearTimeout(typerTimeouts.get(userId));
        typerTimeouts.set(userId, setTimeout(() => forgetTyper(userId), 3000));
        renderTyping();
    });

    socket.on("stop typing", ({ userId }) => forgetTyper(userId));
})();
