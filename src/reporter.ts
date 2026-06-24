import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import { execSync } from "child_process";
import { CheckType, TestPlan } from "./types";
import { state } from "./state";
import { config } from "./config";

// ─── HTML Report ──────────────────────────────────────────────────────────────

export function generateHtmlReport(testPlan: TestPlan, runAt: string): string {
  const { passed, failed, results } = state;
  const totalChecks   = passed + failed;
  const passRate      = totalChecks > 0 ? Math.round((passed / totalChecks) * 100) : 0;
  const overallStatus = failed === 0 ? "PASSED" : "FAILED";
  const statusColor   = failed === 0 ? "#22c55e" : "#ef4444";

  const allChecks = results.flatMap((s) => s.checks);
  const countPos  = allChecks.filter((c) => c.type === "positive").length;
  const countNeg  = allChecks.filter((c) => c.type === "negative").length;
  const countEdge = allChecks.filter((c) => c.type === "edge").length;

  const typeBadge: Record<CheckType, string> = {
    positive: `<span class="badge badge-pos">positive</span>`,
    negative: `<span class="badge badge-neg">negative</span>`,
    edge:     `<span class="badge badge-edge">edge</span>`,
  };

  const suiteBlocks = results.map((suite) => {
    const suitePassed = suite.checks.filter((c) => c.passed).length;
    const suiteTotal  = suite.checks.length;
    const suiteColor  = suitePassed === suiteTotal ? "#22c55e" : "#ef4444";

    const checkRows = suite.checks.map((c) => `
      <tr class="check-row" data-type="${c.type}">
        <td class="check-name">
          ${c.passed ? "✅" : "❌"}
          ${typeBadge[c.type]}
          ${c.label}${c.detail ? ` <span class="detail">(${c.detail})</span>` : ""}
        </td>
        <td class="check-desc">${testPlan[suite.suite]?.find((p) => p.label === c.label)?.description ?? ""}</td>
        <td class="check-status" style="color:${c.passed ? "#22c55e" : "#ef4444"}">${c.passed ? "PASS" : "FAIL"}</td>
      </tr>`).join("");

    return `
      <tbody class="suite-block" data-suite="${suite.suite}">
        <tr class="suite-row" onclick="toggleSuite(this)">
          <td class="suite-name">▼ ${suite.suite}</td>
          <td></td>
          <td class="suite-count" style="color:${suiteColor}">${suitePassed}/${suiteTotal}</td>
        </tr>
        <tr class="checks-container">
          <td colspan="3">
            <table class="checks-table">
              <thead><tr><th>Check</th><th>Description</th><th>Result</th></tr></thead>
              <tbody>${checkRows}</tbody>
            </table>
          </td>
        </tr>
      </tbody>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Playwright Test Report</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 2rem; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; }
    .meta { font-size: 0.85rem; color: #94a3b8; margin-bottom: 1.75rem; }
    .overall-row { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
    .overall-badge { font-size: 1rem; font-weight: 700; padding: 0.4rem 1.1rem; border-radius: 6px; background: ${statusColor}22; color: ${statusColor}; border: 1px solid ${statusColor}44; }
    .summary { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 2rem; }
    .card { background: #1e293b; border-radius: 10px; padding: 1rem 1.5rem; min-width: 120px; }
    .card-label { font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
    .card-value { font-size: 1.75rem; font-weight: 700; margin-top: 0.2rem; }
    .filter-bar { display: flex; gap: 0.6rem; margin-bottom: 1.5rem; flex-wrap: wrap; align-items: center; }
    .filter-label { font-size: 0.8rem; color: #64748b; margin-right: 0.25rem; }
    .filter-btn { cursor: pointer; border: 1px solid #334155; background: #1e293b; color: #94a3b8; font-size: 0.8rem; font-weight: 600; padding: 0.35rem 0.9rem; border-radius: 20px; transition: all 0.15s; display: flex; align-items: center; gap: 0.4rem; }
    .filter-btn:hover { border-color: #64748b; color: #e2e8f0; }
    .filter-btn.active-all  { background: #334155; border-color: #94a3b8; color: #e2e8f0; }
    .filter-btn.active-pos  { background: #14532d55; border-color: #4ade80; color: #4ade80; }
    .filter-btn.active-neg  { background: #7f1d1d55; border-color: #f87171; color: #f87171; }
    .filter-btn.active-edge { background: #78350f55; border-color: #fbbf24; color: #fbbf24; }
    .filter-btn .pill { font-size: 0.7rem; padding: 0.05rem 0.4rem; border-radius: 10px; background: #0f172a; }
    .badge { font-size: 0.62rem; font-weight: 600; padding: 0.15rem 0.4rem; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em; vertical-align: middle; margin-right: 0.3rem; }
    .badge-pos  { background: #14532d55; color: #4ade80; border: 1px solid #4ade8044; }
    .badge-neg  { background: #7f1d1d55; color: #f87171; border: 1px solid #f8717144; }
    .badge-edge { background: #78350f55; color: #fbbf24; border: 1px solid #fbbf2444; }
    table.main-table { width: 100%; border-collapse: collapse; }
    .suite-row { cursor: pointer; background: #1e293b; }
    .suite-row:hover { background: #273349; }
    .suite-row td { padding: 0.85rem 1rem; font-weight: 600; font-size: 0.95rem; border-top: 1px solid #0f172a; }
    .suite-count { text-align: right; font-size: 0.85rem; white-space: nowrap; }
    .checks-container { background: #111827; }
    .checks-container.hidden { display: none; }
    .checks-table { width: 100%; border-collapse: collapse; }
    .checks-table thead tr th { padding: 0.4rem 1rem; font-size: 0.72rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; text-align: left; border-bottom: 1px solid #1e293b; }
    .check-row td { padding: 0.55rem 1rem; font-size: 0.875rem; border-bottom: 1px solid #1e293b; vertical-align: middle; }
    .check-row.hidden-by-filter { display: none; }
    .check-name { white-space: nowrap; }
    .check-desc { color: #94a3b8; font-size: 0.8rem; }
    .check-status { text-align: right; font-weight: 600; font-size: 0.8rem; white-space: nowrap; }
    .detail { color: #64748b; font-size: 0.8rem; }
    .suite-block.hidden-by-filter { display: none; }
  </style>
</head>
<body>
  <h1>Playwright Test Report</h1>
  <p class="meta">Run at: ${runAt}</p>
  <div class="overall-row"><span class="overall-badge">${overallStatus}</span></div>
  <div class="summary">
    <div class="card"><div class="card-label">Passed</div><div class="card-value" style="color:#22c55e">${passed}</div></div>
    <div class="card"><div class="card-label">Failed</div><div class="card-value" style="color:${failed > 0 ? "#ef4444" : "#94a3b8"}">${failed}</div></div>
    <div class="card"><div class="card-label">Total</div><div class="card-value">${totalChecks}</div></div>
    <div class="card"><div class="card-label">Pass Rate</div><div class="card-value" style="color:${passRate === 100 ? "#22c55e" : "#f59e0b"}">${passRate}%</div></div>
  </div>
  <div class="filter-bar">
    <span class="filter-label">Filter by type:</span>
    <button class="filter-btn active-all" data-filter="all"      onclick="applyFilter('all')">All <span class="pill">${totalChecks}</span></button>
    <button class="filter-btn"           data-filter="positive"  onclick="applyFilter('positive')">✅ Positive <span class="pill">${countPos}</span></button>
    <button class="filter-btn"           data-filter="negative"  onclick="applyFilter('negative')">❌ Negative <span class="pill">${countNeg}</span></button>
    <button class="filter-btn"           data-filter="edge"      onclick="applyFilter('edge')">⚠️ Edge <span class="pill">${countEdge}</span></button>
  </div>
  <table class="main-table">${suiteBlocks}</table>
  <script>
    const ACTIVE = { all:'active-all', positive:'active-pos', negative:'active-neg', edge:'active-edge' };
    function applyFilter(type) {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active-all','active-pos','active-neg','active-edge'));
      document.querySelector('[data-filter="'+type+'"]').classList.add(ACTIVE[type]);
      document.querySelectorAll('.suite-block').forEach(block => {
        const rows = block.querySelectorAll('.check-row');
        let visible = 0;
        rows.forEach(r => { const m = type==='all'||r.dataset.type===type; r.classList.toggle('hidden-by-filter',!m); if(m) visible++; });
        block.classList.toggle('hidden-by-filter', visible===0);
        const container = block.querySelector('.checks-container');
        const nameCell  = block.querySelector('.suite-row td');
        if (type==='all') { container.classList.remove('hidden'); if(nameCell) nameCell.textContent=nameCell.textContent.replace('▶','▼'); }
        else if (visible>0) { container.classList.remove('hidden'); if(nameCell) nameCell.textContent=nameCell.textContent.replace('▶','▼'); }
      });
    }
    function toggleSuite(row) {
      row.nextElementSibling.classList.toggle('hidden');
      const c = row.querySelector('td');
      if(c) c.textContent = c.textContent.startsWith('▶') ? c.textContent.replace('▶','▼') : c.textContent.replace('▼','▶');
    }
  </script>
</body>
</html>`;
}

export function saveHtmlReport(testPlan: TestPlan, runAt: string): string {
  const html      = generateHtmlReport(testPlan, runAt);
  const reportDir = config.reportsDir;
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = `${reportDir}/report.html`;
  fs.writeFileSync(reportPath, html);
  console.log(`HTML report saved → ${reportPath}`);
  return reportPath;
}

export function saveJsonResult(testPlan: TestPlan, runAt: string): string {
  const { passed, failed, results } = state;
  const total    = passed + failed;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

  const data = {
    runAt:          new Date().toISOString(),
    runAtDisplay:   runAt,
    passed,
    failed,
    total,
    passRate,
    suites: results.map((s) => ({
      suite:   s.suite,
      passed:  s.checks.filter((c) => c.passed).length,
      failed:  s.checks.filter((c) => !c.passed).length,
      total:   s.checks.length,
      checks:  s.checks.map((c) => ({
        label:       c.label,
        type:        c.type,
        passed:      c.passed,
        detail:      c.detail ?? null,
        description: testPlan[s.suite]?.find((p) => p.label === c.label)?.description ?? "",
      })),
    })),
  };

  const historyDir = path.join(config.reportsDir, "history");
  fs.mkdirSync(historyDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/:/g, "-").replace("T", "_").slice(0, 19);
  const jsonPath  = path.join(historyDir, `${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
  console.log(`JSON result saved → ${jsonPath}`);
  return jsonPath;
}

// ─── Google Chat ──────────────────────────────────────────────────────────────

function postToWebhook(webhookUrl: string, body: object): Promise<void> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url     = new URL(webhookUrl);
    const req = https.request(
      { hostname: url.hostname, path: url.pathname + url.search, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
      (res) => { res.resume(); res.on("end", resolve); }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function uploadReport(reportPath: string): string | null {
  try {
    const url = execSync(
      `curl -s --upload-file "${reportPath}" https://transfer.sh/playwright-report.html`,
      { timeout: 15000 }
    ).toString().trim();
    return url.startsWith("http") ? url : null;
  } catch {
    return null;
  }
}

export async function sendGChatReport(runAt: string, reportPath: string) {
  const webhookUrl = config.gchatWebhook;
  if (!webhookUrl) {
    console.log("ℹ️  GCHAT_WEBHOOK not set — skipping Google Chat notification.");
    return;
  }

  const { passed, failed, results } = state;
  const green  = "#1faa70";
  const red    = "#e55770";
  const orange = "#FFA500";
  const totalChecks  = passed + failed;
  const passRate     = totalChecks > 0 ? Math.round((passed / totalChecks) * 100) : 0;
  const overallColor = failed === 0 ? green : red;
  const overallLabel = failed === 0 ? "✅ ALL PASSED" : "❌ FAILED";

  const allChecks = results.flatMap((s) => s.checks);
  const countPos  = allChecks.filter((c) => c.type === "positive").length;
  const countNeg  = allChecks.filter((c) => c.type === "negative").length;
  const countEdge = allChecks.filter((c) => c.type === "edge").length;

  console.log("⬆️  Uploading HTML report...");
  const reportLink = uploadReport(reportPath);
  if (reportLink) console.log(`🔗 Report URL: ${reportLink}`);

  const typeColor: Record<CheckType, string> = { positive: green, negative: red, edge: orange };
  const typeTag:   Record<CheckType, string> = { positive: "[+]", negative: "[-]", edge: "[~]" };

  const sections: object[] = [
    {
      header: "",
      widgets: [
        { textParagraph: { text: `<font color="${overallColor}"><b>${overallLabel}</b></font>   <font color="#94a3b8">${runAt}</font>` } },
        { textParagraph: { text:
            `<font color="${green}"><b>✅ Passed: ${passed}</b></font>&nbsp;&nbsp;|&nbsp;&nbsp;` +
            `<font color="${red}"><b>❌ Failed: ${failed}</b></font>&nbsp;&nbsp;|&nbsp;&nbsp;` +
            `<b>📊 Total: ${totalChecks}</b>&nbsp;&nbsp;|&nbsp;&nbsp;` +
            `<font color="${failed === 0 ? green : orange}"><b>🎯 Pass Rate: ${passRate}%</b></font>` } },
        { textParagraph: { text:
            `<font color="${green}"><b>[+] Positive: ${countPos}</b></font>&nbsp;&nbsp;•&nbsp;&nbsp;` +
            `<font color="${red}"><b>[-] Negative: ${countNeg}</b></font>&nbsp;&nbsp;•&nbsp;&nbsp;` +
            `<font color="${orange}"><b>[~] Edge: ${countEdge}</b></font>` } },
      ],
      collapsible: false,
    },
  ];

  for (const suite of results) {
    const sp = suite.checks.filter((c) => c.passed).length;
    const st = suite.checks.length;
    const sc = sp === st ? green : red;
    const checkLines = suite.checks.map((c) => {
      const detail = c.detail ? ` <font color="#94a3b8"><i>(${c.detail})</i></font>` : "";
      return `${c.passed ? "✅" : "❌"} <font color="${typeColor[c.type]}"><b>${typeTag[c.type]}</b></font> ${c.label}${detail}`;
    });
    const widgets: object[] = checkLines.slice(0, 2).map((t) => ({ textParagraph: { text: t } }));
    if (checkLines.length > 2) widgets.push({ textParagraph: { text: checkLines.slice(2).join("<br>") } });
    sections.push({
      header: `<font color="${sc}"><b>${sp === st ? "✅" : "❌"} ${suite.suite}</b></font>&nbsp;&nbsp;<font color="#94a3b8">${sp}/${st}</font>`,
      widgets,
      collapsible: true,
      uncollapsibleWidgetsCount: 2,
    });
  }

  if (reportLink) {
    sections.push({
      header: "",
      widgets: [{ buttonList: { buttons: [{ text: "📊 Open Full HTML Report", onClick: { openLink: { url: reportLink } }, color: { red: 0.1, green: 0.65, blue: 0.44, alpha: 1 } }] } }],
      collapsible: false,
    });
  }

  const card = {
    cardsV2: [{ cardId: "playwright_report", card: {
      header: { title: "🎭 Playwright Test Report", subtitle: `${overallLabel}  •  ${totalChecks} checks  •  ${results.length} suites`, imageType: "CIRCLE", imageUrl: "https://playwright.dev/img/playwright-logo.svg" },
      sections,
    }}],
  };

  try {
    await postToWebhook(webhookUrl, card);
    console.log("📨 Report sent to Google Chat.");
  } catch (err: any) {
    console.log(`⚠️  Failed to send Google Chat report: ${err.message}`);
  }
}
