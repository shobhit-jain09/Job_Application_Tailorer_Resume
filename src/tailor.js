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
    // Handle escaped newlines coming from some clients/logging.
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
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

function extractContactBlock(resumeText) {
  const lines = normalizeText(resumeText).split("\n").map((l) => l.trim()).filter(Boolean);
  const first = lines.slice(0, 6);
  const contactLike = first.filter((l) => /@|linkedin|github|\+?\d[\d\s().-]{6,}/i.test(l));
  // Keep it short and ATS-safe.
  return contactLike.slice(0, 3);
}

function splitLikelySkills(resumeText) {
  const lines = normalizeText(resumeText).split("\n").map((l) => l.trim()).filter(Boolean);
  const skills = new Map(); // lower -> canonical
  for (const line of lines) {
    // Heuristic: skills lines often have commas or pipes.
    if (/(skills|core skills|technologies|tooling)/i.test(line) || /[,|•]/.test(line)) {
      const parts = line
        .replace(/^[-•*]\s*/, "")
        .split(/[,|•]/g)
        .map((p) => p.trim())
        .filter((p) => p.length >= 2 && p.length <= 30);
      for (const p of parts) {
        // Filter obvious non-skill phrases.
        if (/^(summary|experience|education)$/i.test(p)) continue;
        if (/\s{2,}/.test(p)) continue;
        if (p.split(" ").length > 4) continue;
        const lower = p.toLowerCase();
        if (!skills.has(lower)) skills.set(lower, p);
      }
    }
    if (skills.size >= 40) break;
  }
  return Array.from(skills.values()).slice(0, 32);
}

