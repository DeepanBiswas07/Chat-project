console.log("🔥 DB FILE LOADED");
const mongoose = require("mongoose");

mongoose.connect(
  "api id"
);

const db = mongoose.connection;

db.on("connected", () => {
  console.log("✅ MongoDB Connected");
});

db.on("error", (err) => {
  console.log("❌ DB Error:", err);
});

module.exports = db;
