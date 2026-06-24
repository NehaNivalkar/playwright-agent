#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const historyDir = process.argv[2] || path.join(__dirname, '..', 'reports', 'history');
const outputPath = process.argv[3] || path.join(__dirname, '..', 'reports', 'dashboard.html');

// ── Load & sort history ────────────────────────────────────────────────────────
if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });

const runs = fs
  .readdirSync(historyDir)
  .filter(f => f.endsWith('.json'))
  .sort()
  .map(f => { try { return JSON.parse(fs.readFileSync(path.join(historyDir, f), 'utf8')); } catch { return null; } })
  .filter(Boolean);

// ── Partition ──────────────────────────────────────────────────────────────────
const now       = new Date();
const todayStr  = now.toISOString().slice(0, 10);
const weekAgo   = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const todayRuns  = runs.filter(r => r.runAt && r.runAt.slice(0, 10) === todayStr);
const weeklyRuns = runs.filter(r => r.runAt && r.runAt.slice(0, 10) >= weekAgo);
const latestRun  = todayRuns.at(-1) || runs.at(-1) || null;
const chartRuns  = runs.slice(-20);
const heatmapRuns = weeklyRuns.slice(-14);

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function fmtDateTime(iso) { return iso ? `${fmtDate(iso)} · ${fmtTime(iso)}` : '—'; }
function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function failCount(suiteName, runs) {
  return runs.reduce((n, r) => {
    const s = (r.suites||[]).find(x => x.suite === suiteName);
    return n + (s && s.failed > 0 ? 1 : 0);
  }, 0);
}

// ── Weekly stats ───────────────────────────────────────────────────────────────
function weeklyStats(runs) {
  if (!runs.length) return { count: 0, avgRate: 0, best: 0, mostFailing: '—' };
  const count   = runs.length;
  const avgRate = Math.round(runs.reduce((s, r) => s + (r.passRate || 0), 0) / count);
  const best    = Math.max(...runs.map(r => r.passRate || 0));
  const fc = {};
  for (const r of runs)
    for (const s of (r.suites || []))
      if (s.failed > 0) fc[s.suite] = (fc[s.suite] || 0) + 1;
  const mostFailing = Object.keys(fc).sort((a,b) => fc[b]-fc[a])[0] || '—';
  return { count, avgRate, best, mostFailing };
}

// ── Flaky detection ────────────────────────────────────────────────────────────
function detectFlakySuites(runs) {
  // A suite is flaky if it has BOTH passing and failing runs (not just consistently broken)
  const stats = new Map();
  for (const run of runs) {
    for (const s of (run.suites || [])) {
      if (!stats.has(s.suite)) stats.set(s.suite, { passRuns: 0, failRuns: 0 });
      const e = stats.get(s.suite);
      s.failed === 0 ? e.passRuns++ : e.failRuns++;
    }
  }
  const flaky = new Map();
  for (const [suite, e] of stats)
    if (e.passRuns > 0 && e.failRuns > 0) flaky.set(suite, e);
  return flaky;
}

function detectFlakyChecks(runs) {
  // Returns Map<"suite::label", { passRuns, failRuns }> for checks with mixed history
  const stats = new Map();
  for (const run of runs) {
    for (const s of (run.suites || [])) {
      for (const c of (s.checks || [])) {
        const key = `${s.suite}::${c.label}`;
        if (!stats.has(key)) stats.set(key, { passRuns: 0, failRuns: 0 });
        const e = stats.get(key);
        c.passed ? e.passRuns++ : e.failRuns++;
      }
    }
  }
  const flaky = new Map();
  for (const [key, e] of stats)
    if (e.passRuns > 0 && e.failRuns > 0) flaky.set(key, e);
  return flaky;
}

function buildFlakySection(hmRuns, flakySuites) {
  if (!flakySuites.size) return '';

  const rows = [...flakySuites.entries()].map(([suite, e]) => {
    const pattern = hmRuns.map(r => {
      const s = (r.suites||[]).find(x => x.suite === suite);
      if (!s) return `<span class="fp-none">·</span>`;
      return s.failed === 0
        ? `<span class="fp-pass">✓</span>`
        : `<span class="fp-fail">✗</span>`;
    }).join('');

    // Trend: look at the most recent 3 runs this suite appeared in
    const recentAppearances = hmRuns
      .map(r => (r.suites||[]).find(x => x.suite === suite))
      .filter(Boolean)
      .slice(-3);
    const recentFails = recentAppearances.filter(s => s.failed > 0).length;
    let trend;
    if (recentFails === 0)                        trend = `<span class="ft-stable">stabilising ↑</span>`;
    else if (recentFails === recentAppearances.length) trend = `<span class="ft-failing">recently failing</span>`;
    else                                           trend = `<span class="ft-flaky">intermittent</span>`;

    const failRate = Math.round(e.failRuns / (e.passRuns + e.failRuns) * 100);

    return `<div class="flaky-row">
      <span class="flaky-name">${escHtml(suite)}</span>
      <span class="flaky-pattern">${pattern}</span>
      <span class="flaky-stat">${e.failRuns}/${e.passRuns + e.failRuns} runs failed (${failRate}%)</span>
      ${trend}
    </div>`;
  }).join('');

  return `
    <div class="section-lbl">flaky alerts — ${flakySuites.size} suite${flakySuites.size !== 1 ? 's' : ''}</div>
    <div class="flaky-list">${rows}</div>`;
}

