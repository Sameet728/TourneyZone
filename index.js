const express = require('express');
const app = express();
const path = require("path");
const mongoose = require('mongoose');
const passport = require("passport");
const LocalStrategy = require("passport-local");
const session = require("express-session");
const MongoStore = require('connect-mongo');
const User = require("./models/User.js");
require('dotenv').config();
const WalletTransaction = require("./models/WalletTransaction.js");


// MongoDB URL
const dburl = process.env.ATLAS_URL;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "/public")));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(express.json());

// MongoDB Session Store
const store = MongoStore.create({
  mongoUrl: dburl,
  crypto: { secret: "sessionsecret" },
  touchAfter: 24 * 3600,
});

store.on("error", (error) => {
  console.log("Mongo SESSION STORE error:", error);
});

// Session Configuration
const sessionOptions = {
  store,
  secret: "sessionsecretkey",
  resave: false,
  saveUninitialized: true,
  cookie: {
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
  },
};
app.use(session(sessionOptions));

// Passport Configuration
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Current User Middleware
app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  next();
});

// MongoDB Connection
async function main() {
  try {
    await mongoose.connect(dburl);
    console.log("MongoDB Connected Successfully");
  } catch (err) {
    console.error("MongoDB Error:", err);
  }
}
main();


// ✅ =============== AUTH ROUTES ===============

const organizerRoutes = require('./routes/organizer');
app.use('/organizer', organizerRoutes);
const playerRoutes = require('./routes/player');
app.use('/player', playerRoutes);
const tournamentRoutes = require('./routes/tournament');
app.use('/tournament', tournamentRoutes);
const paymentRoutes = require('./routes/payment');
app.use('/payment', paymentRoutes);




//home page
app.get("/", (req, res) => {
  res.render("home");
});

// Signup Page
app.get("/signup", (req, res) => {
  res.render("users/signup");
});

// Signup Logic
app.post("/signup", async (req, res) => {
  try {
   const { username, email, password, role } = req.body;

    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.send("Username or email already exists.");
    }

    const newUser = new User({ email, username, role });
    await User.register(newUser, password);

    res.redirect("/login");
  } catch (err) {
    console.error("Signup error:", err);
    res.redirect("/signup");
  }
});

// Login Page
app.get("/login", (req, res) => {
  res.render("users/login");
});

// Login Logic
app.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) {
      console.error("Authentication error:", err);
      return next(err);
    }
    if (!user) {
      console.log("❌ Invalid email or password");
      return res.redirect("/login");
    }

    req.logIn(user, (err) => {
      if (err) {
        console.error("Login error:", err);
        return next(err);
      }

      console.log("✅ Logged in:", user.username, "| Role:", user.role);

      // Redirect based on role
      switch (user.role) {
        case "admin":
          return res.redirect("/admin");
        case "organizer":
          return res.redirect("/organizer");
        case "player":
          return res.redirect("/player");
        default:
          console.warn("Unknown role, redirecting to default dashboard.");
          return res.redirect("/dashboard");
      }
    });
  })(req, res, next);
});



// Logout
app.get("/logout", (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.redirect("/login");
  });
});

// Dummy Dashboard (You can make separate for roles later)
app.get("/dashboard", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login");
  }
  res.send(`Welcome ${req.user}!`);
});

//organizer page render
app.get("/organizer", (req, res) =>{
  res.render("dashboards/organizer");
});
//player page render
app.get("/player", (req, res) =>{
  res.render("dashboards/player");
});
//admin page render
// Admin Dashboard Route
app.get("/admin", async (req, res) => {
  const processingTransactions = await WalletTransaction.find({ type: "debit", status: "processing" })
    .populate("user")
    .populate("tournament")
    .sort({ date: -1 });

  const paidTransactions = await WalletTransaction.find({ type: "debit", status: "done" })
    .populate("user")
    .populate("tournament")
    .sort({ date: -1 });

  res.render("dashboards/admin", {
    processingTransactions,
    paidTransactions,
  });
});
//update transaction to sucesss for admin
app.post("/admin/transactions/:id/update", async (req, res) => {
  const { transactionId, status } = req.body;

  await WalletTransaction.findByIdAndUpdate(req.params.id, {
    transactionId,
    status
  });

  res.redirect("/admin");
});


// Server Start
app.listen(3000, () => {
  console.log("Server running on port 3000");
});
