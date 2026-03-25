const { z } = require("zod");
const stopwords = new Set([
  "about",
  "above",
  "after",
  "again",
  "against",
  "all",
  "am",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "doing",
  "down",
  "during",
  "each",
  "few",
  "for",
  "from",
  "further",
  "had",
  "has",
  "have",
  "having",
  "he",
  "her",
  "here",
  "hers",
  "herself",
  "him",
  "himself",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "itself",
  "just",
  "me",
  "more",
  "most",
  "my",
  "myself",
  "no",
  "nor",
  "not",
  "now",
  "of",
  "off",
  "on",
  "once",
  "only",
  "or",
  "other",
  "our",
  "ours",
  "ourselves",
  "out",
  "over",
  "own",
  "same",
  "she",
  "should",
  "so",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "theirs",
  "them",
  "themselves",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "too",
  "under",
  "until",
  "up",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "whom",
  "why",
  "with",
  "you",
  "your",
  "yours",
  "yourself",
  "yourselves",
]);

const toolWords = new Set([
  "python",
  "java",
  "javascript",
  "typescript",
  "react",
  "next",
  "node",
  "nodejs",
  "express",
  "sql",
  "postgres",
  "postgresql",
  "mysql",
  "redis",
  "docker",
  "kubernetes",
  "aws",
  "gcp",
  "azure",
  "terraform",
  "cloud",
  "rest",
  "graphql",
  "html",
  "css",
  "git",
  "github",
  "figma",
  "excel",
  "tableau",
  "powerbi",
  "pandas",
  "numpy",
  "scikit",
  "sklearn",
  "machine",
  "learning",
  "nlp",
  "llm",
  "llms",
  "spark",
  "hadoop",
  "etl",
  "ci",
  "cd",
  "testing",
  "jest",
  "cypress",
  "selenium",
  "jest",
  "webpack",
]);

const softWords = new Set([
  "lead",
  "leadership",
  "communicate",
  "communication",
  "collaborate",
  "collaboration",
  "stakeholder",
  "stakeholders",
  "teamwork",
  "mentor",
  "mentorship",
  "cross-functional",
  "cross functional",
  "problem-solving",
  "problem",
  "solving",
  "customer",
  "ownership",
  "initiative",
  "prioritize",
  "prioritization",
]);

function truncateByChars(s, maxChars) {
  if (!s) return "";
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars);
}

