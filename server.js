document.addEventListener("DOMContentLoaded", () => {
    const startbtn = document.querySelector("#start-btn");
    const resultDiv = document.querySelector("#result");
    const usernameInput = document.querySelector("#username"); // Reference to the username input
    const socket = new WebSocket("ws://localhost:8686"); // WebSocket URL

    // Ensure that the WebSocket connection is open before sending data
    function sendToServer(username, command) {
        if (socket.readyState === WebSocket.OPEN) {
            const message = { username, command };
            socket.send(JSON.stringify(message)); // Send as a JSON string
            console.log("Sent to server:", message);
        } else {
            console.error("WebSocket not connected. Try again later.");
        }
    }

    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.continuous = true;
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    startbtn.addEventListener("click", () => {
        recognition.start();
    });

    recognition.onresult = (e) => {
        const transcript = e.results[e.results.length - 1][0].transcript.trim(); // Trim whitespace
        resultDiv.innerText = `You said: "${transcript}"`;

        const username = usernameInput.value.trim(); // Get the username input

        if (username) {
            sendToServer(username, transcript); // Send both username and command if username is provided
        } else {
            sendToServer("Anonymous", transcript); // Send "Anonymous" if no username is provided
        }
    };

    recognition.onerror = (event) => {
        console.error(`Error occurred in recognition: ${event.error}`);
    };

    recognition.onend = () => {
        console.log("Recognition ended. Restarting...");
        recognition.start();
    };

    socket.onopen = () => {
        console.log("Connected to WebSocket server.");
    };

    socket.onerror = (error) => {
        console.error(`WebSocket error: ${error}`);
    };

    socket.onclose = () => {
        console.log("WebSocket connection closed.");
    };
});

