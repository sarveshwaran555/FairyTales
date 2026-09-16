const express = require("express");
const jwt = require("jsonwebtoken");
const validator = require("validator");
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Slow down brute-force login attempts.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." },
});

const COOKIE_NAME = "token";

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

function sendAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, // not readable by client-side JS — mitigates XSS token theft
    secure: process.env.NODE_ENV === "production", // HTTPS only in production
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

/**
 * POST /api/auth/signup
 * body: { name, email, password, confirmPassword }
 */
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({ error: "All fields are required." });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long." });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match." });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }

    // Password is hashed automatically by the User model's pre-save hook.
    const user = await User.create({ name: name.trim(), email, password });

    const token = signToken(user._id);
    sendAuthCookie(res, token);

    return res.status(201).json({
      message: "Account created successfully.",
      user: { id: user._id, name: user.name, email: user.email },
      redirect: "/cosmetics.html",
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/**
 * POST /api/auth/login
 * body: { email, password }
 */
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    // Password has `select: false` in the schema, so it must be requested explicitly.
    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");

    // Same generic error whether the email doesn't exist or the password is wrong —
    // this avoids leaking which emails are registered.
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = signToken(user._id);
    sendAuthCookie(res, token);

    return res.status(200).json({
      message: "Signed in successfully.",
      user: { id: user._id, name: user.name, email: user.email },
      redirect: "/cosmetics.html",
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/**
 * POST /api/auth/logout
 */
router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME);
  return res.status(200).json({ message: "Signed out." });
});

/**
 * GET /api/auth/me
 * Returns the currently logged-in user (used by cosmetics.html to greet the user).
 */
router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: "User not found." });
  return res.json({ user: { id: user._id, name: user.name, email: user.email } });
});

module.exports = router;
