const MAX_BYTES = 5_242_880;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg"]);

const form = document.getElementById("upload-form");
const imageInput = document.getElementById("image-input");
const aiAuthenticityInput = document.getElementById("ai-authenticity");
const fileNameEl = document.getElementById("file-name");
const submitBtn = document.getElementById("submit-btn");
const errorAlert = document.getElementById("error-alert");
const statusEl = document.getElementById("status");
const results = document.getElementById("results");
const previewImg = document.getElementById("preview-img");
const tagList = document.getElementById("tag-list");
const explainBtn = document.getElementById("explain-btn");
const descriptionEl = document.getElementById("description");
const authBlock = document.getElementById("auth-block");
const authVerdict = document.getElementById("auth-verdict");
const authScore = document.getElementById("auth-score");
const authSummary = document.getElementById("auth-summary");
const authAssessments = document.getElementById("auth-assessments");
const userClassifyForm = document.getElementById("user-classify-form");
const userClassificationSelect = document.getElementById("user-classification");
const classifyBtn = document.getElementById("classify-btn");
const classifyStatus = document.getElementById("classify-status");

/** @type {string | null} */
let stashedDescription = null;

/** @type {{ imageId: string, imageUrl: string, aiAuthenticity: object } | null} */
let pendingClassification = null;

function showError(message) {
  errorAlert.textContent = message;
  errorAlert.hidden = false;
}

function clearError() {
  errorAlert.hidden = true;
  errorAlert.textContent = "";
}

function setLoading(active) {
  submitBtn.disabled = active;
  imageInput.disabled = active;
  aiAuthenticityInput.disabled = active;
  statusEl.hidden = !active;
  statusEl.textContent = aiAuthenticityInput.checked
    ? "Analyzing image and AI authenticity…"
    : "Analyzing image…";
}

/**
 * @param {File | undefined} file
 * @returns {string | null} error message
 */
function validateClientFile(file) {
  if (!file) return "Please choose a PNG or JPEG image.";
  if (!ALLOWED_TYPES.has(file.type)) {
    return "Only PNG and JPEG images are allowed.";
  }
  if (file.size > MAX_BYTES) {
    return "Image must be 5MB or smaller.";
  }
  return null;
}

function resetExplain() {
  stashedDescription = null;
  descriptionEl.hidden = true;
  descriptionEl.textContent = "";
  explainBtn.setAttribute("aria-expanded", "false");
  explainBtn.textContent = "Explain";
}

function resetUserClassify() {
  pendingClassification = null;
  userClassifyForm.hidden = true;
  userClassificationSelect.value = "";
  classifyBtn.disabled = false;
  classifyStatus.hidden = true;
  classifyStatus.textContent = "";
  classifyStatus.classList.remove("is-success", "is-error");
}

function hideAuthBlock() {
  authBlock.hidden = true;
  authVerdict.textContent = "";
  authScore.textContent = "";
  authSummary.textContent = "";
  authAssessments.innerHTML = "";
  resetUserClassify();
}

/**
 * @param {object | undefined} auth
 * @param {{ imageId: string, imageUrl: string }} meta
 */
