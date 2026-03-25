const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");
const { z } = require("zod");

const { getDb } = require("./src/db");
const {
  shouldAllowGeneration,
  getSubscriptionForEmail,
  upsertMockSubscriptionFromEmail,
} = require("./src/paywall");
const { tailorResumeAndCoverLetter } = require("./src/tailor");

dotenv.config();

const app = express();
app.disable("x-powered-by");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, "public")));

// Endpoint-level rate limit to protect LLM costs.
const generationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10, // free/dev baseline; paid users can still be limited by this.
  standardHeaders: true,
  legacyHeaders: false,
});

const tailorBodySchema = z.object({
  resumeText: z.string().min(50).max(40000),
  jobText: z.string().min(50).max(20000),
  email: z.string().email().optional(),
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/tailor", generationLimiter, async (req, res) => {
  try {
    const body = tailorBodySchema.parse(req.body);

    const email = body.email;
    const db = getDb();

    const tierInfo = email ? await getSubscriptionForEmail(db, email) : null;
    const okToGenerate = await shouldAllowGeneration({
      stripeMock: process.env.STRIPE_MOCK === "true",
      hasEmail: Boolean(email),
      tierInfo,
    });

    if (!okToGenerate) {
      return res.status(402).json({
        error: "PAYWALL_REQUIRED",
        message: "Active subscription required to generate tailored outputs.",
      });
    }

    const result = await tailorResumeAndCoverLetter({
      resumeText: body.resumeText,
      jobText: body.jobText,
      email,
    });

    return res.json(result);
  } catch (err) {
    if (err?.name === "ZodError") {
      return res.status(400).json({ error: "INVALID_INPUT", details: err.issues });
    }
    console.error(err);
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// Simple paywall helper for local demos: user submits email, we mark it as "trial/premium" in SQLite.
app.post("/api/billing/mock-activate", async (req, res) => {
  try {
    const schema = z.object({ email: z.string().email() });
    const { email } = schema.parse(req.body);
    const db = getDb();
    await upsertMockSubscriptionFromEmail(db, email);
    return res.json({ ok: true });
  } catch (err) {
    if (err?.name === "ZodError") {
      return res.status(400).json({ error: "INVALID_INPUT", details: err.issues });
    }
    console.error(err);
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// NOTE: Real Stripe integration (Checkout + webhook) is intentionally omitted from this MVP demo.
// The mock endpoint above is enough to prove the generation flow end-to-end.

app.listen(PORT, () => {
  console.log(`Job Tailorer demo listening on http://localhost:${PORT}`);
});

