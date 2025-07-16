const express = require("express");
const router = express.Router();
const Tournament = require("../models/tournament");
const User = require("../models/User");

// ✅ View all tournaments (latest on top)
router.get("/tournaments", async (req, res) => {
  try {
    if (!req.user || req.user.role !== "player") {
      return res.status(403).send("Access Denied");
    }

    const tournaments = await Tournament.find({}).sort({ createdAt: -1 }); // 🆕 sort by latest
    res.render("player/viewTournaments", { tournaments });
  } catch (err) {
    console.error("Error fetching tournaments:", err);
    res.status(500).send("Server Error");
  }
});




// ✅ My Tournaments Page
router.get("/my-tournaments", async (req, res) => {
  try {
    if (!req.user || req.user.role !== "player") {
      return res.status(403).send("Access Denied");
    }

    const user = await User.findById(req.user._id).populate("tournamentsJoined");
    res.render("player/myTournaments", { tournaments: user.tournamentsJoined });
  } catch (err) {
    console.error("Error fetching player's tournaments:", err);
    res.status(500).send("Server Error");
  }
});

// Show Join Form
router.get("/tournaments/:id/join", async (req, res) => {
  try {
    if (!req.user || req.user.role !== "player") {
      return res.status(403).send("Only players can join tournaments.");
    }

    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).send("Tournament not found");
    // Check if logged-in player has already joined
    let alreadyJoined = false;
    if (req.user && req.user.role === 'player') {
      alreadyJoined = req.user.tournamentsJoined.includes(tournament._id);
    }

    res.render("player/joinTournamentForm", { tournament ,alreadyJoined,
      user: req.user,
      razorpayKey: process.env.RAZORPAY_KEY_ID  // ✅ passed for Razorpay script
    });
  } catch (err) {
    console.error("Error rendering join form:", err);
    res.status(500).send("Server Error");
  }
});

router.post("/tournaments/:id/join", async (req, res) => {
  try {
    if (!req.user || req.user.role !== "player") {
      return res.status(403).send("Access Denied");
    }

    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).send("Tournament not found");

    const { teamName, member2, member3, member4 } = req.body;

    // Check if already joined
    const player = await User.findById(req.user._id);
    
    if (player.tournamentsJoined.includes(tournament._id)) {
      return res.send("You have already joined this tournament.");
    }

    if (!player.username) {
      return res.status(400).send("Your profile must have a username.");
    }
    

    const newTeam = {
      name: teamName,
      leader: {
        userId: player._id,
        username: player.username
      },
      members: [member2, member3, member4].filter(Boolean)
    };
    console.log(`✅ ${player.username} joined ${tournament.name}`);
    tournament.teams.push(newTeam);
    await tournament.save();

    player.tournamentsJoined.push(tournament._id);
    await player.save();

    res.redirect("/player/my-tournaments");
  } catch (err) {
    console.error("Error joining tournament:", err);
    res.status(500).send("Server Error");
  }
});

// ✅ Route to view all completed tournaments with results
router.get("/results", async (req, res) => {
  try {
    const completedTournaments = await Tournament.find({
      endDate: { $lt: new Date() },
      result: { $ne: null }
    });
    res.render("player/results", { tournaments: completedTournaments });
  } catch (err) {
    console.error("Error fetching results:", err);
    res.status(500).send("Server Error");
  }
});

// ✅ Route to view specific completed tournament result details
router.get("/results/:id", async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id).populate("organizer");
    if (!tournament || tournament.status !== "completed") {
      return res.status(404).send("Tournament not found or not completed.");
    }
    res.render("player/showResult", { tournament });
  } catch (err) {
    console.error("Error loading result:", err);
    res.status(500).send("Server Error");
  }
});



module.exports = router;
