// Event.js — wires up the Sign Up / Log In card on signup.html.
//
// ASSUMPTION: routes/auth.js was not available when this was written, so the
// endpoints and body shape below are a best guess based on server.js
// (JSON body parsing, cookie-parser + credentials:true CORS => an httpOnly
// session cookie set by the server, matching the JWT-in-cookie approach).
// If your actual routes differ, only the four constants below need to change.
const SIGNUP_ENDPOINT = "/api/auth/signup";
const LOGIN_ENDPOINT = "/api/auth/login";
const REDIRECT_ON_SUCCESS = "cosmetics.html";
const GENERIC_ERROR =
  "Something went wrong. Please check your details and try again.";

document.addEventListener("DOMContentLoaded", () => {
  const tabSignup = document.getElementById("tab-signup");
  const tabLogin = document.getElementById("tab-login");
  const signupForm = document.getElementById("signupForm");
  const loginForm = document.getElementById("loginForm");
  const message = document.getElementById("authMessage");

  function showTab(tab) {
    const isSignup = tab === "signup";
    tabSignup.classList.toggle("active", isSignup);
    tabLogin.classList.toggle("active", !isSignup);
    tabSignup.setAttribute("aria-selected", String(isSignup));
    tabLogin.setAttribute("aria-selected", String(!isSignup));
    signupForm.classList.toggle("hidden", !isSignup);
    loginForm.classList.toggle("hidden", isSignup);
    setMessage("");
  }

  tabSignup.addEventListener("click", () => showTab("signup"));
  tabLogin.addEventListener("click", () => showTab("login"));

  function setMessage(text, type) {
    message.textContent = text;
    message.classList.remove("success");
    if (type === "success") message.classList.add("success");
  }

  function setLoading(button, isLoading, idleLabel) {
    button.disabled = isLoading;
    button.innerHTML = isLoading
      ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Please wait…'
      : idleLabel;
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function isValidName(name) {
    return /^[SH][A-Za-z]*(?:[ '-][A-Za-z]+)*$/i.test(name);
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // required so the auth cookie set by the server is stored
      body: JSON.stringify(body),
    });

    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      // non-JSON response; fall through to generic handling below
    }

    if (!res.ok) {
      // Server intentionally returns generic auth errors (per the API's
      // rate-limiting / credential-enumeration protection), so we surface
      // whatever message it sends, falling back to a generic one.
      throw new Error((data && (data.message || data.error)) || GENERIC_ERROR);
    }

    return data;
  }

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMessage("");

    const name = document.getElementById("signupName").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;
    const confirmPassword = document.getElementById("signupConfirm").value;

    if (!name || !email || !password) {
      setMessage("Please fill in every field.");
      return;
    }
    if (!isValidName(name)) {
      setMessage("Name must start with S or H.");
      return;
    }
    if (!isValidEmail(email)) {
      setMessage("Please enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    const submitBtn = document.getElementById("signupSubmit");
    setLoading(submitBtn, true);
    try {
      const data = await postJSON(SIGNUP_ENDPOINT, {
        name,
        email,
        password,
        confirmPassword,
      });
      setMessage("Account created! Redirecting…", "success");
      window.location.assign(data.redirect || `/${REDIRECT_ON_SUCCESS}`);
    } catch (err) {
      setMessage(err.message || GENERIC_ERROR);
    } finally {
      setLoading(
        submitBtn,
        false,
        '<i class="fa-solid fa-user-plus" aria-hidden="true"></i> Create Account',
      );
    }
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMessage("");

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) {
      setMessage("Please fill in every field.");
      return;
    }
    if (!isValidEmail(email)) {
      setMessage("Please enter a valid email address.");
      return;
    }

    const submitBtn = document.getElementById("loginSubmit");
    setLoading(submitBtn, true);
    try {
      const data = await postJSON(LOGIN_ENDPOINT, { email, password });
      setMessage("Welcome back! Redirecting…", "success");
      window.location.assign(data.redirect || `/${REDIRECT_ON_SUCCESS}`);
    } catch (err) {
      setMessage(err.message || GENERIC_ERROR);
    } finally {
      setLoading(
        submitBtn,
        false,
        '<i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i> Log In',
      );
    }
  });
});
