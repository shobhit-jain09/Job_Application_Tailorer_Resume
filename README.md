# Job Application Tailorer (ATS Demo)

This repo contains a working MVP demo of an “AI Job Application Tailorer”:

- Paste your master resume + a job description
- The backend securely generates an ATS-friendly tailored resume + cover letter
- A simple “paywall gate” is enforced (for this MVP demo it uses a SQLite mock subscription; real Stripe wiring can be added next)

## Run locally

1. Install dependencies
   - `npm install`
2. (Optional) Create a `.env` file
   - Copy from `.env.example`
3. Start the server
   - `npm run dev`
4. Open
   - `http://localhost:3000`

## Demo flow

1. Enter an email and click **Activate Demo**
2. Paste inputs (example inputs are pre-filled)
3. Click **Tailor Now**
4. Copy/download the generated TXT outputs

## Environment variables

Create a `.env` file with:

- `OPENAI_API_KEY` (optional; if missing, the app falls back to deterministic mock tailoring so the demo still works)
- `OPENAI_MODEL` (optional; default `gpt-4o-mini`)
- `STRIPE_MOCK` (optional; if `true`, generation bypasses the paywall gate)
- `PORT` (optional; default `3000`)
- Stripe (for real paywall)
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_WEEKLY_ID`
  - `STRIPE_PRICE_MONTHLY_ID`
  - `STRIPE_SUCCESS_URL`
  - `STRIPE_CANCEL_URL`
