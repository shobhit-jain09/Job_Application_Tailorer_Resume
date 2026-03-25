const { getSubscription } = require("./db");

async function getSubscriptionForEmail(db, email) {
  const sub = await getSubscription(db, email);
  return sub;
}

function isSubscriptionActive(tierInfo) {
  if (!tierInfo) return false;
  if (tierInfo.status !== "active") return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return Number(tierInfo.current_period_end) > nowSeconds;
}

async function shouldAllowGeneration({ stripeMock, hasEmail, tierInfo }) {
  if (stripeMock) return true;
  if (!hasEmail) return false;
  return isSubscriptionActive(tierInfo);
}

async function upsertMockSubscriptionFromEmail(db, email) {
  const { upsertMockSubscriptionFromEmail: upsertMock } = require("./db");
  await upsertMock(db, email);
}

module.exports = {
  getSubscriptionForEmail,
  shouldAllowGeneration,
  upsertMockSubscriptionFromEmail,
};

