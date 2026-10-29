require("dotenv").config();
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/auth");
const { requireAuthPage } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

// ---- Environment checks ----
// On a host (Render, Railway, Fly.io, etc.) a missing MONGODB_URI or JWT_SECRET
// would otherwise only surface as a confusing crash / 500 later on, so fail
// loudly at boot with a clear message instead.
const requiredEnv = ["MONGODB_URI", "JWT_SECRET"];
const missingEnv = requiredEnv.filter((name) => !process.env[name]);
if (missingEnv.length > 0) {
  console.error(
    `Missing required environment variable(s): ${missingEnv.join(", ")}.\n` +
      "Set them in your host's dashboard (or in .env for local development) — see .env.example.",
  );
  process.exit(1);
}

// ---- Middleware ----
// Hide the framework fingerprint in responses.
app.disable("x-powered-by");

// HTTPS is required in production (secure cookies, HSTS).
if (isProduction) {
  app.use((req, res, next) => {
    const hostname = req.hostname.replace(/^\[|\]$/g, "");
    const isLoopback =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1";
    if (
      req.secure ||
      req.get("x-forwarded-proto") === "https" ||
      isLoopback
    ) {
      return next();
    }
    return res.redirect(301, `https://${req.get("host")}${req.originalUrl}`);
  });
}

// Baseline security headers (no extra dependency needed).
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=()",
  );
  // The frontend loads Font Awesome from a CDN and uses inline <style>,
  // so the policy has to allow those — but nothing else.
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "img-src 'self' data:",
      "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
      "font-src 'self' https://cdnjs.cloudflare.com",
      "script-src 'self'",
      "connect-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
    ].join("; "),
  );
  if (isProduction) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=15552000; includeSubDomains",
    );
  }
  next();
});

// Hosts (Render, Heroku, Fly.io, nginx, ...) terminate HTTPS in front of the
// app and forward the real IP in X-Forwarded-For. Trusting the proxy lets
// express-rate-limit see the actual client IP instead of the proxy's.
app.set("trust proxy", 1);

// Small body cap: these endpoints only ever receive a few short strings.
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(cookieParser());

// Same-origin app: CORS is not needed for browser requests from this site. We
// keep all API calls same-origin by default, which prevents a malicious site
// from attaching the auth cookie in a cross-site request.

// The product page is for signed-in users only. Everything else in /public
// (the sign-in page, CSS, JS, images) stays public on purpose. This must be
// registered BEFORE express.static, otherwise the static handler would serve
// cosmetics.html (with its .html extension) without ever reaching the guard.
app.get(["/cosmetics", "/cosmetics.html"], requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "cosmetics.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "signup.html"));
});

// ---- Static frontend (signup.html, signup.css, Event.js, images) ----
// Paths are absolute so they resolve correctly regardless of the cwd the host starts us from.
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: isProduction ? "1h" : 0,
    // No "html" extension guessing, so no unguarded alias for a page exists.
    extensions: [],
  }),
);

// ---- API routes ----
app.use("/api/auth", authRoutes);

// Simple health check. Only a boolean is exposed — the raw readyState number
// is internal detail nobody outside needs.
app.get("/api/health", (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? "ok" : "degraded",
    db: dbConnected ? "connected" : "unavailable",
  });
});

// Unknown /api/* routes get a JSON 404 instead of the HTML page.
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not found." });
});

// Fallback: send the signup page for any unmatched route so the app
// behaves like a single-page entry point.
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "signup.html"));
});

// Last-resort error handler so a thrown error never takes the process down.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Malformed JSON and oversized bodies are client errors, not 500s, and they
  // must not echo parser detail (which includes fragments of the body).
  if (err.type === "entity.parse.failed" || err instanceof SyntaxError) {
    return res.status(400).json({ error: "Invalid request." });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "Request too large." });
  }
  console.error("Unhandled error:", err);
  return res
    .status(500)
    .json({ error: "Something went wrong. Please try again." });
});

// ---- Start server ----
// The port is bound first so the host's port check passes immediately; the
// app answers /api/health with dbState while the DB connection is coming up.
// Accounts need the DB, so signup/login return 503 until it is connected.
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Fairy Tales Cosmetics server listening on port ${PORT}`);
});

mongoose
  .connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    console.error(
      "Check that MONGODB_URI is correct and that this host's IP is allowed in MongoDB Atlas (Network Access).",
    );
  });

mongoose.connection.on("disconnected", () =>
  console.warn("MongoDB disconnected"),
);
mongoose.connection.on("reconnected", () => console.log("MongoDB reconnected"));
// An unhandled "error" event would crash the process; log it and keep the
// rest of the site (static pages) serving.
mongoose.connection.on("error", (err) =>
  console.error("MongoDB error:", err.message),
);

// ---- Graceful shutdown (hosts send SIGTERM on redeploy/scale-down) ----
async function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    try {
      await mongoose.connection.close();
    } catch (_) {
      // ignore
    }
    process.exit(0);
  });
  // Don't hang forever if a connection refuses to close.
  setTimeout(() => process.exit(1), 10000).unref();
}

["SIGTERM", "SIGINT"].forEach((signal) => {
  process.on(signal, () => shutdown(signal));
});

module.exports = app;
