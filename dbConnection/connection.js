const mongoose = require('mongoose');


const dbUrl = "mongodb+srv://irshad1500402:irshad@cluster1.sdy1d.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1"
const dbConnection = mongoose.connect(dbUrl)
.then((success)=>{
console.log("database connected successfully")
}).catch((err)=>{
    console.log("not connected", err)
});

module.exports = dbConnection;
