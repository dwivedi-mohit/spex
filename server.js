const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static(__dirname));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

let waitingUser = null;

io.on('connection', (socket) => {
    console.log('Connected:', socket.id);

    // --- Queue Logic ---
    socket.on('join_queue', () => {
        console.log(`${socket.id} joining queue`);

        if (waitingUser && waitingUser.id !== socket.id) {
            const partner = waitingUser;
            waitingUser = null;

            socket.partnerID = partner.id;
            partner.partnerID = socket.id;

            // Tell both who the initiator is.
            // The newest joiner (socket) becomes the CALLER (creates offer).
            socket.emit('matched', { partnerID: partner.id, isInitiator: true });
            partner.emit('matched', { partnerID: socket.id, isInitiator: false });

            console.log(`Matched: ${socket.id} (caller) <-> ${partner.id} (callee)`);
        } else {
            waitingUser = socket;
            socket.emit('waiting');
        }
    });

    // --- WebRTC Signaling Relay ---
    socket.on('offer', (data) => {
        console.log(`Offer from ${socket.id} to ${data.to}`);
        io.to(data.to).emit('offer', { sdp: data.sdp, from: socket.id });
    });

    socket.on('answer', (data) => {
        console.log(`Answer from ${socket.id} to ${data.to}`);
        io.to(data.to).emit('answer', { sdp: data.sdp, from: socket.id });
    });

    socket.on('ice-candidate', (data) => {
        io.to(data.to).emit('ice-candidate', { candidate: data.candidate, from: socket.id });
    });

    // --- Next / Disconnect Logic ---
    socket.on('next', () => {
        console.log(`${socket.id} clicked Next`);
        notifyPartner(socket);
        socket.emit('rejoin_queue');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected:', socket.id);
        if (waitingUser === socket) waitingUser = null;
        notifyPartner(socket);
    });

    function notifyPartner(sock) {
        if (sock.partnerID) {
            const partner = io.sockets.sockets.get(sock.partnerID);
            if (partner) {
                partner.emit('partner_left');
                partner.partnerID = null;
            }
            sock.partnerID = null;
        }
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on port ${PORT}`));
