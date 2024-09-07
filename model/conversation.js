const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema({
  members: {
    type: [String],
    required: true,
  },
 
});

const Conversations = mongoose.model("Conversation", conversationSchema);
module.exports = Conversations;
