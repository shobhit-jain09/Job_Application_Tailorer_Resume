function $(id) {
  return document.getElementById(id);
}

const els = {
  email: $("email"),
  activateBtn: $("activateBtn"),
  activationStatus: $("activationStatus"),
  stripeSection: $("stripeSection"),
  subscribeWeeklyBtn: $("subscribeWeeklyBtn"),
  subscribeMonthlyBtn: $("subscribeMonthlyBtn"),
  subscribeStatus: $("subscribeStatus"),
  resumeFile: $("resumeFile"),
  resumeText: $("resumeText"),
  jobText: $("jobText"),
  tailorBtn: $("tailorBtn"),
  busy: $("busy"),
  tailoredResume: $("tailoredResume"),
  coverLetter: $("coverLetter"),
  keywordCoverage: $("keywordCoverage"),
  downloadResumeBtn: $("downloadResumeBtn"),
  downloadResumeDocxBtn: $("downloadResumeDocxBtn"),
  downloadCoverBtn: $("downloadCoverBtn"),
};

function setBusy(text) {
  els.busy.textContent = text || "";
}

async function downloadPdf(endpoint, filename, text) {
  setBusy("Generating PDF...");
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || "PDF export failed");
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    setBusy("");
  }
}

function setResults({ tailoredResume, coverLetter, keywordCoverage }) {
  els.tailoredResume.value = tailoredResume || "";
  els.coverLetter.value = coverLetter || "";
  els.keywordCoverage.textContent = keywordCoverage ? JSON.stringify(keywordCoverage, null, 2) : "";

  els.downloadResumeBtn.disabled = !tailoredResume;
  // DOCX download only enabled when user uploaded a DOCX.
  const uploaded = els.resumeFile?.files?.[0] || null;
  const isDocx = uploaded?.name?.toLowerCase?.().endsWith(".docx");
  els.downloadResumeDocxBtn.disabled = !(tailoredResume && isDocx);
  els.downloadCoverBtn.disabled = !coverLetter;
}

async function activateDemo() {
  const email = els.email.value.trim();
  if (!email) {
    els.activationStatus.textContent = "Enter an email first.";
    return;
  }

  els.activationStatus.textContent = "Activating demo subscription...";
  els.activateBtn.disabled = true;

  try {
    const res = await fetch("/api/billing/mock-activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.error || "Activation failed");
    }

    els.activationStatus.textContent = "Demo activated. You can now generate.";
    localStorage.setItem("tailorer_demo_activated_email", email);
  } catch (err) {
    els.activationStatus.textContent = `Error: ${err.message}`;
  } finally {
    els.activateBtn.disabled = false;
  }
}

function setExampleInputs() {
  // Lightweight example inputs so the demo can be run immediately.
  els.resumeText.value =
    "SUMMARY\n" +
    "Backend software engineer with 5+ years building REST APIs, optimizing SQL queries, and collaborating cross-functionally.\n\n" +
    "CORE SKILLS\n" +
    "- Node.js, Express, REST\n" +
    "- PostgreSQL, SQL performance, indexing\n" +
    "- AWS (EC2, S3), Docker\n" +
    "- Testing (Jest), CI/CD\n\n" +
    "PROFESSIONAL EXPERIENCE\n" +
    "- Built and maintained REST APIs in Node.js/Express serving 100K+ requests/day.\n" +
    "- Improved PostgreSQL query performance by adding indexes and rewriting SQL (reduced latency by ~35%).\n" +
    "- Containerized services with Docker and helped deploy to AWS.\n" +
    "- Collaborated with product and frontend teams to deliver features end-to-end.\n\n" +
    "EDUCATION\n" +
    "B.S. Computer Science, State University";

  els.jobText.value =
    "Senior Backend Engineer\n\n" +
    "About the role:\n" +
    "We are looking for a backend engineer to design, build, and maintain RESTful services.\n\n" +
    "Responsibilities\n" +
    "- Build and maintain Node.js services and APIs\n" +
    "- Improve SQL performance and data reliability\n" +
    "- Work with cross-functional stakeholders (product, design, frontend)\n" +
    "- Contribute to testing strategy and CI/CD\n\n" +
    "Required:\n" +
    "- Node.js, Express\n" +
    "- SQL (PostgreSQL)\n" +
    "- AWS and Docker\n\n" +
    "Preferred:\n" +
    "- Jest testing, GraphQL knowledge, system design";
}

