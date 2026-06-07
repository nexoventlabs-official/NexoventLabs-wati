/**
 * One-shot test: send the "Interested" follow-up reply to a specific number.
 * Usage:  node scripts/test-interested-reply.js
 *
 * The script looks up the contact in MongoDB and calls the same
 * followUpService.sendLeadReply() that the real webhook uses.
 * If no contact exists yet it creates a temporary one for the send.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Contact = require("../models/Contact");
const followUp = require("../services/followUpService");

const TARGET = "918106811285"; // E.164 without +

// Optional: override the demo URL for this test send.
// Set to "" to use whatever the global admin config has.
const DEMO_URL_OVERRIDE = "https://nexoventlabs.com/demo";

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  let contact = await Contact.findOne({ waId: TARGET });
  if (!contact) {
    console.log(`No contact found for ${TARGET}, creating a temporary one…`);
    contact = await Contact.create({
      waId: TARGET,
      name: "Test Contact",
      lastCustomerMessageAt: new Date(),
    });
  } else {
    console.log(`Found contact: ${contact.name || contact.profileName || TARGET}`);
  }

  console.log("Sending Interested reply…");

  // Debug: show what config will be used
  const cfg = await followUp.getConfig();
  console.log("Config demoCTAUrl:", cfg.demoCTAUrl);
  console.log("Config demoCTAText:", cfg.demoCTAText);
  console.log("Config interestedHeader:", cfg.interestedHeader);
  console.log("Effective demo URL:", DEMO_URL_OVERRIDE || cfg.demoCTAUrl || "(none — CTA button will NOT appear)");

  // Patch sendInteractive to log exactly what is sent to Meta
  const meta = require("../services/metaService");
  const origSendInteractive = meta.sendInteractive;
  meta.sendInteractive = async function(to, opts) {
    console.log("\n📤 sendInteractive payload:");
    console.log(JSON.stringify({ to, ...opts }, null, 2));
    try {
      const result = await origSendInteractive.call(this, to, opts);
      console.log("✅ Meta response:", JSON.stringify(result));
      return result;
    } catch (e) {
      console.error("❌ Meta error:", JSON.stringify(e.response?.data || e.message, null, 2));
      throw e;
    }
  };

  await followUp.sendLeadReply(contact, true, DEMO_URL_OVERRIDE || null);
  console.log("✅ Done — check WhatsApp on", TARGET);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("❌ Error:", e.response?.data || e.message);
  process.exit(1);
});