function groupSkills(skills, preferredKeywords) {
  const norm = (s) => String(s || "").trim();
  const sLower = (s) => norm(s).toLowerCase();

  const keep = new Set();
  for (const kw of preferredKeywords || []) keep.add(sLower(kw));

  const uniqMap = new Map();
  for (const s of skills || []) {
    const t = norm(s);
    if (!t) continue;
    const lower = t.toLowerCase();
    if (!uniqMap.has(lower)) uniqMap.set(lower, t);
  }

  const ranked = Array.from(uniqMap.values())
    .map((s) => ({ s, score: keep.has(sLower(s)) ? 2 : toolWords.has(sLower(s)) ? 1 : 0 }))
    .sort((a, b) => b.score - a.score || a.s.localeCompare(b.s))
    .map((x) => x.s);

  const buckets = {
    "Languages": [],
    "Frameworks": [],
    "Databases": [],
    "Cloud / DevOps": [],
    "Testing / Quality": [],
    "Other": [],
  };

  for (const s of ranked) {
    const l = sLower(s);
    if (/(python|java|javascript|typescript|go|golang|c\+\+|c#|ruby|php|swift|kotlin)/i.test(l)) buckets["Languages"].push(s);
    else if (/(react|next|node|express|django|flask|spring|dotnet|laravel)/i.test(l)) buckets["Frameworks"].push(s);
    else if (/(postgres|postgresql|mysql|sql|mongodb|dynamodb|redis)/i.test(l)) buckets["Databases"].push(s);
    else if (/(aws|gcp|azure|docker|kubernetes|terraform|ci\/cd|cicd|linux)/i.test(l)) buckets["Cloud / DevOps"].push(s);
    else if (/(jest|cypress|selenium|testing|unit test|integration test|qa)/i.test(l)) buckets["Testing / Quality"].push(s);
    else buckets["Other"].push(s);
  }

  // Remove empty buckets and cap sizes.
  const out = [];
  for (const [name, arr] of Object.entries(buckets)) {
    const uniq = Array.from(new Set(arr));
    if (!uniq.length) continue;
    out.push({ name, items: uniq.slice(0, 10) });
  }
  return out;
}

function extractBulletLikeExperience(resumeText) {
  const lines = normalizeText(resumeText).split("\n").map((l) => l.trim()).filter(Boolean);
  const bullets = [];
  for (const l of lines) {
    const isBullet = /^[-•*]\s+/.test(l);
    const looksLikeImpact = /\b(built|designed|implemented|improved|optimized|reduced|increased|delivered|led|migrated|automated)\b/i.test(
      l,
    );
    if (isBullet || looksLikeImpact) {
      const clean = l.replace(/^[-•*]\s+/, "");
      if (clean.length >= 18) bullets.push(clean);
    }
    if (bullets.length >= 10) break;
  }
  return bullets;
}

function renderModernAtsResumeTemplate({
  roleTitle,
  company,
  contactLines,
  summaryLine,
  skillGroups,
  experienceBullets,
  educationLines,
  keywordLine,
}) {
  const parts = [];

  // Top header (placeholders keep it usable while staying ATS-safe).
  parts.push("[YOUR NAME]");
  parts.push("[City, State]  |  [Phone]  |  [Email]  |  [LinkedIn]  |  [GitHub/Portfolio]");
  if (contactLines?.length) {
    parts.push(contactLines.join("  |  "));
  }
  parts.push("");

  parts.push("TARGET ROLE");
  parts.push(company ? `${roleTitle} (Target: ${company})` : `${roleTitle}`);
  parts.push("");

  parts.push("PROFESSIONAL SUMMARY");
  parts.push(summaryLine);
  if (keywordLine) parts.push(keywordLine);
  parts.push("");

  parts.push("KEY SKILLS");
  if (skillGroups?.length) {
    for (const g of skillGroups) {
      parts.push(`${g.name}: ${g.items.join(", ")}`);
    }
  }
  parts.push("");

  parts.push("SELECTED IMPACT");
  if (experienceBullets?.length) {
    for (const b of experienceBullets.slice(0, 8)) parts.push(`- ${b}`);
  } else {
    parts.push("- Add 4–8 impact bullets here (pulled from your resume experience section).");
  }
  parts.push("");

  if (educationLines?.length) {
    parts.push("EDUCATION");
    for (const e of educationLines.slice(0, 6)) parts.push(`- ${e}`);
    parts.push("");
  }

  return parts.join("\n");
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

  const roleLine = company ? `${roleTitle} at ${company}` : `${roleTitle}`;
  const summaryKeywords = covered.slice(0, 10);

  const extractedSkills = splitLikelySkills(resumeText);
  const prefer = covered.length ? covered : topKeywords.slice(0, 12);
  const mergedSkills = Array.from(new Set([...(prefer || []), ...(extractedSkills || [])])).slice(0, 40);
  const skillGroups = groupSkills(mergedSkills, prefer);

  const experienceBullets = extractBulletLikeExperience(resumeText);
  const experienceFallback = extractExperienceEvidenceLines(resumeText, covered.length ? covered : allKeywords, 8)
    .map((l) => l.replace(/^[-•*]\s+/, ""))
    .filter((l) => !/^(summary|core skills|professional experience|education)$/i.test(l));
  const pickedBullets = (experienceBullets.length ? experienceBullets : experienceFallback).slice(0, 8);
  const educationLines = extractEducationLines(resumeText);
  const contactLines = extractContactBlock(resumeText);

  const summaryLine = `ATS-optimized ${roleLine} resume highlighting ${summaryKeywords.length ? summaryKeywords.join(", ") : "role-aligned skills"} proven in your experience.`;
  const keywordLine = summaryKeywords.length ? `Focus keywords: ${summaryKeywords.join(", ")}.` : "";

  const keywordCoverage = [
    { name: "Tools & Technologies", covered: categorized.tools.filter((k) => resumeLower.includes(k.toLowerCase())), missing: categorized.tools.filter((k) => !resumeLower.includes(k.toLowerCase())) },
    { name: "Core Skills", covered: categorized.core.filter((k) => resumeLower.includes(k.toLowerCase())), missing: categorized.core.filter((k) => !resumeLower.includes(k.toLowerCase())) },
    { name: "Soft Skills", covered: categorized.soft.filter((k) => resumeLower.includes(k.toLowerCase())), missing: categorized.soft.filter((k) => !resumeLower.includes(k.toLowerCase())) },
  ];

  const tailoredResume = renderModernAtsResumeTemplate({
    roleTitle,
    company,
    contactLines,
    summaryLine,
    skillGroups,
    experienceBullets: pickedBullets,
    educationLines,
    keywordLine,
  });

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
    tailoredResume,
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
- tailoredResume must be plain text in a modern ATS template with these headings (verbatim):
  - [YOUR NAME] (top line)
  - TARGET ROLE
  - PROFESSIONAL SUMMARY
  - KEY SKILLS
  - SELECTED IMPACT
  - EDUCATION (only if education exists in the resume evidence)
  Keep it one-page style. Use short lines and whitespace.
- SELECTED IMPACT must contain 6–10 strong bullets written in modern style (action + scope + impact) but WITHOUT inventing metrics or tools.
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