// ── Suite accordion blocks ─────────────────────────────────────────────────────
function buildSuiteBlocks(run, flakyChecks) {
  if (!run || !run.suites || !run.suites.length)
    return `<div class="empty-state">no runs today — results appear here after running the test suite</div>`;

  return run.suites.map(suite => {
    const hasFail = suite.failed > 0;
    const countColor = hasFail ? 'var(--fail)' : 'var(--pass)';

    const checkRows = (suite.checks || []).map(c => {
      const isFlaky = !c.passed && flakyChecks && flakyChecks.has(`${suite.suite}::${c.label}`);
      const flakyBadge = isFlaky ? `<span class="ck-flaky-badge">≈ flaky</span>` : '';
      return `
      <tr class="check-row" data-type="${escHtml(c.type)}">
        <td class="ck-label">
          <span class="ck-dot ${escHtml(c.type)}"></span>
          <span class="ck-icon">${c.passed ? '✓' : '✗'}</span>
          ${escHtml(c.label)}${flakyBadge}
          ${c.detail ? `<span class="ck-detail">${escHtml(c.detail)}</span>` : ''}
        </td>
        <td class="ck-desc">${escHtml(c.description || '')}</td>
        <td class="ck-result" style="color:${c.passed?'var(--pass)':'var(--fail)'}">${c.passed ? 'PASS' : 'FAIL'}</td>
      </tr>`;
    }).join('');

    return `
      <div class="suite-block" data-has-fail="${hasFail}">
        <div class="s-header" onclick="toggleSuite(this)">
          <div class="s-hrow">
            <span class="s-arrow">▶</span>
            <span class="s-name">${escHtml(suite.suite)}</span>
            <span class="s-count" style="color:${countColor}">${suite.passed}/${suite.total}</span>
          </div>
        </div>
        <div class="s-body">
          <table class="s-checks">
            <thead><tr>
              <th>check</th><th>description</th><th>result</th>
            </tr></thead>
            <tbody>${checkRows}</tbody>
          </table>
        </div>
      </div>`;
  }).join('');
}

