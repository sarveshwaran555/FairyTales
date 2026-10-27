const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const validator = require("validator");
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Slow down brute-force login attempts. Failed logins are also counted so a
// burst of wrong passwords hits the limit quickly (see skipSuccessfulRequests).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many login attempts. Please try again later." },
});

// Account creation is also rate-limited: otherwise it is an open endpoint
// that can be used to spam the database or enumerate emails via the 409.
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sign-up attempts. Please try again later." },
});

const COOKIE_NAME = "token";
const isProduction = process.env.NODE_ENV === "production";

// Session lifetime in ms. Kept in sync with the JWT's own expiry so the
// cookie never outlives the token it carries.
const SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Shared cookie options, so the cookie set on login/signup can be cleared
// with matching options on logout (a mismatch leaves the cookie behind).
const cookieOptions = {
  httpOnly: true, // not readable by client-side JS — mitigates XSS token theft
  secure: isProduction, // HTTPS only in production (set NODE_ENV=production on hosts)
  sameSite: "lax",
  path: "/",
};

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

function sendAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_MS });
}

// Dummy hash compared against when the email doesn't exist, so a login for an
// unknown account takes the same time as a wrong password. Without it the
// response time reveals which emails are registered.
const DUMMY_HASH =
  "$2a$12$C6UzMDM.H6dfI/f/IKcEe.9ydN5k8G0s5hz1Q2v4r9q1G0tY5rjP6";

function looksLikeEmail(value) {
  return (
    typeof value === "string" && value.length <= 254 && validator.isEmail(value)
  );
}

/**
 * POST /api/auth/signup
 * body: { name, email, password, confirmPassword }
 */
router.post("/signup", signupLimiter, async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({ error: "All fields are required." });
    }

    // Check the type before calling anything that assumes a string —
    // an object/array in the body would otherwise throw a 500.
    if (typeof password !== "string" || typeof confirmPassword !== "string") {
      return res.status(400).json({ error: "Invalid request." });
    }

    if (
      typeof name !== "string" ||
      name.trim().length < 2 ||
      name.length > 100
    ) {
      return res
        .status(400)
        .json({ error: "Please enter a name between 2 and 100 characters." });
    }

    if (!looksLikeEmail(email)) {
      return res
        .status(400)
        .json({ error: "Please enter a valid email address." });
    }

    if (password.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters long." });
    }

    // bcrypt only uses the first 72 bytes; refusing longer input avoids
    // silently truncating the password and surprises at login time.
    if (Buffer.byteLength(password, "utf8") > 72) {
      return res
        .status(400)
        .json({ error: "Password must be 72 bytes or fewer." });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match." });
    }

    const normalizedEmail = email.toLowerCase();

    // Same response as a real duplicate on purpose — telling the client
    // "this email exists" turns signup into an account-enumeration oracle.
    const existing = await User.findOne({ email: normalizedEmail }).lean();
    if (existing) {
      return res.status(201).json({
        message: "Account created successfully. Please sign in.",
        redirect: "/signup.html",
      });
    }

    // Password is hashed automatically by the User model's pre-save hook.
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
    });

    const token = signToken(user._id);
    sendAuthCookie(res, token);

    return res.status(201).json({
      message: "Account created successfully.",
      user: { id: user._id, name: user.name, email: user.email },
      redirect: "/cosmetics.html",
    });
  } catch (err) {
    // Race on the unique index (two signups at once) — same generic answer.
    if (err.code === 11000) {
      return res.status(201).json({
        message: "Account created successfully. Please sign in.",
        redirect: "/signup.html",
      });
    }
    if (err.name === "ValidationError") {
      return res
        .status(400)
        .json({ error: "Please check the form and try again." });
    }
    console.error("Signup error:", err);
    return res
      .status(500)
      .json({ error: "Something went wrong. Please try again." });
  }
});

/**
 * POST /api/auth/login
 * body: { email, password }
 */
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required." });
    }

    if (!looksLikeEmail(email) || typeof password !== "string") {
      return res.status(400).json({ error: "Invalid request." });
    }

    // Password has `select: false` in the schema, so it must be requested explicitly.
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+password",
    );

    // Same generic error whether the email doesn't exist or the password is
    // wrong. For a missing user we still run a bcrypt comparison against a
    // dummy hash, so the response time doesn't reveal that the email is free.
    let passwordMatches = false;
    if (user) {
      passwordMatches = await user.comparePassword(password);
    } else {
      await bcrypt.compare(password, DUMMY_HASH);
    }

    if (!user || !passwordMatches) {
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
    return res
      .status(500)
      .json({ error: "Something went wrong. Please try again." });
  }
});

/**
 * POST /api/auth/logout
 */
router.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions);
  return res.status(200).json({ message: "Signed out." });
});

/**
 * GET /api/auth/me
 * Returns the currently logged-in user (used by cosmetics.html to greet the user).
 */
router.get("/me", requireAuth, async (req, res) => {
  try {
    // .lean() + explicit projection: only the three public fields leave the DB.
    const user = await User.findById(req.userId, "name email").lean();
    if (!user) return res.status(404).json({ error: "User not found." });
    return res.json({
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("Me error:", err);
    return res
      .status(500)
      .json({ error: "Something went wrong. Please try again." });
  }
});

module.exports = router;
