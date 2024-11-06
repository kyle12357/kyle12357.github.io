const { Client } = require('att-client'); // main att client 
const { myUserConfig } = require('./config');
const fs = require('fs');

const bot = new Client(myUserConfig);
let server_id = 1408853496;
const connections = [];
const databaseFileName = 'data.json';
let PlayerDic = {}

function jsonContainsString(obj, searchString) {
    if (typeof obj === 'string') {
        return obj.indexOf(searchString) !== -1;
    }

    if (Array.isArray(obj)) {
        return obj.some(item => jsonContainsString(item, searchString));
    }

    if (typeof obj === 'object' && obj !== null) {
        return Object.values(obj).some(value => jsonContainsString(value, searchString));
    }
    
    return false;
}

class Vector3 {
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    normalize() {
        const length = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
        return new Vector3(this.x / length, this.y / length, this.z / length);
    }

    multiply(scalar) {
        return new Vector3(this.x * scalar, this.y * scalar, this.z * scalar);
    }
}

function getDistance(pos1, pos2) {
    const deltaX = pos1[0] - pos2[0];
    const deltaY = pos1[1] - pos2[1];
    const deltaZ = pos1[2] - pos2[2];
    
    return Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
}

async function main() {
    await bot.start(); // starts the bot
    bot.openServerConnection(server_id); // opens a connection to the server

    bot.on('connect', connection => { // this event fires when the bot connects to the server
        console.log(`Console connection established to ${connection.server.name}.`);
        connections.push(connection); // stores the connection for later use

        function say(player, message, duration) {
            connection.send(`player message "${player}" "${message}" ${duration}`);
        }
        
        let users = []; // Example initialization
        
        async function saveUsersToFile() {
            try {
                await fs.promises.writeFile(databaseFileName, JSON.stringify(users, null, 2), 'utf8');
                console.log('User data saved to data.json');
            } catch (err) {
                console.error('Error writing to data.json:', err);
            }
        }
        
        function calculateXpForNextLevel(level) {
            return (level + 1) * 100; // Example XP calculation
        }
        
        async function handleXpGain(user) {
            let xpNeeded = calculateXpForNextLevel(user.level);
        
            while (user.xp >= xpNeeded) {
                user.level += 1; // Level up
                user.xp -= xpNeeded; // Deduct the XP needed to level up
                console.log(`User ${user.username} leveled up to level ${user.level}!`);
        
                // Send level-up message to the user
                say(user.id, `You leveled up to level ${user.level}!`, 2);
        
                // Recalculate the new XP needed for the next level
                xpNeeded = calculateXpForNextLevel(user.level);
            }
        }
        
        function updateUser(userId, username, position) {
            const userIndex = users.findIndex(user => user.id === userId);
            if (userIndex !== -1) {
                // Update existing user
                users[userIndex].username = username;
                users[userIndex].position = position;
            } else {
                // Add new user
                users.push({ username, id: userId, position, level: 0, xp: 0 });
                console.log(`Player joined: ${username} (ID: ${userId}, Position: ${position})`);
            }
            saveUsersToFile(); // Save users to the file
        }
        
        // Subscribe to object killed event
        connection.subscribe('ObjectKilled', async (message) => {
            const { name, killerPlayer } = message.data;
        
            if (!killerPlayer || !killerPlayer.id) {
                console.error('No valid killerPlayer found.');
                return;
            }
        
            const killerUserId = killerPlayer.id || killerPlayer.userId;
            const xpGained = calculateXp(name);
        
            if (xpGained > 0) {
                await completeTask(killerUserId, killerPlayer.username, xpGained, name);
            } else {
                console.error('No XP awarded for this object.');
            }
        });
        
        function calculateXp(objectName) {
            const xpMap = {
                "Spriggull(Clone)": 5,
                "Wyrm(Clone)": 15,
                "Turabada Short Variant(Clone)": 10,
                "Turabada(Clone)": 20,
                "Turabada Large Variant(Clone)": 25,
                "Turabada Copper Variant(Clone)": 25,
                "Turabada Gold Variant(Clone)": 15,
                "Turabada Iron Variant(Clone)": 30,
                "Turabada Silver Variant(Clone)": 40,
                "Turabada Mythril Variant(Clone)": 100,
                "Gotera(Clone)": 15,
                "Crystal Gem Blue(Clone)": 10000
            };
            return xpMap[objectName] || 0;
        }
        
        async function completeTask(userId, username, xpGained, objectName) {
            let user = users.find(u => u.id === userId);
        
            if (!user) {
                user = { id: userId, username, level: 0, xp: 0 };
                users.push(user);
                console.log(`New user ${username} added with level 0 and ${xpGained} XP.`);
            }
        
            user.xp += xpGained;
            console.log(`${username} gained ${xpGained} XP.`);
            await handleXpGain(user);
            say(username, `You have gained ${xpGained} XP`, 2);
            await saveUsersToFile();
        
            processPlayers(); // Initiate player processing
        }
        
        async function processPlayers() {
            try {
                const resp = await connection.send('player list-detailed');
                const players = resp.data.Result;
        
                if (!Array.isArray(players)) return;
        
                for (const player of players) {
                    await handlePlayer(player);
                }
            } catch (err) {
                console.error('Error fetching player list:', err);
            }
        }
        
        async function handlePlayer(player) {
            const id = player.id;
        
            // Check if player has a space in their JSON representation
            if (jsonContainsString(player, " ")) {
                const rHandOnFace = getDistance(player.RightHandPosition, player.HeadPosition) <= 0.21;
                const lHandOnFace = getDistance(player.LeftHandPosition, player.HeadPosition) <= 0.21;
        
                const user = users.find(u => u.id === id);
                if (!user) return; // Ensure user exists
        
                const resp = await connection.send(`player inventory ${id}`);
                const inventory = resp.data.Result[0];
        
                // Safely access RightHand and LeftHand properties
                const RightHand = inventory?.RightHand || '';
                const LeftHand = inventory?.LeftHand || '';
        
                const hasShortSwordl = jsonContainsString(LeftHand, "Short Sword");
                const hasShortSwordr = jsonContainsString(RightHand, "Short Sword");
        
                // Check left hand conditions
                if (hasShortSwordl && user.level >= 1 && rHandOnFace) {
                    say(id, "You have casted Rizz", 2);
                    console.log(`User ${user.username} successfully cast "Rizz".`);
                }
        
                // Check right hand conditions
                if (hasShortSwordr && user.level >= 1 && lHandOnFace) {
                    say(id, "You have casted test", 2);
                    console.log(`User ${user.username} successfully cast "test".`);
                }
            }
        }


        
        const WebSocket = require('ws');
        const wss = new WebSocket.Server({ port: 8686 });
        
        let awaitingPlayerInput = false; // Define awaitingPlayerInput here
        
        // Dictionary to map words like "one", "two", etc. to their corresponding numbers
        const wordToNumberMap = {
            "one": 1,
            "1": 1,
            "two": 2,
            "2": 2,
            "too": 2,
            "three": 3,
            "four": 4,
            "five": 5,
            "six": 6,
            "seven": 7,
            "eight": 8,
            "nine": 9,
            "ten": 10
        };
        
        // WebSocket connection handling
        wss.on('connection', (ws) => {
            console.log('Client connected');
        
            // Handle incoming messages from the WebSocket client
            ws.on('message', async (message) => { // Make the handler async for await usage
                let msg; // Declare msg variable
                let username; // Declare username variable
        
                try {
                    const parsedMessage = JSON.parse(message); // Parse the incoming message as JSON
                    console.log('Received parsed message:', parsedMessage); // Log the parsed message
        
                    msg = parsedMessage.command.toLowerCase().trim(); // Extract command and process it
                    username = parsedMessage.username; // Get username if necessary
                } catch (error) {
                    console.log('Error parsing message:', error);
                    return; // Return early if message is invalid
                }
        
                console.log('Processed message:', msg); // Log the processed message
        
                if (awaitingPlayerInput) {
                    // Process player number input (words like "one", "two", etc.)
                    const playerNumber = wordToNumberMap[msg]; // Map word to number
        
                    if (playerNumber && PlayerDic[playerNumber]) {
                        target = PlayerDic[playerNumber]; // Set the target based on the player number
                        connection.send(`player message ${username} "Targeting ${target}" 4`);
                    } else {
                        connection.send(`player message ${username} "Invalid player number. Please try again." 4`);
                    }
                    awaitingPlayerInput = false; // Reset the input flag
                    return; // Exit the function to avoid processing further commands
                }
        
                switch (msg) {
                    case "hi":
                        console.log("Running command from speech recognition...");
                        connection.send(`player message ${username} "Hello" 2`);
                        break;
        
                    case "player list":
                        // Create a dictionary of players
                        for (let i = 0; i < connection.server.players.length; i++) {
                            const name = connection.server.players[i].username.replace(' ', '').toLowerCase();
                            PlayerDic[i + 1] = name; // Assign player numbers starting from 1
                        }
        
                        // Format the message to display players with their corresponding numbers
                        const playerListMessage = Object.entries(PlayerDic).map(([num, player]) => `${num}: ${player}`).join('\n');
                        connection.send(`player message ${username} "${playerListMessage}" 5`);
        
                        // Set the flag to await player number input
                        awaitingPlayerInput = true;
                        break;
        
                    case "go to":
                        console.log("Running command from speech recognition...");
                        if (target) {
                            connection.send(`player message ${username} "Went to ${target}" 2`);
                            connection.send(`player teleport ${username} ${target}`);
                        } else {
                            connection.send(`player message ${username} "No target selected. Please select a player first." 4`);
                        }
                        break;
        
                    default:
                        console.log(`Unrecognized command: ${msg}`);
                }
            });
        
            ws.on('close', () => {
                console.log('Client disconnected');
            });
        });
        
        
        
    


        
        
        
        
                           
        
        
    
        
        
    
        
        
        
        // Set interval to process players every 5 seconds
        setInterval(processPlayers, 5000);
    });
}

main()
