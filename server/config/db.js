const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("✅ MongoDB Connected");
  } catch (error) {
    console.log("❌ DB Connection Error:", error);
    // Retry logic could be added here, but exiting on initial fail is common for containers
    process.exit(1);
  }
};

const db = mongoose.connection;

db.on("error", (err) => {
  console.log("❌ DB Runtime Error:", err);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  await mongoose.connection.close();
  console.log("MongoDB connection closed gracefully on SIGINT");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await mongoose.connection.close();
  console.log("MongoDB connection closed gracefully on SIGTERM");
  process.exit(0);
});

module.exports = { connectDB, db };
