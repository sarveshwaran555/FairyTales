# Fairy Tales Cosmetics

A single project folder containing the sign in / sign up page, the product
page, and a small Node.js + Express + MongoDB backend that stores user
accounts (name, email, hashed password) and redirects to the cosmetics
page after a successful sign in or sign up.

## Folder structure

```
fairy-tales-cosmetics/
├── server.js              # Express app entry point
├── package.json
├── .env.example            # copy to .env and fill in real values
├── models/
│   └── User.js              # Mongoose schema, hashes passwords with bcrypt
├── middleware/
│   └── auth.js              # verifies the login JWT cookie
├── routes/
│   └── auth.js              # POST /api/auth/signup, /login, /logout, GET /me
└── public/                  # served as static files, this is the whole frontend
    ├── signup.html           # sign in / sign up page (start here)
    ├── signup.css
    ├── Event.js               # panel toggle + calls the API + redirect
    ├── cosmetics.html         # product page, shown after login
    └── images/                # put cos1.png, side2.jpg, cream1-3.jpg here
```

Because `cosmetics.html` still points at `/images/...`, drop your image
files into `public/images/` so the same paths keep working once everything
is served from this one project.

## How sign in / sign up works

1. `public/signup.html` has two forms, wired up by `public/Event.js`.
2. On submit, `Event.js` sends a `fetch` request (no page reload) to:
   - `POST /api/auth/signup` — creates the account
   - `POST /api/auth/login` — checks the credentials
3. The server hashes passwords with **bcrypt** before saving to MongoDB —
   the plaintext password is never stored.
4. On success, the server sets an `httpOnly` cookie containing a signed
   JWT (this is the "you're logged in" session) and responds with
   `redirect: "/cosmetics.html"`.
5. `Event.js` reads that and does `window.location.href = "/cosmetics.html"`.

## Setup

1. Install [Node.js 18+](https://nodejs.org) and have a MongoDB database
   ready — either local (`mongod`) or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster.

2. Install dependencies:
   ```bash
   cd fairy-tales-cosmetics
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Then edit `.env`:
   - `MONGODB_URI` — your MongoDB connection string
   - `JWT_SECRET` — a long random string, e.g. generate one with:
     ```bash
     node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
     ```

4. Run it:
   ```bash
   npm start
   ```
   or, for auto-restart on changes during development:
   ```bash
   npm run dev
   ```

5. Open **http://localhost:3000** — that loads `signup.html`. Create an
   account or sign in; you'll land on `cosmetics.html` on success.

## API reference

| Method | Route              | Body                                          | Notes                                   |
|--------|---------------------|-----------------------------------------------|------------------------------------------|
| POST   | `/api/auth/signup`  | `{ name, email, password, confirmPassword }`  | Creates a user, sets login cookie        |
| POST   | `/api/auth/login`   | `{ email, password }`                         | Verifies credentials, sets login cookie  |
| POST   | `/api/auth/logout`  | –                                              | Clears the login cookie                  |
| GET    | `/api/auth/me`      | – (requires cookie)                           | Returns the logged-in user's basic info  |
| GET    | `/api/health`       | –                                              | Quick server/DB status check             |

## Security notes

- Passwords are hashed with bcrypt (cost factor 12) — never stored or
  returned in plaintext.
- The session token is stored in an `httpOnly` cookie, so it can't be read
  by page JavaScript (mitigates XSS token theft). It's marked `secure` in
  production, so it only travels over HTTPS.
- Login attempts are rate-limited (20 per 15 minutes per IP) to slow down
  brute-force guessing.
- Signup/login return the same generic "Invalid email or password" error
  either way, so the API doesn't reveal which emails are registered.
- `.env` (with your real secrets) is git-ignored — only `.env.example` is
  meant to be committed.

## Deploying

Any Node host (Render, Railway, Fly.io, a VPS, etc.) works — just set the
same environment variables from `.env` in your host's dashboard and run
`npm start`. Point `MONGODB_URI` at your production database (e.g. an
Atlas cluster) and make sure `NODE_ENV=production` so cookies require
HTTPS.
