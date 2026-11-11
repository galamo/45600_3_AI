const MAX_BYTES = 1_048_576;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg"]);

const form = document.getElementById("upload-form");
const imageInput = document.getElementById("image-input");
const fileNameEl = document.getElementById("file-name");
const submitBtn = document.getElementById("submit-btn");
const errorAlert = document.getElementById("error-alert");
const statusEl = document.getElementById("status");
const results = document.getElementById("results");
const previewImg = document.getElementById("preview-img");
const tagList = document.getElementById("tag-list");
const explainBtn = document.getElementById("explain-btn");
const descriptionEl = document.getElementById("description");

/** @type {string | null} */
let stashedDescription = null;

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
  statusEl.hidden = !active;
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
    return "Image must be 1MB or smaller.";
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

/**
 * @param {{ imageUrl: string, tags: string[], description: string }} data
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();
  results.hidden = true;
  resetExplain();

  const file = imageInput.files?.[0];
  const validationError = validateClientFile(file);
  if (validationError) {
    showError(validationError);
    return;
  }

  const body = new FormData();
  body.append("image", file);

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
      imageUrl: data.imageUrl,
      tags: data.tags,
      description: data.description,
    });
  } catch (err) {
    showError(err?.message || String(err));
  } finally {
    setLoading(false);
  }
});