function normalizeText(s) {
  return (s || "")
    .replace(/\r\n/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .trim();
}

function extractTopKeywordsFromJob(jobText, maxKeywords = 20) {
  const text = normalizeText(jobText).toLowerCase();
  const words = text.match(/[a-zA-Z][a-zA-Z0-9+#-]{2,}/g) || [];
  const freq = new Map();
  for (const wRaw of words) {
    const w = wRaw.toLowerCase();
    if (stopwords.has(w)) continue;
    // avoid overly generic words like "work", "team" etc if they slip through
    if (w.length < 4) continue;
    if (/[0-9]/.test(w) && w.length <= 6) continue; // keep alphanumerics but reduce codes
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  const sorted = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  // Keep a stable but limited set
  return sorted.slice(0, maxKeywords);
}

function pickRoleTitle(jobText) {
  const t = normalizeText(jobText);
  const patterns = [
    /(software engineer|software developer|backend engineer|frontend engineer|full-stack engineer|full stack engineer)/i,
    /(data scientist|machine learning engineer|ml engineer)/i,
    /(data analyst|business analyst|analytics)/i,
    /(product manager|product owner)/i,
    /(project manager)/i,
    /(ux designer|ui designer|product designer)/i,
    /(devops engineer|site reliability engineer|sre)/i,
    /(engineering manager|technical lead|team lead)/i,
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m?.[1]) return m[1];
  }
  // fallback: first "role-like" word group
  const generic = t.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/);
  return generic?.[1] || "Professional";
}

function extractEducationLines(resumeText) {
  const lines = normalizeText(resumeText).split("\n").map((l) => l.trim()).filter(Boolean);
  const edu = lines.filter((l) => /(university|college|bachelor|master|phd|degree|school)/i.test(l));
  return edu.slice(0, 6);
}

function extractExperienceEvidenceLines(resumeText, keywords, maxLines = 8) {
  const lines = normalizeText(resumeText)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const needleWords = keywords.map((k) => k.toLowerCase());
  const hit = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (needleWords.some((k) => k.length >= 3 && lower.includes(k))) {
      if (!hit.includes(line)) hit.push(line);
    }
    if (hit.length >= maxLines) break;
  }
  return hit;
}

function findCompanyName(jobText) {
  const t = normalizeText(jobText);
  const at = t.match(/\bat\s+([A-Z][A-Za-z0-9&.\- ]{2,60})\b/);
  if (at?.[1]) return at[1].trim().replace(/\s+at\s+$/i, "");
  const companyLine = t.match(/company\s*[:\-]\s*([^\n]+)/i);
  if (companyLine?.[1]) return companyLine[1].trim();
  return null;
}

function extractResponsibilities(jobText) {
  const lines = normalizeText(jobText).split("\n").map((l) => l.trim()).filter(Boolean);
  const headerIdx = lines.findIndex((l) => /(responsibilit|what you|what we|day-to-day|you will|you’ll)/i.test(l));
  if (headerIdx >= 0) {
    const slice = lines.slice(headerIdx + 1, headerIdx + 9);
    return slice.filter((l) => l.length >= 12);
  }
  // fallback: pick lines that look like bullets
  const bullets = lines.filter((l) => /^[-•*]/.test(l) || /\bresponsible\b/i.test(l));
  return bullets.slice(0, 7);
}

function categorizeKeywords(keywords) {
  const core = [];
  const tools = [];
  const soft = [];

  for (const kw of keywords) {
    const k = kw.toLowerCase();
    if (softWords.has(k) || Array.from(softWords).some((sw) => sw.includes(k) || k.includes(sw))) {
      soft.push(kw);
    } else if (toolWords.has(k)) {
      tools.push(kw);
    } else {
      core.push(kw);
    }
  }

  const uniq = (arr) => Array.from(new Set(arr));
  return {
    tools: uniq(tools).slice(0, 10),
    soft: uniq(soft).slice(0, 8),
    core: uniq(core).slice(0, 12),
  };
}

function keywordEvidenceSnippets(resumeText, keyword, maxSnippets = 3) {
  const text = normalizeText(resumeText);
  const k = (keyword || "").trim();
  if (!k) return [];

  const lower = text.toLowerCase();
  const needle = k.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx === -1) return [];

  // Extract a small window around the first match; avoid huge resume inclusion.
  const start = Math.max(0, idx - 180);
  const end = Math.min(text.length, idx + 180);
  const snippet = text.slice(start, end).replace(/\s+/g, " ").trim();

  // Also capture nearby line(s) for more evidence.
  const lines = text.split("\n");
  const snippetLines = [];
  for (const line of lines) {
    if (line.toLowerCase().includes(needle)) snippetLines.push(line.trim());
    if (snippetLines.length >= maxSnippets) break;
  }

  return snippetLines.length ? snippetLines.slice(0, maxSnippets) : [snippet];
}

async function tailorResumeAndCoverLetter({ resumeText, jobText, email }) {
  const llmMode = process.env.LLM_MODE || "auto";
  const openaiKey = process.env.OPENAI_API_KEY;
  const shouldMock =
    llmMode === "mock" || !openaiKey || openaiKey === "undefined" || openaiKey === "";

  const maxJobChars = Number(process.env.MAX_JOB_CHARS || 12000);
  const maxResumeChars = Number(process.env.MAX_RESUME_CHARS || 20000);

  const cleanResume = normalizeText(resumeText).slice(0, maxResumeChars);
  const cleanJob = normalizeText(jobText).slice(0, maxJobChars);

  if (shouldMock) {
    return tailorMock(cleanResume, cleanJob);
  }

  try {
    const OpenAI = require("openai").default;
    const client = new OpenAI({ apiKey: openaiKey });
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const roleTitle = pickRoleTitle(cleanJob);

    // Step 1: extract job keywords (LLM) so we can group more accurately.
    const requirements = await extractJobRequirementsWithLLM({ client, model, jobText: cleanJob, roleTitle });
    const keywords = (requirements.keywordGroups || [])
      .flatMap((g) => g.keywords || [])
      .slice(0, 24);

    // Step 2: map evidence directly from resume text (deterministic).
    const keywordEvidence = {};
    for (const kw of keywords) {
      const snippets = keywordEvidenceSnippets(cleanResume, kw, 3);
      if (snippets.length) keywordEvidence[kw] = snippets;
    }
    const missingKeywords = keywords.filter((kw) => !keywordEvidence[kw]);

    // Step 3: generate resume + cover letter grounded on evidence.
    const generated = await generateWithLLM({
      client,
      model,
      roleTitle: requirements.roleTitle || roleTitle,
      companyOrTeam: requirements.companyOrTeam || findCompanyName(cleanJob) || undefined,
      responsibilities: requirements.responsibilities || extractResponsibilities(cleanJob).slice(0, 6),
      keywordGroups: requirements.keywordGroups || [],
      keywordEvidence,
      missingKeywords,
    });

    // Step 4: compute coverage post-facto for safety.
    const tailoredResume = generated.tailoredResume || "";
    const resumeLower = tailoredResume.toLowerCase();

    const coverage = {
      groups: (requirements.keywordGroups || []).map((g) => {
        const covered = [];
        const missing = [];
        for (const kw of g.keywords || []) {
          if (!kw) continue;
          if (resumeLower.includes(String(kw).toLowerCase())) covered.push(kw);
          else missing.push(kw);
        }
        return { name: g.name, covered, missing };
      }),
    };

    return {
      tailoredResume,
      coverLetter: generated.coverLetter || "",
      keywordCoverage: coverage,
      meta: {
        email,
        llmMode: "llm",
        roleTitle: requirements.roleTitle || roleTitle,
      },
    };
  } catch (err) {
    // If the LLM call fails, still return something useful for the demo.
    return tailorMock(cleanResume, cleanJob);
  }
}

