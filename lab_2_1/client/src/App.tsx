import { FormEvent, useState } from "react";
import axios from "axios";
import { createStory, type TranslateTo } from "./api/storyClient";

const MAX_SUBJECT_LENGTH = 80;

const TRANSLATE_OPTIONS: Array<{ value: TranslateTo; label: string }> = [
  { value: "", label: "No translation" },
  { value: "spanish", label: "Spanish" },
  { value: "hebrew", label: "Hebrew" },
  
];

export default function App() {
  const [subject, setSubject] = useState("a bunny who loves carrots");
  const [generateImage, setGenerateImage] = useState(false);
  const [translateTo, setTranslateTo] = useState<TranslateTo>("");
  const [loading, setLoading] = useState(false);
  const [story, setStory] = useState("");
  const [translatedStory, setTranslatedStory] = useState<string | null>(null);
  const [resolvedTranslateTo, setResolvedTranslateTo] = useState<"spanish" | "hebrew" | null>(
    null,
  );
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [translationModel, setTranslationModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remaining = MAX_SUBJECT_LENGTH - subject.length;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = subject.trim();
    if (!trimmed) {
      setError("Please enter a story subject.");
      return;
    }
    if (trimmed.length > MAX_SUBJECT_LENGTH) {
      setError(`Subject must be ${MAX_SUBJECT_LENGTH} characters or fewer.`);
      return;
    }

    setLoading(true);
    setError(null);
    setStory("");
    setTranslatedStory(null);
    setResolvedTranslateTo(null);
    setImageUrl(null);
    setModelId(null);
    setTranslationModel(null);

    try {
      const data = await createStory({
        subject: trimmed,
        generateImage,
        translateTo: translateTo || undefined,
      });

      if (!data.success || !data.story) {
        throw new Error(data.error || "Failed to generate story");
      }

      setStory(data.story);
      setTranslatedStory(data.translatedStory ?? null);
      setResolvedTranslateTo(data.translateTo ?? null);
      setImageUrl(data.imageUrl ?? null);
      setModelId(data.modelId ?? null);
      setTranslationModel(data.translationModel ?? null);
    } catch (err) {
      const message =
        axios.isAxiosError(err) && err.response?.data?.error
          ? String(err.response.data.error)
          : err instanceof Error
            ? err.message
            : "Request failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const translationLabel =
    resolvedTranslateTo === "hebrew"
      ? "Hebrew"
      : resolvedTranslateTo === "spanish"
        ? "Spanish"
        : null;

  return (
    <div className="page">
      <header className="hero">
        <p className="brand">Kids Story Agent</p>
        <h1>Tell me a happy story</h1>
        <p className="lede">
          Pick a short subject. The agent writes a warm tale for ages 4–8.
        </p>
      </header>

      <main className="main">
        <form className="form" onSubmit={onSubmit}>
          <label htmlFor="subject">Story subject</label>
          <input
            id="subject"
            type="text"
            value={subject}
            maxLength={MAX_SUBJECT_LENGTH}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="a friendly dragon"
            disabled={loading}
            autoComplete="off"
          />
          <div className="meta-row">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={generateImage}
                onChange={(e) => setGenerateImage(e.target.checked)}
                disabled={loading}
              />
              Also generate and save an illustration
            </label>
            <span className={remaining < 10 ? "chars warn" : "chars"}>
              {remaining} left
            </span>
          </div>

          <label htmlFor="translateTo">Translate story</label>
          <select
            id="translateTo"
            value={translateTo}
            onChange={(e) => setTranslateTo(e.target.value as TranslateTo)}
            disabled={loading}
          >
            {TRANSLATE_OPTIONS.map((option) => (
              <option key={option.value || "none"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button type="submit" disabled={loading}>
            {loading ? "Writing…" : "Write story"}
          </button>
        </form>

        {error && <p className="error" role="alert">{error}</p>}

        {story && (
          <section className="result" aria-live="polite">
            <h2>Your story</h2>
            {modelId && <p className="model">Model: {modelId}</p>}
            <p className="story">{story}</p>

            {translatedStory && translationLabel && (
              <div className="translation">
                <h3>{translationLabel} translation</h3>
                {translationModel && (
                  <p className="model">Translation model: {translationModel}</p>
                )}
                <p
                  className="story"
                  dir={resolvedTranslateTo === "hebrew" ? "rtl" : "ltr"}
                  lang={resolvedTranslateTo === "hebrew" ? "he" : "es"}
                >
                  {translatedStory}
                </p>
              </div>
            )}

            {imageUrl && (
              <figure className="illustration">
                <img src={imageUrl} alt="Story illustration" />
              </figure>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
