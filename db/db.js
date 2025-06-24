const mongoose = require('mongoose');

function connectToDB() {
    mongoose.connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
        socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    }).then(() => {
        console.log("Connected to database successfully");
    }).catch((err) => {
        console.error("Database connection error:", err.message);
        process.exit(1); // Exit if can't connect to database
    });

    // Handle connection events
    mongoose.connection.on('connected', () => {
        console.log('Mongoose connected to MongoDB');
    });

    mongoose.connection.on('error', (err) => {
        console.error('Mongoose connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
        console.log('Mongoose disconnected');
    });

    // Handle process termination
    process.on('SIGINT', async () => {
        await mongoose.connection.close();
        console.log('Database connection closed through app termination');
        process.exit(0);
    });
}

module.exports = connectToDB;