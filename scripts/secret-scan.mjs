#!/usr/bin/env node
// Jihoz.uz — maxfiy kalitlar skaneri
//
// Ishga tushirish:
//   node scripts/secret-scan.mjs
//   npm run security:scan
//
// Nima qilinadi:
//   * repo bo'ylab maxfiy kalit izlarini izlaydi (Telegram token, Supabase
//     service_role JWT, AWS kalitlari, maxfiy kalitlar, .env fayllari va ...)
//   * topilgan joylar chiqariladi va kod 1 bilan tugaydi (CI uchun)
//
// Ishga tushirishdan oldin kalitni almashtirish kerak! (docs/security.md)

import { readdir, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** tekshirilmaydigan papkalar */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".tanstack",
  ".vinxi",
  ".output",
  "dist",
  "dist-ssr",
  ".wrangler",
  ".lovable",
  "coverage",
  ".next",
  ".turbo",
]);

/** tekshirilmaydigan fayl nomlari */
const SKIP_FILES = new Set([
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.development.local",
  ".env.production.local",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
]);

/**二进制 / matn emas */
const TEXT_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".mdx", ".txt",
  ".yml", ".yaml", ".toml", ".env", ".example", ".sql", ".html", ".css", ".sh",
  ".ps1", ".bat", ".ini", ".conf", ".cfg", ".xml", ".csv", ".svg",
]);

const RULES = [
  {
    id: "telegram-bot-token",
    title: "Telegram bot tokeni",
    severity: "critical",
    // 123456789:AA... (Telegram token: 8-10 raqam + ":" + ~35 belgi)
    re: /\b\d{8,10}:[A-Za-z0-9_-]{30,45}\b/g,
    hint: "BotFather orqali /revoke bosing va yangi token bering.",
  },
  {
    id: "supabase-service-role",
    title: "Supabase service_role kaliti",
    severity: "critical",
    re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    hint: "Kalitni supabase secrets / .env'ga ko'chiring, kodda saqlamang.",
  },
  {
    id: "aws-access-key",
    title: "AWS Access Key ID",
    severity: "critical",
    re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    hint: "AWS konsolida kalitni darhol bekor qiling.",
  },
  {
    id: "private-key",
    title: "Maxfiy kalit (private key)",
    severity: "critical",
    re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
    hint: "Kalitni bekor qiling (SSH: authorized_keys'dan o'chiring).",
  },
  {
    id: "google-api-key",
    title: "Google API kaliti",
    severity: "high",
    re: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    hint: "Google Cloud Console'da kalitni o'chiring.",
  },
  {
    id: "slack-token",
    title: "Slack token",
    severity: "high",
    re: /\bxox[abposr]-[0-9A-Za-z-]{10,}\b/g,
    hint: "Slack'da tokenni revoke qiling.",
  },
  {
    id: "npm-token",
    title: "npm token",
    severity: "high",
    re: /\bnpm_[A-Za-z0-9]{36}\b/g,
    hint: "npmjs.com > Access Tokens > bekor qiling.",
  },
  {
    id: "generic-secret-assignment",
    title: "Maxfiy kalitga o'xshash qiymat",
    severity: "medium",
    re: /\b(?:api[_-]?key|secret|password|passwd|token|access[_-]?key)\s*[:=]\s*["'][^"'\s]{12,}["']/gi,
    hint: "Qiymatni .env / Edge Function secret'iga ko'chiring.",
  },
];

/** kodda bo'lishi normal bo'lgan so'zlar (false-positive filtri) */
const ALLOW = [
  "your_",
  "your-",
  "xxx",
  "xxxx",
  "placeholder",
  "example",
  "changeme",
  "test_",
  "<",
  "${",
  "{{",
  "process.env",
  "import.meta.env",
  "Deno.env",
  "supabase_url",
  "anon_key",
  "public_",
  "fake",
  "dummy",
  "sample",
  "replace_me",
  "sizning",
];

const findings = [];

function isBinaryPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!ext) return true;
  if (!TEXT_EXT.has(ext)) return true;
  return false;
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(full);
      continue;
    }

    if (!entry.isFile()) continue;
    if (SKIP_FILES.has(entry.name)) continue;
    if (isBinaryPath(full)) continue;

    await scanFile(full, rel);
  }
}

async function scanFile(full, rel) {
  let content;
  try {
    content = await readFile(full, "utf8");
  } catch {
    return;
  }
  if (!content) return;

  for (const rule of RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags);
    let match;
    while ((match = re.exec(content)) !== null) {
      const value = match[0];
      const lower = value.toLowerCase();
      if (ALLOW.some((a) => lower.includes(a))) continue;

      const line = content.slice(0, match.index).split("\n").length;
      // qiymatning bir qismini ko'rsatam (maxfiy kalitni to'liq chiqarmaymiz)
      const masked =
        value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value.slice(0, 4) + "…";

      findings.push({
        rule: rule.id,
        title: rule.title,
        severity: rule.severity,
        file: rel,
        line,
        masked,
        hint: rule.hint,
      });
    }
  }
}

function checkGitignore() {
  const problems = [];
  const gitignore = path.join(ROOT, ".gitignore");
  if (!existsSync(gitignore)) {
    problems.push(".gitignore yo'q — .env fayli tasodifan gitga tushishi mumkin.");
    return problems;
  }
  const content = readFileSyncSafe(gitignore);
  if (!content.includes(".env")) {
    problems.push(".gitignore ichida '.env' yo'q — maxfiy kalitlar gitga tushishi mumkin.");
  }
  if (!content.includes(".env.example") && content.includes(".env.*")) {
    problems.push(".gitignore ichida '.env.*' bor, lekin '.env.example' yo'q — shablon ham bloklanadi.");
  }
  return problems;
}

function readFileSyncSafe(p) {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

async function main() {
  console.log("🔍 Maxfiy kalitlar skaneri — Jihoz.uz\n");

  const ignoreProblems = checkGitignore();

  await walk(ROOT);

  if (findings.length === 0) {
    console.log("✅ Kodda ochiq maxfiy kalit topilmadi.");
  } else {
    const bySeverity = { critical: 0, high: 0, medium: 0 };
    for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;

    console.log(`❌ ${findings.length} ta potensial maxfiy kalit topildi:\n`);
    for (const f of findings) {
      const icon = f.severity === "critical" ? "🔴" : f.severity === "high" ? "🟠" : "🟡";
      console.log(`${icon} [${f.severity}] ${f.title}`);
      console.log(`   ${f.file}:${f.line}`);
      console.log(`   qiymat: ${f.masked}`);
      console.log(`   yechim: ${f.hint}\n`);
    }
    console.log(
      `Jami: 🔴 ${bySeverity.critical} · 🟠 ${bySeverity.high} · 🟡 ${bySeverity.medium}\n`,
    );
  }

  if (ignoreProblems.length > 0) {
    console.log("⚠️  .gitignore muammolari:");
    for (const p of ignoreProblems) console.log(`   - ${p}`);
    console.log("");
  }

  if (findings.length > 0 || ignoreProblems.length > 0) {
    process.exitCode = 1;
  } else {
    console.log("🎉 Xavfsizlik skaneri muvaffaqiyatli yakunlandi.");
  }
}

main().catch((err) => {
  console.error("Skaner xatosi:", err);
  process.exitCode = 2;
});