// ── Heatmap ────────────────────────────────────────────────────────────────────
function buildHeatmap(runs, flakySuites) {
  if (!runs.length)
    return `<div class="empty-state">no runs in the last 7 days — history accumulates with each test run</div>`;

  const suiteNames = [...new Set(runs.flatMap(r => (r.suites||[]).map(s => s.suite)))];

  const headerCells = runs.map((r, i) => {
    const d = new Date(r.runAt);
    const dl = `${d.getMonth()+1}/${d.getDate()}`;
    const tl = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `<th class="hm-run-col" title="${dl} ${tl}">${dl}<br><span class="hm-time">${tl}</span></th>`;
  }).join('');

  const rows = suiteNames.map(suite => {
    const presentRuns  = runs.filter(r => (r.suites||[]).some(x => x.suite === suite)).length;
    const failingRuns  = runs.filter(r => { const s = (r.suites||[]).find(x => x.suite===suite); return s && s.failed > 0; }).length;
    const failRate     = presentRuns > 0 ? Math.round(failingRuns / presentRuns * 100) : 0;
    const frColor      = failRate === 0 ? 'var(--pass)' : failRate < 30 ? 'var(--edge)' : 'var(--fail)';

    const cells = runs.map((r, ci) => {
      const s   = (r.suites||[]).find(x => x.suite === suite);
      const cls = !s ? 'none' : s.failed === 0 ? 'pass' : 'fail';
      const tip = s ? `${suite}: ${s.passed}/${s.total} passed` : `${suite}: not in this run`;
      return `<td class="hm-cell"><div class="hm-pip ${cls}" data-col="${ci}" title="${escHtml(tip)}"></div></td>`;
    }).join('');

    const flakyTag = flakySuites && flakySuites.has(suite)
      ? `<span class="flaky-badge">≈</span>` : '';

    return `<tr>
      <td class="hm-suite">${escHtml(suite)}${flakyTag}</td>
      ${cells}
      <td class="hm-rate" style="color:${frColor}">${failRate}%</td>
    </tr>`;
  }).join('');

  return `<div class="hm-scroll">
    <table class="hm-table">
      <thead><tr>
        <th class="hm-suite-hdr">suite</th>
        ${headerCells}
        <th class="hm-rate-hdr">fail rate</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ── Main HTML ──────────────────────────────────────────────────────────────────
function generateDashboard(latestRun, todayRuns, weeklyRuns, allRuns) {
  const stats        = weeklyStats(weeklyRuns);
  const chartRuns    = allRuns.slice(-20);
  const hmRuns       = weeklyRuns.slice(-14);
  const flakySuites  = detectFlakySuites(weeklyRuns);
  const flakyChecks  = detectFlakyChecks(weeklyRuns);

  const todayStatus  = latestRun ? (latestRun.failed === 0 ? 'PASSED' : 'FAILED') : 'NO DATA';
  const todayChip    = latestRun ? (latestRun.failed === 0 ? 'chip-pass' : 'chip-fail') : 'chip-none';
  const todayDisplay = latestRun ? fmtDateTime(latestRun.runAt) : '—';
  const todayPassed  = latestRun?.passed  || 0;
  const todayFailed  = latestRun?.failed  || 0;
  const todayTotal   = latestRun?.total   || 0;
  const todayRate    = latestRun?.passRate || 0;
  const todaySuites  = latestRun?.suites?.length || 0;

  const allChecks = latestRun ? (latestRun.suites||[]).flatMap(s => s.checks||[]) : [];
  const cPos  = allChecks.filter(c => c.type === 'positive').length;
  const cNeg  = allChecks.filter(c => c.type === 'negative').length;
  const cEdge = allChecks.filter(c => c.type === 'edge').length;

  const weekStart = hmRuns.length ? fmtDate(hmRuns[0].runAt) : '';
  const weekEnd   = hmRuns.length ? fmtDate(hmRuns[hmRuns.length-1].runAt) : '';
  const weekRange = weekStart && weekEnd && weekStart !== weekEnd ? `${weekStart}–${weekEnd}` : (weekStart || 'this week');

  const healthClass = stats.count === 0 ? 'pill-none' : stats.avgRate >= 90 ? 'pill-pass' : stats.avgRate >= 70 ? 'pill-warn' : 'pill-fail';
  const healthLabel = stats.count === 0 ? 'no data' : `${stats.avgRate}% avg`;

  const chartData = JSON.stringify(chartRuns.map(r => ({
    passRate: r.passRate || 0, runAt: r.runAt, passed: r.passed, total: r.total
  })));

  const topDate = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>playwright / dashboard</title>
  <style>
    :root {
      --ground:     #0C0D11;
      --surface:    #12151C;
      --surface-hi: #1A1F2B;
      --border:     #1E2535;
      --text:       #E2E5EE;
      --text-mid:   #8896A8;
      --text-dim:   #48556A;
      --accent:     #7C6FE8;
      --pass:       #21CC88;
      --fail:       #F24E4E;
      --edge:       #F0A045;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas,
                   'Liberation Mono', monospace;
      background: var(--ground);
      color: var(--text);
      min-height: 100vh;
      font-size: 13px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    /* ── Topbar ── */
    .topbar {
      height: 44px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      padding: 0 1.5rem;
      gap: 0.75rem;
    }
    @keyframes logo-pulse {
      0%, 100% { opacity: 0.65; }
      50% { opacity: 1; text-shadow: 0 0 10px var(--accent); }
    }
    .logo {
      color: var(--accent);
      font-size: 1.1rem;
      animation: logo-pulse 3.5s ease-in-out infinite;
    }
    .title {
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.03em;
    }
    .topbar-right {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .week-pill {
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 0.2rem 0.55rem;
      border-radius: 2px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text-dim);
    }
    .pill-pass { color: var(--pass); background: rgba(33,204,136,0.08); border-color: rgba(33,204,136,0.25); }
    .pill-warn { color: var(--edge); background: rgba(240,160,69,0.08); border-color: rgba(240,160,69,0.25); }
    .pill-fail { color: var(--fail); background: rgba(242,78,78,0.08);  border-color: rgba(242,78,78,0.25);  }
    .date-lbl { font-size: 0.68rem; color: var(--text-dim); letter-spacing: 0.01em; }

    /* ── Tabs ── */
    .tabs {
      border-bottom: 1px solid var(--border);
      padding: 0 1.5rem;
      display: flex;
    }
    .tab {
      font-family: inherit;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 0.75rem 1.2rem 0.7rem;
      color: var(--text-dim);
      cursor: pointer;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      transition: color 0.15s, border-color 0.15s;
    }
    .tab:hover { color: var(--text-mid); }
    .tab.active { color: var(--text); border-bottom-color: var(--accent); }
    .tab .range { font-size: 0.62rem; font-weight: 400; letter-spacing: 0; text-transform: none; color: var(--text-dim); margin-left: 0.5rem; }

    /* ── Panels ── */
    .panel { display: none; }
    .panel.active { display: block; }

    /* ── TODAY hero ── */
    .today-hero {
      padding: 2.25rem 1.5rem 1.75rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: flex-end;
      gap: 2rem;
      flex-wrap: wrap;
    }
    .rate-display {
      display: flex;
      align-items: baseline;
      gap: 0.05em;
      line-height: 1;
    }
    .rate-num {
      font-size: clamp(4rem, 10vw, 6.5rem);
      font-weight: 800;
      letter-spacing: -0.045em;
      font-variant-numeric: tabular-nums;
      font-feature-settings: "tnum";
      color: var(--text);
      transition: color 0.3s;
    }
    .rate-num.all-pass { color: var(--pass); }
    .rate-pct {
      font-size: clamp(1.4rem, 3.5vw, 2.4rem);
      font-weight: 500;
      color: var(--text-dim);
      letter-spacing: -0.02em;
      align-self: flex-start;
      margin-top: 0.35em;
    }
    .hero-meta { padding-bottom: 0.4rem; }
    .status-chip {
      display: inline-block;
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 0.2rem 0.55rem;
      border-radius: 2px;
      margin-bottom: 0.45rem;
    }
    .chip-pass { background: rgba(33,204,136,0.1);  color: var(--pass); border: 1px solid rgba(33,204,136,0.25); }
    .chip-fail { background: rgba(242,78,78,0.1);   color: var(--fail); border: 1px solid rgba(242,78,78,0.25);  }
    .chip-none { background: var(--surface); color: var(--text-dim); border: 1px solid var(--border); }
    .run-info { display: block; font-size: 0.7rem; color: var(--text-dim); margin-top: 0.2rem; letter-spacing: 0.01em; }

    /* ── Stat chips row ── */
    .stat-chips {
      display: flex;
      border-bottom: 1px solid var(--border);
    }
    .stat-chip {
      flex: 1;
      padding: 1rem 1.5rem;
      border-right: 1px solid var(--border);
    }
    .stat-chip:last-child { border-right: none; }
    .sc-val {
      font-size: 1.6rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    .sc-lbl {
      font-size: 0.6rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-dim);
      margin-top: 0.3rem;
    }

    /* ── Filter bar ── */
    .filter-bar {
      display: flex;
      gap: 0.45rem;
      padding: 0.75rem 1.5rem;
      border-bottom: 1px solid var(--border);
      align-items: center;
      flex-wrap: wrap;
    }
    .f-lbl { font-size: 0.6rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-dim); margin-right: 0.2rem; }
    .fbtn {
      font-family: inherit;
      font-size: 0.68rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      padding: 0.28rem 0.65rem;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text-mid);
      border-radius: 2px;
      cursor: pointer;
      transition: all 0.12s;
    }
    .fbtn:hover { background: var(--surface-hi); color: var(--text); }
    .fbtn.fa  { background: rgba(124,111,232,0.1); border-color: rgba(124,111,232,0.35); color: var(--accent); }
    .fbtn.fp  { background: rgba(33,204,136,0.1);  border-color: rgba(33,204,136,0.3);   color: var(--pass); }
    .fbtn.fn  { background: rgba(242,78,78,0.1);   border-color: rgba(242,78,78,0.3);    color: var(--fail); }
    .fbtn.fe  { background: rgba(240,160,69,0.1);  border-color: rgba(240,160,69,0.3);   color: var(--edge); }
    .fbtn .cnt { opacity: 0.65; margin-left: 0.3em; }

    /* ── Suite accordion ── */
    .suite-block.hidden-filter { display: none; }
    .s-header { cursor: pointer; user-select: none; }
    .s-hrow {
      display: flex;
      align-items: center;
      padding: 0.65rem 1.5rem;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      transition: background 0.1s;
    }
    .s-header:hover .s-hrow { background: var(--surface-hi); }
    .s-arrow {
      font-size: 0.55rem;
      color: var(--text-dim);
      margin-right: 0.75rem;
      transition: transform 0.15s;
      display: inline-block;
      width: 0.6em;
    }
    .s-arrow.open { transform: rotate(90deg); }
    .s-name { font-size: 0.8rem; font-weight: 600; flex: 1; letter-spacing: 0.01em; }
    .s-count { font-size: 0.72rem; font-variant-numeric: tabular-nums; }
    .s-body { display: none; }
    .s-body.open { display: block; }
    .s-checks { width: 100%; border-collapse: collapse; background: #0A0C12; }
    .s-checks thead th {
      padding: 0.3rem 1.5rem;
      font-size: 0.58rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-dim);
      text-align: left;
      border-bottom: 1px solid var(--border);
      font-weight: 600;
    }
    .s-checks thead th:last-child { text-align: right; }
    .check-row td { padding: 0.45rem 1.5rem; font-size: 0.76rem; border-bottom: 1px solid #0D1018; vertical-align: middle; }
    .check-row.hidden-filter { display: none; }
    .ck-label { display: flex; align-items: center; gap: 0.5rem; white-space: nowrap; }
    .ck-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
    .ck-dot.positive { background: var(--pass); }
    .ck-dot.negative { background: var(--fail); }
    .ck-dot.edge     { background: var(--edge); }
    .ck-icon { color: var(--text-dim); font-size: 0.7rem; }
    .ck-detail { color: var(--text-dim); font-size: 0.65rem; display: block; margin-top: 0.1rem; font-weight: 400; }
    .ck-desc { color: var(--text-dim); font-size: 0.7rem; }
    .ck-result { text-align: right; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.07em; white-space: nowrap; }

    /* ── Weekly panel ── */
    .weekly-stats {
      display: flex;
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
    }
    .wstat {
      padding: 1.25rem 1.5rem;
      border-right: 1px solid var(--border);
      min-width: 120px;
    }
    .wstat:last-child { border-right: none; flex: 2; }
    .wstat-lbl { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-dim); margin-bottom: 0.35rem; }
    .wstat-val {
      font-size: 2.1rem;
      font-weight: 700;
      letter-spacing: -0.04em;
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    .wstat-sub { font-size: 0.62rem; color: var(--text-dim); margin-top: 0.25rem; }
    .wstat-fail-name { font-size: 0.85rem; font-weight: 700; color: var(--fail); margin-top: 0.35rem; line-height: 1.3; }

    /* ── Section labels ── */
    .section-lbl {
      font-size: 0.6rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--text-dim);
      padding: 1.25rem 1.5rem 0.6rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .section-lbl::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--border);
    }

    /* ── Canvas chart ── */
    .chart-wrap { padding: 0 1.5rem 0.5rem; }
    #trend-canvas { width: 100%; height: 150px; display: block; }

    /* ── Heatmap ── */
    .hm-scroll { overflow-x: auto; padding: 0 1.5rem 2rem; }
    .hm-table { border-collapse: collapse; min-width: max-content; }
    .hm-suite-hdr {
      text-align: left; padding: 0.35rem 1.5rem 0.35rem 0;
      font-size: 0.58rem; text-transform: uppercase; letter-spacing: 0.08em;
      color: var(--text-dim); border-bottom: 1px solid var(--border);
      white-space: nowrap; font-weight: 600;
    }
    .hm-run-col {
      text-align: center; padding: 0.3rem 0.3rem;
      font-size: 0.62rem; color: var(--text-dim);
      border-bottom: 1px solid var(--border);
      min-width: 48px; font-weight: 400; line-height: 1.3;
    }
    .hm-time { font-size: 0.52rem; display: block; color: var(--text-dim); }
    .hm-rate-hdr {
      text-align: right; padding: 0.35rem 0 0.35rem 1rem;
      font-size: 0.58rem; text-transform: uppercase; letter-spacing: 0.08em;
      color: var(--text-dim); border-bottom: 1px solid var(--border);
      white-space: nowrap; font-weight: 600;
    }
    .hm-suite {
      padding: 0.35rem 1.5rem 0.35rem 0;
      font-size: 0.76rem; white-space: nowrap;
      border-bottom: 1px solid var(--border);
    }
    .hm-cell { padding: 0.2rem 0.2rem; border-bottom: 1px solid var(--border); }
    .hm-pip {
      width: 36px; height: 18px; border-radius: 2px;
      margin: 0 auto; opacity: 0; cursor: default;
    }
    .hm-pip.pass { background: rgba(33,204,136,0.28); }
    .hm-pip.fail { background: rgba(242,78,78,0.3);   }
    .hm-pip.none { background: rgba(255,255,255,0.03); }
    .hm-rate {
      padding: 0.35rem 0 0.35rem 1rem;
      font-size: 0.7rem; font-weight: 700; text-align: right;
      border-bottom: 1px solid var(--border);
      font-variant-numeric: tabular-nums; white-space: nowrap;
    }

    .empty-state { padding: 3.5rem 1.5rem; color: var(--text-dim); font-size: 0.78rem; }

    /* ── Flaky ── */
    .flaky-badge {
      font-size: 0.6rem; font-weight: 700; letter-spacing: 0.04em;
      padding: 0.1rem 0.3rem; border-radius: 2px; margin-left: 0.5rem;
      background: rgba(240,160,69,0.12); color: var(--edge);
      border: 1px solid rgba(240,160,69,0.25); vertical-align: middle;
    }
    .ck-flaky-badge {
      font-size: 0.55rem; font-weight: 700; letter-spacing: 0.04em;
      padding: 0.08rem 0.28rem; border-radius: 2px; margin-left: 0.4rem;
      background: rgba(240,160,69,0.1); color: var(--edge);
      border: 1px solid rgba(240,160,69,0.2); vertical-align: middle;
    }
    .flaky-list { padding: 0 1.5rem 0.25rem; }
    .flaky-row {
      display: flex; align-items: center; gap: 1.25rem;
      padding: 0.6rem 0; border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
    }
    .flaky-row:last-child { border-bottom: none; }
    .flaky-name { font-size: 0.8rem; font-weight: 600; flex: 1; min-width: 140px; }
    .flaky-pattern { display: flex; gap: 0.35rem; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.01em; }
    .fp-pass { color: var(--pass); }
    .fp-fail { color: var(--fail); }
    .fp-none { color: var(--text-dim); }
    .flaky-stat { font-size: 0.68rem; color: var(--text-dim); white-space: nowrap; font-variant-numeric: tabular-nums; }
    .ft-stable  { font-size: 0.68rem; color: var(--pass);  white-space: nowrap; }
    .ft-failing { font-size: 0.68rem; color: var(--fail);  white-space: nowrap; }
    .ft-flaky   { font-size: 0.68rem; color: var(--edge);  white-space: nowrap; }

    @media (max-width: 640px) {
      .weekly-stats { flex-direction: column; }
      .wstat { border-right: none; border-bottom: 1px solid var(--border); }
      .stat-chips { flex-wrap: wrap; }
      .stat-chip { min-width: 80px; border-right: none; border-bottom: 1px solid var(--border); }
    }
    @media (prefers-reduced-motion: reduce) {
      .logo { animation: none; opacity: 1; }
      .rate-num { transition: none; }
      .hm-pip { opacity: 1 !important; transition: none !important; }
    }
  </style>
</head>
<body>

<!-- Topbar -->
<header class="topbar">
  <span class="logo">◈</span>
  <span class="title">playwright / dashboard</span>
  <div class="topbar-right">
    <span class="week-pill ${escHtml(healthClass)}">${escHtml(healthLabel)}</span>
    <span class="date-lbl">${escHtml(topDate)}</span>
  </div>
</header>

<!-- Tabs -->
<nav class="tabs">
  <button class="tab active" onclick="switchTab('today', this)">Today</button>
  <button class="tab" onclick="switchTab('weekly', this)">Weekly <span class="range">${escHtml(weekRange)}</span></button>
</nav>

<!-- ── TODAY ────────────────────────────────────────────────────────────────── -->
<section id="panel-today" class="panel active">
  <div class="today-hero">
    <div class="rate-display">
      <span class="rate-num ${todayRate === 100 ? 'all-pass' : ''}" id="rate-counter" data-target="${todayRate}">${todayRate}</span>
      <span class="rate-pct">%</span>
    </div>
    <div class="hero-meta">
      <span class="status-chip ${escHtml(todayChip)}">${escHtml(todayStatus)}</span>
      ${latestRun ? `<span class="run-info">${todayPassed}/${todayTotal} checks · ${escHtml(todayDisplay)}</span>` : ''}
      ${todayRuns.length > 1 ? `<span class="run-info">${todayRuns.length} runs today</span>` : ''}
    </div>
  </div>

  ${latestRun ? `
  <div class="stat-chips">
    <div class="stat-chip">
      <div class="sc-val" style="color:var(--pass)">${todayPassed}</div>
      <div class="sc-lbl">passed</div>
    </div>
    <div class="stat-chip">
      <div class="sc-val" style="color:${todayFailed > 0 ? 'var(--fail)' : 'var(--text-dim)'}">${todayFailed}</div>
      <div class="sc-lbl">failed</div>
    </div>
    <div class="stat-chip">
      <div class="sc-val">${todayTotal}</div>
      <div class="sc-lbl">total checks</div>
    </div>
    <div class="stat-chip">
      <div class="sc-val" style="color:var(--text-mid)">${todaySuites}</div>
      <div class="sc-lbl">suites</div>
    </div>
  </div>

  <div class="filter-bar">
    <span class="f-lbl">filter</span>
    <button class="fbtn fa" data-filter="all"      onclick="applyFilter('all')">all<span class="cnt">${todayTotal}</span></button>
    <button class="fbtn"    data-filter="positive" onclick="applyFilter('positive')">positive<span class="cnt">${cPos}</span></button>
    <button class="fbtn"    data-filter="negative" onclick="applyFilter('negative')">negative<span class="cnt">${cNeg}</span></button>
    <button class="fbtn"    data-filter="edge"     onclick="applyFilter('edge')">edge<span class="cnt">${cEdge}</span></button>
  </div>

  <div id="suite-list">${buildSuiteBlocks(latestRun, flakyChecks)}</div>
  ` : `<div class="empty-state">no runs today — results appear here after running the test suite</div>`}
</section>

<!-- ── WEEKLY ────────────────────────────────────────────────────────────────── -->
<section id="panel-weekly" class="panel">
  <div class="weekly-stats">
    <div class="wstat">
      <div class="wstat-lbl">runs this week</div>
      <div class="wstat-val">${stats.count}</div>
      <div class="wstat-sub">${escHtml(weekRange)}</div>
    </div>
    <div class="wstat">
      <div class="wstat-lbl">avg pass rate</div>
      <div class="wstat-val" style="color:${stats.avgRate>=90?'var(--pass)':stats.avgRate>=70?'var(--edge)':'var(--fail)'}">${stats.avgRate}%</div>
      <div class="wstat-sub">${stats.avgRate>=90?'healthy':stats.avgRate>=70?'watch closely':'needs attention'}</div>
    </div>
    <div class="wstat">
      <div class="wstat-lbl">best run</div>
      <div class="wstat-val" style="color:var(--pass)">${stats.best}%</div>
      <div class="wstat-sub">this week</div>
    </div>
    <div class="wstat">
      <div class="wstat-lbl">most failures</div>
      <div class="wstat-fail-name">${escHtml(stats.mostFailing)}</div>
      <div class="wstat-sub">${stats.mostFailing !== '—' ? `${failCount(stats.mostFailing, weeklyRuns)} run(s) with failures` : 'no failures this week'}</div>
    </div>
    <div class="wstat">
      <div class="wstat-lbl">flaky suites</div>
      <div class="wstat-val" style="color:${flakySuites.size > 0 ? 'var(--edge)' : 'var(--pass)'}">${flakySuites.size}</div>
      <div class="wstat-sub">${flakySuites.size > 0 ? 'intermittent this week' : 'all stable'}</div>
    </div>
  </div>

  ${buildFlakySection(hmRuns, flakySuites)}

  <div class="section-lbl">pass rate trend — last ${chartRuns.length} run${chartRuns.length !== 1 ? 's' : ''}</div>
  <div class="chart-wrap">
    <canvas id="trend-canvas" height="150"
      data-runs="${escHtml(chartData)}"></canvas>
  </div>

  <div class="section-lbl">suite failure history — ${escHtml(weekRange)}</div>
  <div>${buildHeatmap(hmRuns, flakySuites)}</div>
</section>

<script>
/* ── Tab switching ─────────────────────────────────────────────────────────── */
function switchTab(name, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');
  if (name === 'today')  { animateCounter(); }
  if (name === 'weekly') { setTimeout(() => { drawChart(); animateHeatmap(); }, 30); }
}

/* ── Pass rate counter ─────────────────────────────────────────────────────── */
function animateCounter() {
  const el = document.getElementById('rate-counter');
  if (!el) return;
  const target = parseInt(el.dataset.target, 10);
  if (isNaN(target)) return;
  let start = null;
  const duration = 550;
  function step(ts) {
    if (!start) start = ts;
    const p = Math.min((ts - start) / duration, 1);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(e * target);
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = target;
  }
  el.textContent = '0';
  requestAnimationFrame(step);
}

/* ── Bar chart on canvas ───────────────────────────────────────────────────── */
function drawChart() {
  const canvas = document.getElementById('trend-canvas');
  if (!canvas) return;
  let runs;
  try { runs = JSON.parse(canvas.dataset.runs); } catch { return; }
  if (!runs.length) return;

  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const mL = 40, mR = 10, mT = 10, mB = 30;
  const cW = W - mL - mR, cH = H - mT - mB;
  const n  = runs.length;
  const gap = Math.max(2, Math.floor(cW / n * 0.15));
  const bW  = Math.max(4, Math.floor((cW - gap * (n - 1)) / n));

  function paint(prog) {
    ctx.clearRect(0, 0, W, H);

    /* grid */
    [0, 25, 50, 75, 100].forEach(v => {
      const y = mT + cH - (v / 100) * cH;
      ctx.strokeStyle = 'rgba(30,37,53,1)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(mL, y); ctx.lineTo(mL + cW, y); ctx.stroke();
      ctx.fillStyle = '#48556A';
      ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(v + '%', mL - 5, y + 3.5);
    });

    const step = Math.max(1, Math.ceil(n / 9));
    runs.forEach((r, i) => {
      const x   = mL + i * (bW + gap);
      const pct = r.passRate || 0;
      const bh  = Math.max(2, (pct / 100) * cH * prog);
      const y   = mT + cH - bh;
      const clr = pct === 100 ? '#21CC88' : pct >= 80 ? '#F0A045' : '#F24E4E';

      /* faint full-height guide */
      ctx.fillStyle = clr + '0D';
      ctx.fillRect(x, mT, bW, cH);

      /* bar */
      ctx.fillStyle = clr;
      ctx.fillRect(x, y, bW, bh);

      /* x-axis label */
      if (i % step === 0 || i === n - 1) {
        const d = new Date(r.runAt);
        const lbl = (d.getMonth() + 1) + '/' + d.getDate();
        ctx.fillStyle = '#48556A';
        ctx.font = '9px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(lbl, x + bW / 2, H - mB + 13);
      }
    });
  }

  let start = null;
  const dur = 480;
  function animate(ts) {
    if (!start) start = ts;
    const p = Math.min((ts - start) / dur, 1);
    paint(1 - Math.pow(1 - p, 2));
    if (p < 1) requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}

/* ── Heatmap entrance ──────────────────────────────────────────────────────── */
function animateHeatmap() {
  document.querySelectorAll('.hm-pip').forEach((pip) => {
    const col = parseInt(pip.dataset.col || 0, 10);
    setTimeout(() => {
      pip.style.transition = 'opacity 0.18s ease';
      pip.style.opacity = '1';
    }, col * 45);
  });
}

/* ── Filter ────────────────────────────────────────────────────────────────── */
const fMap = { all: 'fa', positive: 'fp', negative: 'fn', edge: 'fe' };
function applyFilter(type) {
  document.querySelectorAll('.fbtn').forEach(b => b.classList.remove('fa','fp','fn','fe'));
  document.querySelector('[data-filter="'+type+'"]')?.classList.add(fMap[type] || 'fa');
  document.querySelectorAll('.suite-block').forEach(block => {
    const rows = block.querySelectorAll('.check-row');
    let vis = 0;
    rows.forEach(r => {
      const m = type === 'all' || r.dataset.type === type;
      r.classList.toggle('hidden-filter', !m);
      if (m) vis++;
    });
    block.classList.toggle('hidden-filter', vis === 0);
    if (type !== 'all' && vis > 0) {
      const body = block.querySelector('.s-body');
      const arrow = block.querySelector('.s-arrow');
      if (body)  body.classList.add('open');
      if (arrow) arrow.classList.add('open');
    }
  });
}

/* ── Suite toggle ──────────────────────────────────────────────────────────── */
function toggleSuite(el) {
  const block = el.closest('.suite-block');
  const body  = block.querySelector('.s-body');
  const arrow = block.querySelector('.s-arrow');
  if (body)  body.classList.toggle('open');
  if (arrow) arrow.classList.toggle('open');
}

/* ── Init ──────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  animateCounter();
  /* auto-open failing suites in today view */
  document.querySelectorAll('.suite-block[data-has-fail="true"]').forEach(block => {
    const body  = block.querySelector('.s-body');
    const arrow = block.querySelector('.s-arrow');
    if (body)  body.classList.add('open');
    if (arrow) arrow.classList.add('open');
  });
});
</script>
</body>
</html>`;
}

// ── Write output ───────────────────────────────────────────────────────────────
const html = generateDashboard(latestRun, todayRuns, weeklyRuns, runs);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html, 'utf8');
console.log(`✅ Dashboard generated → ${outputPath}`);
console.log(`   Total runs: ${runs.length}  |  Today: ${todayRuns.length}  |  This week: ${weeklyRuns.length}`);
