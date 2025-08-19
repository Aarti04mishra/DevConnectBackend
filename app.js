const express=require('express');
const app=express();
const cors=require('cors')
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const connectToDB=require("./db/db");
connectToDB();



app.use(express.json());
app.use(express.urlencoded({
    extended:true
}));
app.use(cors({
  origin: [
    "http://localhost:5173",           
    "https://devconnect-fsc2.onrender.com" 
  ],
  credentials: true
}));

const userRoutes=require('./routes/user.router')
const followRoutes = require('./routes/follow.router');
const notificationRoutes = require('./routes/notification.router');
const messageRoutes=require('./routes/message.routes');
const projectRoutes=require('./routes/project.router');
const feedRoutes=require('./routes/feed.routes')
const collaborationRoutes=require('./routes/collaboration.routes');

app.use("/",userRoutes)
app.use("/", followRoutes);
app.use("/", notificationRoutes);
app.use("/messages",messageRoutes)
app.use("/projects",projectRoutes)
app.use("/feed",feedRoutes);
app.use("/collaboration",collaborationRoutes);

module.exports=app