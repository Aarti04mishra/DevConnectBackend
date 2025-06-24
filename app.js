const express=require('express');
const app=express();
const cors=require('cors')
const connectToDB=require("./db/db");
connectToDB();
app.use(express.json());
app.use(express.urlencoded({
    extended:true
}));
app.use(cors())

const userRoutes=require('./routes/user.router')


app.use("/",userRoutes)


module.exports=app