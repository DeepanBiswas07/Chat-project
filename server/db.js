console.log("🔥 DB FILE LOADED");
const mongoose = require("mongoose");

mongoose.connect(
  "mongodb://Deepan:hello1234@ac-hzfqkix-shard-00-00.qolxnte.mongodb.net:27017,ac-hzfqkix-shard-00-01.qolxnte.mongodb.net:27017,ac-hzfqkix-shard-00-02.qolxnte.mongodb.net:27017/?ssl=true&replicaSet=atlas-2otlib-shard-0&authSource=admin&appName=Cluster0"
);

const db = mongoose.connection;

db.on("connected", () => {
  console.log("✅ MongoDB Connected");
});

db.on("error", (err) => {
  console.log("❌ DB Error:", err);
});

module.exports = db;