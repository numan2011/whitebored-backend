const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the current directory
app.use(express.static(__dirname));

// Store drawing history to send to new clients
// In a production app, this might be in a database or Redis
let drawingHistory = [];

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Send existing history to the new client
  socket.emit('history', drawingHistory);

  // Handle drawing events
  socket.on('draw', (data) => {
    // Add to history
    drawingHistory.push(data);
    
    // Broadcast to all other clients (excluding sender)
    socket.broadcast.emit('draw', data);
  });

  // Handle clear canvas event
  socket.on('clear', () => {
    drawingHistory = [];
    io.emit('clear');
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