function tailorMock(resumeText, jobText) {
  const roleTitle = pickRoleTitle(jobText);
  const company = findCompanyName(jobText);
  const responsibilities = extractResponsibilities(jobText).slice(0, 6);

  const topKeywords = extractTopKeywordsFromJob(jobText, 18);
  const categorized = categorizeKeywords(topKeywords);
  const allKeywords = [...categorized.tools, ...categorized.core, ...categorized.soft].slice(0, 20);
  const resumeLower = resumeText.toLowerCase();

  const covered = [];
  const missing = [];
  for (const kw of allKeywords) {
    if (!kw) continue;
    if (resumeLower.includes(kw.toLowerCase())) covered.push(kw);
    else missing.push(kw);
  }

  const roleLine = company ? `${roleTitle} role at ${company}` : `${roleTitle} role`;
  const summaryKeywords = covered.slice(0, 10);

  const skillLines = covered.length ? covered : topKeywords.slice(0, 10);
  const experienceLines = extractExperienceEvidenceLines(resumeText, covered.length ? covered : allKeywords, 8);
  const educationLines = extractEducationLines(resumeText);

  const keywordCoverage = [
    { name: "Tools & Technologies", covered: categorized.tools.filter((k) => resumeLower.includes(k.toLowerCase())), missing: categorized.tools.filter((k) => !resumeLower.includes(k.toLowerCase())) },
    { name: "Core Skills", covered: categorized.core.filter((k) => resumeLower.includes(k.toLowerCase())), missing: categorized.core.filter((k) => !resumeLower.includes(k.toLowerCase())) },
    { name: "Soft Skills", covered: categorized.soft.filter((k) => resumeLower.includes(k.toLowerCase())), missing: categorized.soft.filter((k) => !resumeLower.includes(k.toLowerCase())) },
  ];

  const tailoredResumeParts = [];
  tailoredResumeParts.push(`SUMMARY`);
  tailoredResumeParts.push(
    `ATS-targeted summary for ${roleLine}. Focused on ${summaryKeywords.length ? summaryKeywords.join(", ") : "relevant skills"} drawn directly from your resume.`
  );
  tailoredResumeParts.push("");

  tailoredResumeParts.push(`CORE SKILLS`);
  tailoredResumeParts.push(skillLines.map((k) => `- ${k}`).join("\n"));
  tailoredResumeParts.push("");

  tailoredResumeParts.push(`PROFESSIONAL EXPERIENCE`);
  if (experienceLines.length) {
    tailoredResumeParts.push(experienceLines.slice(0, 8).map((l) => (l.startsWith("-") ? l : `- ${l}`)).join("\n"));
  } else {
    // No evidence lines found: keep it safe and minimal.
    tailoredResumeParts.push(`- Tailored bullets will be added once your resume includes role-relevant keywords (e.g., ${allKeywords.slice(0, 5).join(", ")}).`);
  }
  tailoredResumeParts.push("");

  if (educationLines.length) {
    tailoredResumeParts.push(`EDUCATION`);
    tailoredResumeParts.push(educationLines.map((l) => `- ${l}`).join("\n"));
    tailoredResumeParts.push("");
  }

  // Cover letter
  const coveredLine = covered.length ? covered.slice(0, 10).join(", ") : topKeywords.slice(0, 10).join(", ");
  const firstParagraph = `Dear Hiring Manager,\n\nI am excited to apply for the ${roleLine}. Based on your job requirements, my resume demonstrates experience aligned with ${coveredLine}. I’m applying because I can quickly contribute to your team by focusing on the skills you’re prioritizing.`;

  const respBullets = responsibilities.length ? responsibilities : [];
  const secondParagraph = respBullets.length
    ? `In particular, I have worked on responsibilities like:\n${respBullets
        .slice(0, 4)
        .map((l) => (l.startsWith("-") ? l : `- ${l}`))
        .join("\n")}\n\nMy resume evidence directly supports these themes, and I can translate them into clear deliverables in a fast-moving environment.`
    : `In particular, I focus on delivering outcomes across the most important job responsibilities, and my resume evidence supports those areas.`;

  const thirdParagraph = `Thank you for your time and consideration. I’d welcome the opportunity to discuss how my background aligns with your needs.`;

  const coverLetter = `${firstParagraph}\n\n${secondParagraph}\n\n${thirdParagraph}\n\nSincerely,\n[Your Name]`;

  return {
    tailoredResume: tailoredResumeParts.join("\n"),
    coverLetter,
    keywordCoverage: { groups: keywordCoverage },
    meta: { llmMode: "mock", roleTitle },
    _demo: missing.length ? { missingKeywords: missing.slice(0, 12) } : undefined,
  };
}

