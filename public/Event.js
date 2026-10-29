// Fairy Tales - Sign In / Sign Up page behaviour
// 1) Toggles the sliding panel between the Sign In and Sign Up forms.
// 2) Submits the forms to the backend (/api/auth/*) instead of reloading the page.
// 3) On success, redirects to cosmetics.html.

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("container");

  // ---- Panel toggle ----
  if (container) {
    document
      .querySelectorAll('[data-auth-view="signup"]')
      .forEach((button) =>
        button.addEventListener("click", () =>
          container.classList.add("active"),
        ),
      );
    document
      .querySelectorAll('[data-auth-view="signin"]')
      .forEach((button) =>
        button.addEventListener("click", () =>
          container.classList.remove("active"),
        ),
      );
  }

  // ---- Shared helpers ----
  function showMessage(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove("error", "success");
    if (type) el.classList.add(type);
  }

  function setLoading(button, isLoading, defaultText) {
    if (!button) return;
    button.disabled = isLoading;
    button.textContent = isLoading ? "Please wait..." : defaultText;
  }

  async function postJSON(url, data) {
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // send/receive the httpOnly auth cookie
        body: JSON.stringify(data),
      });
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(
          "Cannot reach the local server. Run npm start and open http://localhost:3000.",
        );
      }
      throw error;
    }

    let body = {};
    try {
      body = await response.json();
    } catch (_) {
      // no JSON body
    }

    if (!response.ok) {
      throw new Error(body.error || "Something went wrong. Please try again.");
    }
    return body;
  }

  // ---- Sign Up ----
  const signupForm = document.getElementById("signupForm");
  const signupMessage = document.getElementById("signupMessage");
  const signupSubmit = document.getElementById("signupSubmit");

  if (signupForm) {
    signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      showMessage(signupMessage, "", null);

      const name = document.getElementById("signupName").value.trim();
      const email = document.getElementById("signupEmail").value.trim();
      const password = document.getElementById("signupPassword").value;
      const confirmPassword = document.getElementById(
        "signupConfirmPassword",
      ).value;

      if (!name || !email || !password || !confirmPassword) {
        showMessage(signupMessage, "Please fill in every field.", "error");
        return;
      }
      if (password.length < 8) {
        showMessage(
          signupMessage,
          "Password must be at least 8 characters.",
          "error",
        );
        return;
      }
      if (password !== confirmPassword) {
        showMessage(signupMessage, "Passwords do not match.", "error");
        return;
      }

      setLoading(signupSubmit, true, "Sign Up");
      try {
        const result = await postJSON("/api/auth/signup", {
          name,
          email,
          password,
          confirmPassword,
        });
        if (result.redirect && result.redirect !== "/cosmetics.html") {
          // Account not signed in automatically — send the user to sign in.
          showMessage(
            signupMessage,
            result.message || "Account created!",
            "success",
          );
          return;
        }
        showMessage(
          signupMessage,
          "Account created! Redirecting...",
          "success",
        );
        window.location.href = result.redirect || "/cosmetics.html";
      } catch (err) {
        showMessage(signupMessage, err.message, "error");
      } finally {
        setLoading(signupSubmit, false, "Sign Up");
      }
    });
  }

  // ---- Sign In ----
  const signinForm = document.getElementById("signinForm");
  const signinMessage = document.getElementById("signinMessage");
  const signinSubmit = document.getElementById("signinSubmit");

  if (signinForm) {
    signinForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      showMessage(signinMessage, "", null);

      const email = document.getElementById("signinEmail").value.trim();
      const password = document.getElementById("signinPassword").value;

      if (!email || !password) {
        showMessage(
          signinMessage,
          "Please enter your email and password.",
          "error",
        );
        return;
      }

      setLoading(signinSubmit, true, "Sign In");
      try {
        const result = await postJSON("/api/auth/login", { email, password });
        showMessage(signinMessage, "Signed in! Redirecting...", "success");
        window.location.href = result.redirect || "/cosmetics.html";
      } catch (err) {
        showMessage(signinMessage, err.message, "error");
      } finally {
        setLoading(signinSubmit, false, "Sign In");
      }
    });
  }
});
