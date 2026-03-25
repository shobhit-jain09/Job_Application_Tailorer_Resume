const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");
const { z } = require("zod");
const Stripe = require("stripe");

const { getDb } = require("./src/db");
const {
  shouldAllowGeneration,
  getSubscriptionForEmail,
  upsertMockSubscriptionFromEmail,
} = require("./src/paywall");
const { tailorResumeAndCoverLetter } = require("./src/tailor");
const { streamTextAsPdf } = require("./src/pdfExport");

dotenv.config();

const app = express();
app.disable("x-powered-by");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(helmet());
// Stripe webhooks must receive the raw body so signatures can be verified.
app.use(
  "/api/billing/stripe-webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
);
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

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: process.env.STRIPE_API_VERSION || "2024-06-20",
    })
  : null;

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

const exportBodySchema = z.object({
  text: z.string().min(1).max(500000),
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

app.post("/api/export/resume-pdf", async (req, res) => {
  try {
    const body = exportBodySchema.parse(req.body);
    streamTextAsPdf(res, body.text, "tailored-resume.pdf");
  } catch (err) {
    if (err?.name === "ZodError") {
      return res.status(400).json({ error: "INVALID_INPUT", details: err.issues });
    }
    console.error(err);
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

app.post("/api/export/cover-letter-pdf", async (req, res) => {
  try {
    const body = exportBodySchema.parse(req.body);
    streamTextAsPdf(res, body.text, "cover-letter.pdf");
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

app.get("/api/billing/stripe-config", async (req, res) => {
  // If Stripe isn't configured, frontend can keep using the demo activation.
  const enabled = Boolean(
    stripe &&
      process.env.STRIPE_PRICE_WEEKLY_ID &&
      process.env.STRIPE_PRICE_MONTHLY_ID &&
      process.env.STRIPE_SUCCESS_URL,
  );

  if (!enabled) {
    return res.json({ enabled: false });
  }

  return res.json({
    enabled: true,
    plans: {
      weekly: {
        priceId: process.env.STRIPE_PRICE_WEEKLY_ID,
        label: process.env.STRIPE_PLAN_WEEKLY_LABEL || "$4.99 / week",
      },
      monthly: {
        priceId: process.env.STRIPE_PRICE_MONTHLY_ID,
        label: process.env.STRIPE_PLAN_MONTHLY_LABEL || "$9.99 / month",
      },
    },
  });
});

app.post("/api/billing/create-checkout-session", async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: "STRIPE_NOT_CONFIGURED" });

    const schema = z.object({
      email: z.string().email(),
      plan: z.enum(["weekly", "monthly"]),
    });
    const { email, plan } = schema.parse(req.body);

    const priceId =
      plan === "weekly"
        ? process.env.STRIPE_PRICE_WEEKLY_ID
        : process.env.STRIPE_PRICE_MONTHLY_ID;

    if (!priceId) return res.status(500).json({ error: "STRIPE_PRICE_MISSING" });

    const successUrl = process.env.STRIPE_SUCCESS_URL;
    const cancelUrl = process.env.STRIPE_CANCEL_URL || successUrl;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${successUrl}${successUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    if (err?.name === "ZodError") {
      return res.status(400).json({ error: "INVALID_INPUT", details: err.issues });
    }
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

app.post("/api/billing/stripe-webhook", async (req, res) => {
  try {
    if (!stripe) return res.status(503).send("Stripe not configured");

    const signature = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!signature || !webhookSecret) return res.status(400).send("Missing webhook signature secret");

    const rawBody = req.body;
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    // We only need enough to keep SQLite in sync for `shouldAllowGeneration`.
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const subscriptionId = session.subscription;
      const customerEmail = session.customer_details?.email || session.customer_email || null;

      if (subscriptionId && customerEmail) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const item = subscription.items.data?.[0];
        const planId = item?.price?.id || "unknown";

        const db = getDb();
        const currentPeriodEnd = subscription.current_period_end || Math.floor(Date.now() / 1000);
        await require("./src/db").upsertSubscription(db, {
          email: customerEmail,
          plan: planId,
          status: subscription.status || "active",
          currentPeriodEnd,
        });
      }
    }

    // A production webhook should handle more event types for resilience.
    res.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook error:", err);
    return res.status(400).send("Webhook error");
  }
});

app.listen(PORT, () => {
  console.log(`Job Tailorer demo listening on http://localhost:${PORT}`);
});

