require('dotenv').config();
const http=require('http');
const app=require('./app');
const { initializeSocket } = require('./socket');

const PORT=process.env.PORT||3000

const server=http.createServer(app);

// Initialize Socket.IO
initializeSocket(server);


// Start server
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Socket.IO initialized and ready for connections`);
});