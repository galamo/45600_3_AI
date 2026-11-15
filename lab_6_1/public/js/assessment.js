const filtersForm = document.getElementById("filters-form");
const filterUser = document.getElementById("filter-user");
const filterModel = document.getElementById("filter-model");
const filterWrong = document.getElementById("filter-wrong");
const errorEl = document.getElementById("assessment-error");
const statusEl = document.getElementById("assessment-status");
const statsStrip = document.getElementById("stats-strip");
const chartsEl = document.getElementById("charts");
const tableBlock = document.getElementById("table-block");
const casesBody = document.getElementById("cases-body");

const statTotal = document.getElementById("stat-total");
const statWrong = document.getElementById("stat-wrong");
const statAccuracy = document.getElementById("stat-accuracy");
const statInconclusive = document.getElementById("stat-inconclusive");

/** @type {Record<string, import("chart.js").Chart | null>} */
const charts = {
  perModel: null,
  agentVsUser: null,
  distribution: null,
  modelAccuracy: null,
};

const chartDefaults = {
  color: "#e8ecf1",
  borderColor: "rgba(232, 236, 241, 0.12)",
  grid: "rgba(232, 236, 241, 0.08)",
};

Chart.defaults.color = chartDefaults.color;
Chart.defaults.borderColor = chartDefaults.borderColor;
Chart.defaults.font.family = "Figtree, sans-serif";

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = "";
}

function labelOf(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    charts[key] = null;
  }
}

/**
 * @param {string[]} knownModels
 */
function syncModelFilterOptions(knownModels) {
  const current = filterModel.value;
  filterModel.innerHTML = `<option value="">All models</option>`;
  for (const model of knownModels) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    filterModel.appendChild(option);
  }
  if (knownModels.includes(current)) {
    filterModel.value = current;
  }
}

/**
 * @param {object} data
 */
function renderStats(data) {
  statTotal.textContent = String(data.total ?? 0);
  statWrong.textContent = String(data.agentVsUser?.wrongAccordingToUser ?? 0);
  statAccuracy.textContent = `${data.agentVsUser?.accuracy ?? 0}%`;
  statInconclusive.textContent = String(
    data.agentVsUser?.inconclusiveWhenUserSure ?? 0,
  );
  statsStrip.hidden = false;
}

/**
 * @param {object} data
 */