async function tailerNow() {
  const resumeText = els.resumeText.value.trim();
  const resumeFile = els.resumeFile?.files?.[0] || null;
  const jobText = els.jobText.value.trim();
  const email = els.email.value.trim();

  if (!resumeFile && (!resumeText || resumeText.length < 50)) {
    alert("Upload your resume (PDF/DOCX) or paste your resume text first.");
    return;
  }
  if (!jobText || jobText.length < 50) {
    alert("Paste the job description first.");
    return;
  }
  if (!email) {
    alert("Enter your email to activate the paywall gate in this MVP demo.");
    return;
  }

  // If not activated yet, auto-activate for the demo.
  const activatedEmail = localStorage.getItem("tailorer_demo_activated_email");
  if (activatedEmail !== email) {
    await activateDemo();
  }

  setBusy("Tailoring in progress...");
  els.tailorBtn.disabled = true;
  setResults({ tailoredResume: "", coverLetter: "", keywordCoverage: null });

  try {
    let res;
    if (resumeFile) {
      const form = new FormData();
      form.append("resume", resumeFile);
      form.append("jobText", jobText);
      form.append("email", email);
      res = await fetch("/api/tailor-upload", { method: "POST", body: form });
    } else {
      res = await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText, jobText, email }),
      });
    }
    const data = await res.json();

    if (!res.ok) {
      const msg = data?.message || data?.error || "Tailoring failed";
      if (res.status === 402) {
        els.activationStatus.textContent =
          "Paywall gate blocked generation. Activate demo subscription first.";
      }
      throw new Error(msg);
    }

    setResults({
      tailoredResume: data?.tailoredResume,
      coverLetter: data?.coverLetter,
      keywordCoverage: data?.keywordCoverage,
    });
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    els.tailorBtn.disabled = false;
    setBusy("");
  }
}

els.activateBtn.addEventListener("click", activateDemo);
els.tailorBtn.addEventListener("click", tailerNow);

els.downloadResumeBtn.addEventListener("click", async () => {
  await downloadPdf(
    "/api/export/resume-pdf",
    "tailored-resume.pdf",
    els.tailoredResume.value || ""
  );
});

els.downloadResumeDocxBtn.addEventListener("click", async () => {
  const uploaded = els.resumeFile?.files?.[0] || null;
  if (!uploaded || !uploaded.name.toLowerCase().endsWith(".docx")) {
    alert("Upload a DOCX resume to download an in-place tailored DOCX.");
    return;
  }
  if (!els.tailoredResume.value || els.tailoredResume.value.length < 50) {
    alert("Generate a tailored resume first.");
    return;
  }

  setBusy("Generating DOCX...");
  try {
    const form = new FormData();
    form.append("resume", uploaded);
    form.append("tailoredResume", els.tailoredResume.value);

    const res = await fetch("/api/export/resume-docx", { method: "POST", body: form });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.message || data?.error || "DOCX export failed");
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tailored-resume.docx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    setBusy("");
  }
});

els.downloadCoverBtn.addEventListener("click", async () => {
  await downloadPdf(
    "/api/export/cover-letter-pdf",
    "cover-letter.pdf",
    els.coverLetter.value || ""
  );
});

async function loadStripeConfig() {
  try {
    const res = await fetch("/api/billing/stripe-config", { method: "GET" });
    const data = await res.json();
    if (!data?.enabled) return;

    els.stripeSection.style.display = "block";
    els.subscribeWeeklyBtn.disabled = false;
    els.subscribeMonthlyBtn.disabled = false;
    els.subscribeWeeklyBtn.textContent = data.plans.weekly.label;
    els.subscribeMonthlyBtn.textContent = data.plans.monthly.label;
  } catch {
    // Keep demo-only UX on failures.
  }
}

async function subscribe(plan) {
  const email = els.email.value.trim();
  if (!email) {
    alert("Enter your email first.");
    return;
  }

  els.subscribeStatus.textContent = `Redirecting to Stripe checkout (${plan})...`;
  els.subscribeWeeklyBtn.disabled = true;
  els.subscribeMonthlyBtn.disabled = true;

  try {
    const res = await fetch("/api/billing/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, plan }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Checkout session failed");
    if (!data?.url) throw new Error("Missing checkout URL");

    window.location.href = data.url;
  } catch (err) {
    els.subscribeStatus.textContent = `Error: ${err.message}`;
    els.subscribeWeeklyBtn.disabled = false;
    els.subscribeMonthlyBtn.disabled = false;
  }
}

els.subscribeWeeklyBtn?.addEventListener("click", () => subscribe("weekly"));
els.subscribeMonthlyBtn?.addEventListener("click", () => subscribe("monthly"));

// Auto-fill with example text for first-run demo.
setExampleInputs();

// Show Stripe UI only when Stripe is configured on the backend.
loadStripeConfig();

// If we previously activated for the current email, show status.
{
  const activatedEmail = localStorage.getItem("tailorer_demo_activated_email");
  if (activatedEmail && els.email.value.trim() === "") {
    // keep empty; user must copy their email into the field
  }
}

