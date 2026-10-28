const jwt = require("jsonwebtoken");

// Verifies the JWT stored in the httpOnly cookie and attaches the user id
// to the request. Use this to protect any route that requires login.
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: "Not authenticated." });
  }

  try {
    // Pin the algorithm: without this, verification accepts whatever `alg`
    // the token claims (e.g. `none`), which is a well-known JWT bypass.
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
    req.userId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session expired. Please sign in again." });
  }
}

// Page-level guard for the static HTML the browser navigates to directly.
// An unauthenticated visitor is sent back to the sign-in page instead of
// being served the product page.
function requireAuthPage(req, res, next) {
  const token = req.cookies && req.cookies.token;

  if (token) {
    try {
      jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
      return next();
    } catch (err) {
      res.clearCookie("token", { path: "/" });
    }
  }

  return res.redirect(302, "/signup.html");
}

module.exports = { requireAuth, requireAuthPage };
