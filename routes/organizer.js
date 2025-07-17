const express = require("express");
const router = express.Router();
const Tournament = require("../models/tournament");
const WalletTransaction = require("../models/WalletTransaction");
const User = require("../models/User");

// Show form to create a new tournament
router.get("/tournaments/new", (req, res) => {
  if (!req.user || req.user.role !== "organizer") {
    return res.status(403).send("Access Denied");
  }
  res.render("organizer/newtournament");
});

router.post("/tournaments", async (req, res) => {
  try {
    const {
      name,
      game,
      description,
      startDate,
      endDate,
      timeSlot,
      type,
      entryFee,
    } = req.body;
    const organizerId = req.user._id;

    if (type === "scrim") {
      const start = new Date(startDate);
      const end = new Date(endDate);

      let currentDate = new Date(start);

      while (currentDate <= end) {
        const day = currentDate.toISOString().split("T")[0]; // e.g. 2025-07-12
        const newTournament = new Tournament({
          name: `${name} - ${day} (${timeSlot})`,
          game,
          description,
          startDate: new Date(currentDate),
          endDate: new Date(currentDate),
          timeSlot,
          type,
          entryFee,
          organizer: organizerId,
        });

        await newTournament.save();
        currentDate.setDate(currentDate.getDate() + 1); // move to next day
      }

      console.log("✅ Scrim tournaments created.");
      res.redirect("/organizer/tournaments");
    } else {
      // Regular tournament
      const tournament = new Tournament({
        name,
        game,
        description,
        startDate,
        endDate,
        type,
        timeSlot: type === "scrim" ? timeSlot : undefined,
        entryFee,
        organizer: organizerId,
      });

      await tournament.save();
      res.redirect("/organizer/tournaments");
    }
  } catch (err) {
    console.error("❌ Error creating tournament:", err);
    res.status(500).send("Server Error");
  }
});

// View all tournaments created by the logged-in organizer
router.get("/tournaments", async (req, res) => {
  try {
    if (!req.user || req.user.role !== "organizer") {
      return res.status(403).send("Access Denied");
    }

    const tournaments = await Tournament.find({ organizer: req.user._id });
    res.render("organizer/myTournaments", { tournaments });
  } catch (err) {
    console.error("Error fetching tournaments:", err);
    res.status(500).send("Server Error");
  }
});

// Render edit form
router.get("/tournaments/:id/edit", async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) return res.status(404).send("Tournament not found");

    if (
      !req.user ||
      req.user.role !== "organizer" ||
      !tournament.organizer.equals(req.user._id)
    ) {
      return res.status(403).send("Access Denied");
    }

    res.render("organizer/editTournament", { tournament });
  } catch (err) {
    console.error("Edit load error:", err);
    res.status(500).send("Server Error");
  }
});

// Handle tournament update
router.post("/tournaments/:id", async (req, res) => {
  try {
    const { name, game, description, startDate, endDate, status } = req.body;

    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).send("Tournament not found");

    if (
      !req.user ||
      req.user.role !== "organizer" ||
      !tournament.organizer.equals(req.user._id)
    ) {
      return res.status(403).send("Access Denied");
    }

    tournament.name = name;
    tournament.game = game;
    tournament.description = description;
    tournament.startDate = startDate;
    tournament.endDate = endDate;
    tournament.status = status;

    await tournament.save();
    res.redirect("/organizer/tournaments");
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).send("Update Failed");
  }
});

// View tournament details
router.get("/tournaments/:id", async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id)
      .populate("organizer", "username email")
      .populate("teams.members", "username email");

    if (!tournament) {
      return res.status(404).send("Tournament not found");
    }
    console.log(tournament);
    res.render("organizer/viewTournament", { tournament });
  } catch (err) {
    console.error("Error fetching tournament:", err);
    res.status(500).send("Server Error");
  }
});

// Show result submission form
router.get("/tournaments/:id/results", async (req, res) => {
  const tournament = await Tournament.findById(req.params.id).populate(
    "teams.leader.userId"
  );
  if (!tournament || tournament.status !== "completed") {
    return res
      .status(403)
      .send("Tournament must be completed to submit results.");
  }
  res.render("organizer/submitResults", { tournament });
});

// Save submitted results
router.post("/tournaments/:id/results", async (req, res) => {
  const tournament = await Tournament.findById(req.params.id);
  if (!tournament || tournament.status !== "completed") {
    return res
      .status(403)
      .send("Invalid action. Tournament must be completed.");
  }

  tournament.result = {
    firstPlace: {
      teamName: req.body.firstPlace,
      score: req.body.firstScore,
    },
    secondPlace: {
      teamName: req.body.secondPlace,
      score: req.body.secondScore,
    },
    thirdPlace: {
      teamName: req.body.thirdPlace,
      score: req.body.thirdScore,
    },
    notes: req.body.notes,
  };
  // 💰 Organizer Wallet Credit Logic
if (!tournament.isPaidToOrganizer) {
  const entryFee = tournament.entryFee;
  const teamCount = tournament.teams.length;
  const platformFee = parseInt(process.env.PLATFORM_FEE) || 50;
  const totalAmount = teamCount * entryFee;
  const payout = totalAmount - platformFee;

  const organizer = await User.findById(tournament.organizer);
  if (organizer) {
    organizer.wallet = (organizer.wallet || 0) + payout;
    await organizer.save();

    // Save wallet transaction
    const txn = new WalletTransaction({
      user: organizer._id,
      amount: payout,
      type: "credit",
      transactionId: "N/A",          // 👈 No external txn
      status: "done",                // 👈 Directly mark as completed
      source: "Tournament Earnings",
      tournament: tournament._id,
    });
    await txn.save();
  }

  tournament.isPaidToOrganizer = true;
}


  await tournament.save();
  res.redirect(`/organizer/tournaments/${tournament._id}`);
});

//wallet rendering
router.get("/wallet", async (req, res) => {
  try {
    const organizer = await User.findById(req.user._id);
    const transactions = await WalletTransaction.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate("tournament", "name");

    res.render("organizer/wallet", {
      user: req.user,
      walletBalance: organizer.wallet || 0,
      transactions,
    });
  } catch (err) {
    console.error("Wallet page error:", err);
    res.status(500).send("Server Error");
  }
});

// wallet withdraw rendering
// Show Withdraw Form
router.get("/wallet/withdraw", async (req, res) => {
  if (!req.user || req.user.role !== "organizer") {
    return res.status(403).send("Access denied");
  }

  const user = await User.findById(req.user._id);
  res.render("organizer/withdraw", { walletBalance: user.wallet || 0 });
});


// Handle Withdraw Request
router.post("/wallet/withdraw", async (req, res) => {
  const { upiId, amount } = req.body;
  const user = await User.findById(req.user._id);

  if (!upiId || !amount || isNaN(amount)) {
    return res.status(400).send("Invalid UPI ID or amount");
  }

  const withdrawalAmount = parseInt(amount);
  if (withdrawalAmount > user.wallet) {
    return res.status(400).send("Insufficient balance");
  }

  // Deduct from wallet
  user.wallet -= withdrawalAmount;
  await user.save();

  // Save transaction with status "processing"
  const txn = new WalletTransaction({
    user: user._id,
    amount: withdrawalAmount,
    type: "debit",
    upiId,
    status: "processing", // later change to "done" manually
    transactionId: "TBD_MANUALLY",
    source: "UPI Withdrawal",
  });

  await txn.save();
  res.redirect("/organizer/wallet");
});


module.exports = router;
