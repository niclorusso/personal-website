(async function initUkraineCharts() {
  const dataPath = "posts/ukraine-four-years-data/data/phase1.json";
  const numberFmt = new Intl.NumberFormat("en-US");
  const percentFmt = new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });

  function fmtMonth(ym) {
    if (!ym || ym === "-") return "-";
    const [year, month] = ym.split("-").map(Number);
    if (!year || !month) return "-";
    const d = new Date(year, month - 1, 1);
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function buildYearMap(rows, metricKeys) {
    const out = {};
    rows.forEach((row) => {
      const month = row.month || "";
      const year = month.slice(0, 4);
      if (!/^\d{4}$/.test(year)) return;
      if (!out[year]) {
        out[year] = { months: new Set() };
        metricKeys.forEach((k) => {
          out[year][k] = 0;
        });
      }
      out[year].months.add(month);
      metricKeys.forEach((k) => {
        out[year][k] += Number(row[k]) || 0;
      });
    });
    return out;
  }

  function monthCoverageLabel(n) {
    return `${n}/12 months`;
  }

  function setupCanvas(canvas) {
    const ratio = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || canvas.width;
    const cssHeight = canvas.clientHeight || canvas.height;
    canvas.width = Math.floor(cssWidth * ratio);
    canvas.height = Math.floor(cssHeight * ratio);
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    return { ctx, width: cssWidth, height: cssHeight };
  }

  function drawAxes(ctx, width, height, maxY, ticks) {
    const m = { top: 20, right: 16, bottom: 52, left: 56 };
    const chartW = width - m.left - m.right;
    const chartH = height - m.top - m.bottom;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#d9dde5";
    ctx.lineWidth = 1;

    for (let i = 0; i <= ticks; i += 1) {
      const v = (maxY / ticks) * i;
      const y = m.top + chartH - (chartH * i) / ticks;
      ctx.beginPath();
      ctx.moveTo(m.left, y);
      ctx.lineTo(width - m.right, y);
      ctx.stroke();

      ctx.fillStyle = "#697386";
      ctx.font = "12px Inter, Arial, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(Math.round(v).toLocaleString("en-US"), m.left - 8, y);
    }

    ctx.strokeStyle = "#b5becc";
    ctx.beginPath();
    ctx.moveTo(m.left, m.top);
    ctx.lineTo(m.left, height - m.bottom);
    ctx.lineTo(width - m.right, height - m.bottom);
    ctx.stroke();

    return {
      x: m.left,
      y: m.top,
      w: chartW,
      h: chartH,
      bottom: height - m.bottom
    };
  }

  function drawLegend(ctx, width, items) {
    let x = width - 16;
    const y = 12;
    ctx.font = "12px Inter, Arial, sans-serif";
    ctx.textBaseline = "top";
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const item = items[i];
      const textW = ctx.measureText(item.label).width;
      x -= textW + 26;
      ctx.fillStyle = item.color;
      ctx.fillRect(x, y, 12, 12);
      ctx.fillStyle = "#3d4654";
      ctx.fillText(item.label, x + 16, y - 1);
      x -= 14;
    }
  }

  function drawGroupedBars(canvas, rows, groups, opts) {
    const { ctx, width, height } = setupCanvas(canvas);
    // For grouped (side-by-side) bars, axis max must use the largest single series value,
    // not the per-row sum, otherwise bars are visually understated.
    const maxY = Math.max(
      10,
      ...rows.map((r) => Math.max(...groups.map((g) => Number(r[g.key]) || 0)))
    );
    const p = drawAxes(ctx, width, height, maxY, 5);
    drawLegend(ctx, width, groups);

    const slot = p.w / rows.length;
    const barW = Math.min(24, slot / 3);
    const offset = (barW * groups.length + 6 * (groups.length - 1)) / 2;

    rows.forEach((row, i) => {
      const cx = p.x + slot * i + slot / 2;
      let x = cx - offset;

      groups.forEach((g) => {
        const v = Number(row[g.key]) || 0;
        const h = (v / maxY) * p.h;
        const y = p.bottom - h;
        ctx.fillStyle = g.color;
        ctx.fillRect(x, y, barW, h);
        x += barW + 6;
      });

      ctx.fillStyle = "#546072";
      ctx.font = "12px Inter, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(fmtMonth(row.month), cx, p.bottom + 10);
    });

    if (opts && opts.title) {
      ctx.fillStyle = "#2d3748";
      ctx.font = "13px Inter, Arial, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(opts.title, p.x, 12);
    }
  }

  function drawLineChart(canvas, rows, valueKey, color, title) {
    const { ctx, width, height } = setupCanvas(canvas);
    const maxY = Math.max(10, ...rows.map((r) => Number(r[valueKey]) || 0));
    const p = drawAxes(ctx, width, height, maxY, 5);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    rows.forEach((row, i) => {
      const x = p.x + (p.w * i) / (rows.length - 1 || 1);
      const y = p.bottom - ((Number(row[valueKey]) || 0) / maxY) * p.h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    rows.forEach((row, i) => {
      const x = p.x + (p.w * i) / (rows.length - 1 || 1);
      const y = p.bottom - ((Number(row[valueKey]) || 0) / maxY) * p.h;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#546072";
      ctx.font = "11px Inter, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(fmtMonth(row.month), x, p.bottom + 10);
    });

    ctx.fillStyle = "#2d3748";
    ctx.font = "13px Inter, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(title, p.x, 8);
  }

  try {
    const res = await fetch(dataPath);
    if (!res.ok) throw new Error("Failed to load dataset");
    const payload = await res.json();

    const ohchr = payload.ohchr_civilian_casualties || [];
    const who = payload.who_ssa_monthly || [];

    const recentWho = who.slice(-24);

    const snapshot = document.getElementById("snapshot-date");
    const ohchrCount = document.getElementById("ohchr-months");
    const whoCount = document.getElementById("who-months");
    if (snapshot) snapshot.textContent = payload.updated_on || "-";
    if (ohchrCount) ohchrCount.textContent = String(ohchr.length);
    if (whoCount) whoCount.textContent = String(who.length);

    const ohchrTotal = ohchr.reduce((acc, row) => acc + (Number(row.total) || 0), 0);
    const ohchrKilled = ohchr.reduce((acc, row) => acc + (Number(row.killed) || 0), 0);
    const ohchrPeak = ohchr.reduce(
      (best, row) => ((Number(row.total) || 0) > (Number(best.total) || 0) ? row : best),
      ohchr[0] || { month: "-", total: 0 }
    );

    const whoIncidentsTotal = who.reduce((acc, row) => acc + (Number(row.incidents) || 0), 0);
    const whoConfirmedTotal = who.reduce((acc, row) => acc + (Number(row.confirmed) || 0), 0);
    const whoConfirmedShare = whoIncidentsTotal > 0 ? whoConfirmedTotal / whoIncidentsTotal : 0;
    const latestWho = who.length ? who[who.length - 1] : { month: "-", incidents: 0 };

    const ohchrStart = ohchr.length ? ohchr[0].month : "-";
    const ohchrEnd = ohchr.length ? ohchr[ohchr.length - 1].month : "-";
    const whoStart = who.length ? who[0].month : "-";
    const whoEnd = who.length ? who[who.length - 1].month : "-";

    setText("summary-ohchr-total", numberFmt.format(ohchrTotal));
    setText("summary-ohchr-window", `${fmtMonth(ohchrStart)} - ${fmtMonth(ohchrEnd)}`);
    setText("summary-ohchr-killed", numberFmt.format(ohchrKilled));
    setText("summary-ohchr-peak", numberFmt.format(Number(ohchrPeak.total) || 0));
    setText("summary-ohchr-peak-month", fmtMonth(ohchrPeak.month || "-"));
    setText("summary-who-incidents", numberFmt.format(whoIncidentsTotal));
    setText("summary-who-window", `${fmtMonth(whoStart)} - ${fmtMonth(whoEnd)}`);
    setText("summary-who-confirmed-share", percentFmt.format(whoConfirmedShare));
    setText("summary-who-latest", numberFmt.format(Number(latestWho.incidents) || 0));
    setText("summary-who-latest-month", fmtMonth(latestWho.month || "-"));

    const coverageWarning = document.getElementById("coverage-warning");
    if (coverageWarning) {
      const ohchrMonths = ohchr.length;
      if (ohchrMonths < 12) {
        coverageWarning.textContent =
          `Coverage warning: OHCHR civilian-casualty series currently includes ${ohchrMonths} month(s) (${fmtMonth(ohchrStart)} - ${fmtMonth(ohchrEnd)}). Treat headline OHCHR cards as a narrow window, not four-year totals.`;
      } else {
        coverageWarning.textContent =
          `Coverage note: OHCHR civilian-casualty window currently spans ${ohchrMonths} month(s) (${fmtMonth(ohchrStart)} - ${fmtMonth(ohchrEnd)}).`;
      }
    }

    const ohchrYear = buildYearMap(ohchr, ["total", "killed", "injured"]);
    const whoYear = buildYearMap(who, ["incidents", "confirmed"]);
    const years = Array.from(
      new Set([...Object.keys(ohchrYear), ...Object.keys(whoYear)])
    ).sort();

    const tbody = document.getElementById("year-summary-body");
    if (tbody) {
      tbody.innerHTML = "";
      years.forEach((year) => {
        const o = ohchrYear[year];
        const w = whoYear[year];
        const tr = document.createElement("tr");
        const whoShare =
          w && w.incidents > 0 ? percentFmt.format(w.confirmed / w.incidents) : "n/a";
        tr.innerHTML = `
          <td>${year}</td>
          <td>${o ? numberFmt.format(o.total) : "n/a"}</td>
          <td>${o ? monthCoverageLabel(o.months.size) : "0/12 months"}</td>
          <td>${w ? numberFmt.format(w.incidents) : "n/a"}</td>
          <td>${w ? monthCoverageLabel(w.months.size) : "0/12 months"}</td>
          <td>${whoShare}</td>
        `;
        tbody.appendChild(tr);
      });
      if (!years.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = "<td colspan='6'>No yearly data available.</td>";
        tbody.appendChild(tr);
      }
    }

    const whoYearRows = Object.keys(whoYear)
      .sort()
      .map((year) => ({ month: `${year}-01`, incidents: whoYear[year].incidents }));
    drawGroupedBars(
      document.getElementById("chart-yearly-who-incidents"),
      whoYearRows,
      [{ key: "incidents", color: "#2b6cb0", label: "Incidents" }],
      { title: "WHO SSA incidents by year (loaded snapshot)" }
    );

    drawGroupedBars(
      document.getElementById("chart-ohchr-civilians"),
      ohchr,
      [
        { key: "killed", color: "#c0392b", label: "Killed" },
        { key: "injured", color: "#f39c12", label: "Injured" }
      ],
      { title: "OHCHR monthly civilian casualties" }
    );

    drawLineChart(
      document.getElementById("chart-who-incidents"),
      recentWho,
      "incidents",
      "#2e86de",
      "WHO SSA monthly incidents (last 24 months)"
    );

    drawGroupedBars(
      document.getElementById("chart-who-certainty"),
      recentWho,
      [
        { key: "confirmed", color: "#1f7a3f", label: "Confirmed" },
        { key: "probable", color: "#e67e22", label: "Probable" },
        { key: "possible", color: "#7f8c8d", label: "Possible" }
      ],
      { title: "WHO SSA incident certainty tiers (last 24 months)" }
    );
  } catch (err) {
    const host = document.querySelector(".ukr-data-post");
    if (host) {
      const el = document.createElement("p");
      el.textContent = "Chart data failed to load. Please verify local JSON availability.";
      el.style.color = "#b42318";
      host.prepend(el);
    }
    console.error(err);
  }
})();
