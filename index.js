const express = require("express");
const dbConnection = require("./dbConnection/connection.js");
const Users = require("./model/model.js");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Conversations = require("./model/conversation.js");
const Messages = require("./model/messages.js");
const cors = require("cors");
const { Socket } = require("socket.io");
const io = require("socket.io")(4000, {
  cors : {
    origin : 'http://localhost:3000',
  }
})

const app = express();

// db connection

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());

const port = process.env.PORT || 8001;

// Socket.io
let users = [];
io.on('connection', socket => {
  console.log('User Connection', socket.id);
  socket.on('addUser', userId =>{
    const  isUserExist = users.find(user => user.userId === userId);
    if(!isUserExist){
      const user = {userId, socketId: socket.id}
      users.push(user);
      io.emit('getUser', users);
    }

  });


  socket.on('sendMessage', async ({senderId, receiverId, message, conversationId}) => {
    const receiver = users.find(user => user.userId === receiverId);
    const sender = users.find(user => user.userId === senderId);
    const user = await Users.findById(senderId);
    if(receiver){
    io.to(receiver.socketId).to(sender.socketId).emit('getMessage', {
      senderId,
      receiverId,
      message,
      conversationId,
      user : {id: user._id, fullName: user.fullName, email:user.email}
    });
    }else{
      io.to (sender.socketId).emit('getMessage', {
        senderId,
        receiverId,
        message,
        conversationId,
        user : {id: user._id, fullName: user.fullName, email:user.email}
      });
    }
  });


  socket.on('disconnect', ()=>{
    users = users.filter(user => user.socketId !== socket.id);
    io.emit('getUsers', users);
  });

  // io.emit('getUser', socket.userId);
});

// Routes
app.get("/", (req, res) => {
  res.status(200).json("Hello from Chat application backend");
});

// Register
app.post("/api/register", async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).send("Please fill all the required fields");
    }

    const isAlreadyExist = await Users.findOne({ email });
    if (isAlreadyExist) {
      return res.status(400).send("User Already Exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new Users({
      fullName,
      email,
      password: hashedPassword,
    });

    await newUser.save();
    return res.status(200).send("User Registered Successfully");
    console.log(newUser);
  } catch (error) {
    return res.status(400).send({ message: error.message });
  }
});

// Login
app.post("/api/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).send("Please fill all the Required fields");
    } else {
      const user = await Users.findOne({ email });
      if (!user) {
        res.status(400).send("User email or password is incorrect");
      } else {
        const validateUser = await bcrypt.compare(password, user.password);
        if (!validateUser) {
          res.status(400).send("User email or password is incorrect");
        } else {
          const payload = {
            userId: user._id,
            email: user.email,
          };
          const jWT_SECRET_KEY =
            process.env.jWT_SECRET_KEY || "This is my JWTsecrectKEY";
          jwt.sign(
            payload,
            jWT_SECRET_KEY,
            { expiresIn: 1296000 },
            async (err, token) => {
              await Users.updateOne(
                { _id: user._id },
                {
                  $set: { token },
                }
              );
              user.save();
              next();
            }
          );
          res.status(200).json({
            user: { id: user._id, email: user.email, fullName: user.fullName },
            token: user.token,
          });
        }
      }
    }
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// conversation route

app.post("/api/conversation", async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;
    const newConversation = new Conversations({
      members: [senderId, receiverId],
    });
    await newConversation.save();
    res.status(200).send("Conversation created successfully");
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

app.get("/api/conversations/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const conversations = await Conversations.find({
      members: { $in: [userId] },
    });
    const conversationUserData = await Promise.all(
      conversations.map(async (conversation) => {
        const receiverId = conversation.members.find(
          (member) => member !== userId
        );
        const user = await Users.findById(receiverId);
        return {
          user: {
            receiverId: user._id,
            email: user.email,
            fullName: user.fullName,
          },
          conversationId: conversation._id,
        };
      })
    );
    res.status(200).json(conversationUserData);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// message route

app.post("/api/message", async (req, res) => {
  try {
    const { conversationId, senderId, message, receiverId } = req.body;
    if (!senderId || !message) {
      return res.status(400).json("please fill all the required fields");
    }
    if (conversationId === "new" && receiverId) {
      const newConversation = new Conversations({
        members: [senderId, receiverId],
      });
      await newConversation.save();
      const newMessage = new Messages({
        conversationId: newConversation._id,
        senderId,
        message,
      });
      await newMessage.save();
      return res.status(200).json("Messsage sent successfully");
    } else if (!conversationId && !receiverId) {
      return res.status(400).json("Please fill all the Required fields");
    }
    const newMessage = new Messages({ conversationId, senderId, message });
    await newMessage.save();
    res.status(200).json("Message Sent Successfully");
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/message/:conversationId", async (req, res) => {
  try {
    const checkMessages = async (conversationId) => {
        const messages = await Messages.find({ conversationId });
        const messageUserData = await Promise.all(
        messages.map(async (message) => {
          const user = await Users.findById(message.senderId);
          return {
            user: { id: user._id, email: user.email, fullName: user.fullName },
            message: message.message,
          };
        }));
         res.status(200).json(messageUserData);
    };
    const conversationId = req.params.conversationId;
    if (conversationId === "new") {
      const checkConversation = await Conversations.find({
        members: { $all: [req.query.senderId, req.query.receiverId] },
      });
      if (checkConversation.length > 0) {
        checkMessages(checkConversation[0]._id);
      }else{
        return res.status(200).json([]);
      }
       
    } else{

      checkMessages(conversationId);
    }
 
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// get All the users
app.get("/api/users/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const users = await Users.find({ _id: { $ne: userId } });
    const usersData = await Promise.all(
      users.map(async (user) => {
        return {
          user: {
            email: user.email,
            fullName: user.fullName,
            receiverId: user._id,
          },
        };
      })
    );
    res.status(200).json(usersData);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.listen(port, () => {
  console.log(`server is running on port ${port}`);
});
