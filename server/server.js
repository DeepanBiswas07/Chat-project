require("dotenv").config();

const http = require("http");
const express = require("express");
const { connectDB } = require("./config/db");
const { initSocket } = require("./sockets");

const app = express();

app.use(express.json());
app.use(express.static("public"));

connectDB();

const server = http.createServer(app);

initSocket(server);

const port = process.env.PORT || 3000;
server.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${port}`);
});
