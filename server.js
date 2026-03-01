const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
// Serve static files from the current directory
app.use(express.static(__dirname));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// A simple waiting queue for users looking to chat
let waitingUser = null;

// Utility to generate a random room ID
function generateRoomID(len = 7) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < len; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // When a user requests to join the anonymous chat queue
    socket.on('join_queue', () => {
        console.log(`User ${socket.id} joining queue`);
        
        // If there's no waiting user, this user becomes the waiting user
        if (!waitingUser) {
            waitingUser = socket;
            socket.emit('waiting', { message: "Waiting for a partner..." });
        } else {
            // A partner is available
            const roomID = generateRoomID();
            
            // Partner
            const partnerSocket = waitingUser;
            waitingUser = null; // Clear the queue

            // Join the socket.io room for signaling if needed (optional since we use ZegoCloud for actual video)
            socket.join(roomID);
            partnerSocket.join(roomID);

            // Notify both users of the match and provide the roomID
            socket.emit('room_matched', { roomID: roomID, partnerID: partnerSocket.id });
            partnerSocket.emit('room_matched', { roomID: roomID, partnerID: socket.id });

            // Store the partner info so we can handle 'next' or 'disconnect' events
            socket.partnerID = partnerSocket.id;
            partnerSocket.partnerID = socket.id;

            console.log(`Matched ${socket.id} with ${partnerSocket.id} in room ${roomID}`);
        }
    });

    // Handle "Next" button click
    socket.on('next', () => {
        console.log(`User ${socket.id} clicked Next`);
        
        // If this user has a partner, notify the partner
        if (socket.partnerID) {
            const partnerSocket = io.sockets.sockets.get(socket.partnerID);
            if (partnerSocket) {
                partnerSocket.emit('partner_left', { message: "Stranger has disconnected." });
                partnerSocket.partnerID = null;
            }
            socket.partnerID = null;
        }

        // Check if user was waiting
        if (waitingUser === socket) {
            waitingUser = null;
        }

        // Automatically re-queue the user who clicked Next
        socket.emit('rejoin_queue');
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        // If the user was in the queue waiting, remove them
        if (waitingUser === socket) {
            waitingUser = null;
        }

        // If the user had a partner, notify the partner
        if (socket.partnerID) {
            const partnerSocket = io.sockets.sockets.get(socket.partnerID);
            if (partnerSocket) {
                partnerSocket.emit('partner_left', { message: "Stranger has disconnected." });
                partnerSocket.partnerID = null;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
