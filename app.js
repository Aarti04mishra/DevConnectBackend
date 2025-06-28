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
app.use(cors())

const userRoutes=require('./routes/user.router')
const followRoutes = require('./routes/follow.router');
const notificationRoutes = require('./routes/notification.router');
const messageRoutes=require('./routes/message.routes');


app.use("/",userRoutes)
app.use("/", followRoutes);
app.use("/", notificationRoutes);
app.use("/messages",messageRoutes)


module.exports=app