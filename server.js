require("dotenv").config();
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/auth");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/fairy_tales";

// ---- Middleware ----
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  cors({
    origin: true, // same-origin app; reflects request origin
    credentials: true, // allow the auth cookie to be sent
  }),
);

// ---- Static frontend (signup.html, signup.css, Event.js, cosmetics.html, images) ----
app.use(express.static(path.join(__dirname, "public")));

// ---- API routes ----
app.use("/api/auth", authRoutes);

// Simple health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", dbState: mongoose.connection.readyState });
});

// Fallback: send the signup page for any unmatched route so the app
// behaves like a single-page entry point.
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "signup.html"));
});

// ---- Start server after DB connects ----
async function start() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    app.listen(PORT, () => {
      console.log(
        `Fairy Tales Cosmetics server running at http://localhost:${PORT}`,
      );
    });
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err.message);
    if (err.code === "ENOTFOUND") {
      console.error(
        "Check the MongoDB provider hostname in MONGODB_URI and confirm DNS/network access.",
      );
    } else if (err.code === "ECONNREFUSED") {
      console.error(
        "Start the local MongoDB service, or set MONGODB_URI in .env to your provider connection string.",
      );
    }
    process.exit(1);
  }
}

start();