async function extractJobRequirementsWithLLM({ client, model, jobText, roleTitle }) {
  const resSchema = z.object({
    roleTitle: z.string(),
    companyOrTeam: z.string().optional(),
    keywordGroups: z.array(
      z.object({
        name: z.string(),
        importance: z.enum(["required", "preferred"]),
        keywords: z.array(z.string()).min(1),
      }),
    ),
    responsibilities: z.array(z.string()).max(10).optional(),
  });

  const prompt = `
You are extracting job requirements for ATS keyword tailoring.
Return ONLY valid JSON matching the schema.

Job description:
"""${jobText}"""

If you can't identify a field, return an empty array for responsibilities and omit companyOrTeam.

Constraints:
- Provide at most 3 keywordGroups.
- Each group should have 5-12 keywords (max 24 total keywords).
- keywords should be short phrases (1-4 words), lowercase where possible, no punctuation.
- responsibilities should be 3-7 short bullet-like strings.
`.trim();

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: "You return strict JSON only." },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
    // Best-effort JSON mode. If unsupported, we'll fall back to mock.
    response_format: { type: "json_object" },
  });

  const raw = completion?.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw);
  const validated = resSchema.parse(parsed);

  return { ...validated, roleTitle: validated.roleTitle || roleTitle };
}

async function generateWithLLM({
  client,
  model,
  roleTitle,
  companyOrTeam,
  responsibilities,
  keywordGroups,
  keywordEvidence,
  missingKeywords,
}) {
  const prompt = `
Tailor an ATS-safe resume + cover letter using ONLY evidence from the user's resume.

ROLE
- roleTitle: ${JSON.stringify(roleTitle)}
- companyOrTeam (if known): ${JSON.stringify(companyOrTeam || "")}

JOB RESPONSIBILITIES (use them to mirror phrasing, not to invent new experience)
${responsibilities.map((r) => `- ${r}`).join("\n")}

KEYWORD GROUPS
${JSON.stringify(keywordGroups)}

EVIDENCE (ground truth; you may reuse or paraphrase but do not invent)
For each keyword, evidence contains snippets from the user's resume where the keyword appears.
${JSON.stringify(keywordEvidence, null, 2)}

MISSING KEYWORDS
These keywords have no evidence snippets in the resume; you must NOT claim them in the resume.
${JSON.stringify(missingKeywords || [])}

OUTPUT REQUIREMENTS
- Output must be valid JSON.
- tailoredResume must be plain text with headings: SUMMARY, CORE SKILLS, PROFESSIONAL EXPERIENCE, EDUCATION (if education exists in the resume).
- coverLetter must be plain text, 3-4 short paragraphs, with "Dear Hiring Manager," and a sign-off.
- ATS-safe: no tables, no markdown, no special formatting.
- Safety: Do not invent employers, dates, degrees, certifications, metrics, or tools not supported by evidence snippets.
`.trim();

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: "You return strict JSON only." },
      { role: "user", content: prompt },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const raw = completion?.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw);
  const outputSchema = z.object({
    tailoredResume: z.string(),
    coverLetter: z.string(),
    keywordCoverage: z.any().optional(),
  });
  return outputSchema.parse(parsed);
}

module.exports = {
  tailorResumeAndCoverLetter,
};

