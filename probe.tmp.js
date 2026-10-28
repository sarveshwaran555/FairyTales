const base = "http://127.0.0.1:3999";
const log = (...a) => console.log(...a);

(async () => {
  let r = await fetch(base + "/api/health");
  log("health:", r.status, await r.text());

  r = await fetch(base + "/cosmetics.html", { redirect: "manual" });
  log(
    "GET /cosmetics.html (no cookie):",
    r.status,
    "->",
    r.headers.get("location"),
  );

  r = await fetch(base + "/api/auth/me");
  log("GET /me (no cookie):", r.status, await r.text());

  const email = `probe${Date.now()}@example.com`;
  const body = JSON.stringify({
    name: "Probe User",
    email,
    password: "StrongPass123",
    confirmPassword: "StrongPass123",
  });
  r = await fetch(base + "/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  const rawCookie = r.headers.get("set-cookie") || "";
  log("signup:", r.status, await r.text());
  log(
    "  set-cookie flags:",
    rawCookie.replace(/token=[^;]+/, "token=<redacted>"),
  );

  const cookie = rawCookie.split(";")[0];
  r = await fetch(base + "/cosmetics.html", {
    headers: { cookie },
    redirect: "manual",
  });
  log(
    "GET /cosmetics.html (cookie):",
    r.status,
    "bytes:",
    (await r.text()).length,
  );

  r = await fetch(base + "/api/auth/me", { headers: { cookie } });
  log("GET /me (cookie):", r.status, await r.text());

  r = await fetch(base + "/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  log("signup duplicate:", r.status, await r.text());

  r = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "wrongpass1" }),
  });
  log("login wrong password:", r.status, await r.text());

  r = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "nobody@example.com",
      password: "wrongpass1",
    }),
  });
  log("login unknown email:", r.status, await r.text());

  r = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"email":',
  });
  log("malformed json:", r.status, await r.text());

  r = await fetch(base + "/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: {},
      email: {},
      password: {},
      confirmPassword: {},
    }),
  });
  log("signup wrong types:", r.status, await r.text());

  r = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "StrongPass123" }),
  });
  log("login correct:", r.status, await r.text());

  // JWT algorithm confusion: build an unsigned "alg: none" token.
  const payload = Buffer.from(
    JSON.stringify({ id: "000000000000000000000000" }),
  ).toString("base64url");
  r = await fetch(base + "/api/auth/me", {
    headers: {
      cookie: `token=${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${payload}.`,
    },
  });
  log("forged alg:none token:", r.status, await r.text());

  // CORS must not echo a foreign origin back to the caller.
  r = await fetch(base + "/api/health", {
    headers: { origin: "https://evil.example" },
  });
  log("CORS foreign origin ->", r.headers.get("access-control-allow-origin"));
  r = await fetch(base + "/api/health", { headers: { origin: base } });
  log("CORS own origin ->", r.headers.get("access-control-allow-origin"));

  const h = {};
  [
    "x-powered-by",
    "content-security-policy",
    "x-frame-options",
    "x-content-type-options",
    "referrer-policy",
  ].forEach((k) => (h[k] = r.headers.get(k)));
  log("headers:", h);
})();