function renderCharts(data) {
  const models = Array.isArray(data.perModel) ? data.perModel : [];
  const modelLabels = models.map((m) => m.model.split("/").pop() || m.model);

  destroyChart("perModel");
  charts.perModel = new Chart(document.getElementById("chart-per-model"), {
    type: "bar",
    data: {
      labels: modelLabels,
      datasets: [
        {
          label: "Agree with user",
          data: models.map((m) => m.agree),
          backgroundColor: "rgba(46, 196, 182, 0.75)",
        },
        {
          label: "Disagree with user",
          data: models.map((m) => m.disagree),
          backgroundColor: "rgba(255, 107, 107, 0.75)",
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        x: { stacked: true, grid: { color: chartDefaults.grid } },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { precision: 0 },
          grid: { color: chartDefaults.grid },
        },
      },
      plugins: { legend: { position: "bottom" } },
    },
  });

  destroyChart("agentVsUser");
  charts.agentVsUser = new Chart(
    document.getElementById("chart-agent-vs-user"),
    {
      type: "doughnut",
      data: {
        labels: ["Agree", "Wrong vs user"],
        datasets: [
          {
            data: [
              data.agentVsUser?.agree ?? 0,
              data.agentVsUser?.wrongAccordingToUser ?? 0,
            ],
            backgroundColor: [
              "rgba(46, 196, 182, 0.85)",
              "rgba(255, 107, 107, 0.85)",
            ],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "bottom" },
          title: {
            display: true,
            text: `Accuracy ${data.agentVsUser?.accuracy ?? 0}% · ${data.total ?? 0} cases`,
          },
        },
      },
    },
  );

  destroyChart("distribution");
  charts.distribution = new Chart(
    document.getElementById("chart-distribution"),
    {
      type: "bar",
      data: {
        labels: ["Likely real", "Inconclusive", "Likely AI"],
        datasets: [
          {
            label: "User",
            data: [
              data.userCounts?.likely_real ?? 0,
              0,
              data.userCounts?.likely_ai ?? 0,
            ],
            backgroundColor: "rgba(46, 196, 182, 0.7)",
          },
          {
            label: "Agent verdict",
            data: [
              data.agentCounts?.likely_real ?? 0,
              data.agentCounts?.inconclusive ?? 0,
              data.agentCounts?.likely_ai ?? 0,
            ],
            backgroundColor: "rgba(255, 171, 64, 0.75)",
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
            grid: { color: chartDefaults.grid },
          },
          x: { grid: { color: chartDefaults.grid } },
        },
        plugins: { legend: { position: "bottom" } },
      },
    },
  );

  destroyChart("modelAccuracy");
  charts.modelAccuracy = new Chart(
    document.getElementById("chart-model-accuracy"),
    {
      type: "bar",
      data: {
        labels: modelLabels,
        datasets: [
          {
            label: "Accuracy %",
            data: models.map((m) => m.accuracy),
            backgroundColor: "rgba(46, 196, 182, 0.8)",
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        scales: {
          x: {
            min: 0,
            max: 100,
            grid: { color: chartDefaults.grid },
          },
          y: { grid: { color: chartDefaults.grid } },
        },
        plugins: { legend: { display: false } },
      },
    },
  );

  chartsEl.hidden = false;
}

/**
 * @param {object} data
 */
function renderTable(data) {
  let rows = Array.isArray(data.records) ? data.records : [];
  if (filterWrong.value === "1") {
    rows = rows.filter((r) => !r.agentCorrect);
  }

  casesBody.innerHTML = "";
  if (rows.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5">No labeled cases yet.</td>`;
    casesBody.appendChild(tr);
  } else {
    for (const row of rows) {
      const tr = document.createElement("tr");
      const modelsHtml = (row.modelRankings || [])
        .map(
          (m) =>
            `<span class="pill ${m.correct ? "pill-ok" : "pill-bad"}">${(m.model || "").split("/").pop()}: ${m.aiLikelihood}</span>`,
        )
        .join(" ");
      tr.innerHTML = `
        <td>
          <a class="case-link" href="${row.imageUrl}" target="_blank" rel="noopener">
            <img src="${row.imageUrl}" alt="" width="48" height="48" />
            <span>${row.imageId}</span>
          </a>
        </td>
        <td>${labelOf(row.userClassification)}</td>
        <td>
          ${labelOf(row.agentVerdict)}
          <span class="muted">(${row.agentOverallAiLikelihood}/100)</span>
        </td>
        <td class="${row.agentCorrect ? "ok" : "bad"}">
          ${row.agentCorrect ? "Match" : "Wrong"}
        </td>
        <td class="model-pills">${modelsHtml}</td>
      `;
      casesBody.appendChild(tr);
    }
  }
  tableBlock.hidden = false;
}

async function loadAssessment() {
  clearError();
  statusEl.hidden = false;
  statusEl.textContent = "Loading assessment data…";

  const params = new URLSearchParams();
  if (filterUser.value) params.set("userClassification", filterUser.value);
  if (filterModel.value) params.set("model", filterModel.value);

  try {
    const response = await fetch(`/api/classifications?${params.toString()}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Failed (${response.status})`);
    }

    const modelNames = (data.perModel || []).map((m) => m.model);
    syncModelFilterOptions(modelNames);
    renderStats(data);
    renderCharts(data);
    renderTable(data);

    if ((data.total ?? 0) === 0) {
      statusEl.textContent =
        "No user classifications yet. Analyze an image with AI check, then save your label.";
    } else {
      statusEl.hidden = true;
    }
  } catch (err) {
    showError(err?.message || String(err));
    statusEl.hidden = true;
  }
}

filtersForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadAssessment();
});

filterWrong.addEventListener("change", () => {
  // client-only filter — re-fetch keeps server filters, table applies wrongOnly
  loadAssessment();
});

loadAssessment();