function renderAuthBlock(auth, meta) {
  if (!auth || typeof auth !== "object") {
    hideAuthBlock();
    return;
  }

  const verdictLabel = String(auth.verdict || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  authVerdict.textContent = `Verdict: ${verdictLabel}`;
  authVerdict.dataset.verdict = auth.verdict || "";
  authScore.textContent = `Overall AI likelihood: ${auth.overallAiLikelihood}/100`;
  authSummary.textContent = auth.summary || "";

  authAssessments.innerHTML = "";
  const assessments = Array.isArray(auth.assessments) ? auth.assessments : [];
  for (const item of assessments) {
    const li = document.createElement("li");
    const signals = Array.isArray(item.signals)
      ? item.signals.join(", ")
      : "";
    li.innerHTML = `
      <strong>${item.model || "model"}</strong>
      <span>${item.aiLikelihood}/100 · confidence ${item.confidence}</span>
      ${signals ? `<span class="auth-signals">${signals}</span>` : ""}
      ${item.reason ? `<span class="auth-reason">${item.reason}</span>` : ""}
    `;
    authAssessments.appendChild(li);
  }

  pendingClassification = {
    imageId: meta.imageId,
    imageUrl: meta.imageUrl,
    aiAuthenticity: auth,
  };
  userClassifyForm.hidden = false;
  userClassificationSelect.value = "";
  classifyBtn.disabled = false;
  classifyStatus.hidden = true;
  classifyStatus.textContent = "";
  classifyStatus.classList.remove("is-success", "is-error");

  authBlock.hidden = false;
}

/**
 * @param {{ imageId: string, imageUrl: string, tags: string[], description: string, aiAuthenticity?: object }} data
 */
function renderResults(data) {
  previewImg.src = data.imageUrl;
  tagList.innerHTML = "";
  for (const tag of data.tags) {
    const li = document.createElement("li");
    li.textContent = tag;
    tagList.appendChild(li);
  }
  stashedDescription = data.description;
  descriptionEl.hidden = true;
  descriptionEl.textContent = data.description;
  explainBtn.setAttribute("aria-expanded", "false");
  explainBtn.textContent = "Explain";
  renderAuthBlock(data.aiAuthenticity, {
    imageId: data.imageId,
    imageUrl: data.imageUrl,
  });
  results.hidden = false;
}

imageInput.addEventListener("change", () => {
  clearError();
  const file = imageInput.files?.[0];
  if (!file) {
    fileNameEl.hidden = true;
    fileNameEl.textContent = "";
    return;
  }
  fileNameEl.hidden = false;
  fileNameEl.textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
  const err = validateClientFile(file);
  if (err) showError(err);
});

explainBtn.addEventListener("click", () => {
  if (!stashedDescription) return;
  const open = descriptionEl.hidden;
  descriptionEl.hidden = !open;
  explainBtn.setAttribute("aria-expanded", String(open));
  explainBtn.textContent = open ? "Hide explanation" : "Explain";
});

userClassifyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!pendingClassification) return;

  const userClassification = userClassificationSelect.value;
  if (
    userClassification !== "likely_real" &&
    userClassification !== "likely_ai"
  ) {
    classifyStatus.hidden = false;
    classifyStatus.classList.remove("is-success");
    classifyStatus.classList.add("is-error");
    classifyStatus.textContent = "Choose Likely real or Likely AI.";
    return;
  }

  classifyBtn.disabled = true;
  classifyStatus.hidden = false;
  classifyStatus.classList.remove("is-success", "is-error");
  classifyStatus.textContent = "Saving…";

  try {
    const response = await fetch("/api/classifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageId: pendingClassification.imageId,
        imageUrl: pendingClassification.imageUrl,
        userClassification,
        aiAuthenticity: pendingClassification.aiAuthenticity,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Save failed (${response.status})`);
    }
    classifyStatus.classList.add("is-success");
    classifyStatus.textContent =
      "Saved. View comparisons on Agent assessment.";
  } catch (err) {
    classifyBtn.disabled = false;
    classifyStatus.classList.add("is-error");
    classifyStatus.textContent = err?.message || String(err);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();
  results.hidden = true;
  resetExplain();
  hideAuthBlock();

  const file = imageInput.files?.[0];
  const validationError = validateClientFile(file);
  if (validationError) {
    showError(validationError);
    return;
  }

  const body = new FormData();
  body.append("image", file);
  body.append(
    "isAiAuthenticity",
    aiAuthenticityInput.checked ? "true" : "false",
  );

  setLoading(true);
  try {
    const response = await fetch("/upload-image", {
      method: "POST",
      body,
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const details = Array.isArray(data.details)
        ? data.details.map((d) => d.message).filter(Boolean).join("; ")
        : "";
      throw new Error(
        [data.error || `Upload failed (${response.status})`, details]
          .filter(Boolean)
          .join(" — "),
      );
    }

    renderResults({
      imageId: data.imageId,
      imageUrl: data.imageUrl,
      tags: data.tags,
      description: data.description,
      aiAuthenticity: data.aiAuthenticity,
    });
  } catch (err) {
    showError(err?.message || String(err));
  } finally {
    setLoading(false);
  }
});
