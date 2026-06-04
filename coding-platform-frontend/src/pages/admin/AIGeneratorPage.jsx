import { useState, useEffect, useCallback } from "react";
import { useToast } from "../../hooks/useToast";
import { diffBadge } from "../../utils/helpers";
import { AGENT } from "../../utils/constants";
import { EditPreviewForm } from "./EditPreviewForm";

export function AIGeneratorPage() {
  const [genForm, setGenForm] = useState({
    topic: "",
    difficulty: "",
    company_style: "",
    count: 1,
  });
  const [generating, setGenerating] = useState(false);
  const [previews, setPreviews] = useState([]);
  const [loadingPreviews, setLoadingPreviews] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(null);
  const [discarding, setDiscarding] = useState(null);
  const { show } = useToast();

  const loadPreviews = useCallback(async () => {
    setLoadingPreviews(true);
    try {
      const r = await fetch(`${AGENT}/generate/preview/list`);
      const d = await r.json();
      setPreviews(d.previews || []);
    } catch {
      setPreviews([]);
    } finally {
      setLoadingPreviews(false);
    }
  }, []);

  useEffect(() => {
    loadPreviews();
  }, [loadPreviews]);

  const generate = async (e) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const body = { ...genForm, count: Number(genForm.count) };
      if (!body.topic) delete body.topic;
      if (!body.difficulty) delete body.difficulty;
      if (!body.company_style) delete body.company_style;
      const r = await fetch(`${AGENT}/generate/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Agent service error");
      const d = await r.json();
      show(
        `Generated ${d.problems_generated} problem(s)! Review below.`,
        "success",
      );
      loadPreviews();
    } catch (e) {
      show(e.message || "Could not reach agent service", "error");
    } finally {
      setGenerating(false);
    }
  };

  const startEdit = async (previewId) => {
    try {
      const r = await fetch(`${AGENT}/generate/preview/list`);
      const d = await r.json();
      const preview = (d.previews || []).find(
        (p) => p.preview_id === previewId,
      );
      setEditingId(previewId);
      setEditForm({
        ...preview,
        test_cases: preview.test_cases || [],
        hints: preview.hints || [],
      });
    } catch {
      show("Could not load problem details", "error");
    }
  };

  const saveEdited = async (previewId) => {
    setSaving(previewId);
    try {
      const saveRes = await fetch(`${AGENT}/generate/save/${previewId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!saveRes.ok) throw new Error(await saveRes.text());
      show("Problem saved to database!", "success");
      setEditingId(null);
      setEditForm(null);
      loadPreviews();
    } catch (e) {
      show(e.message, "error");
    } finally {
      setSaving(null);
    }
  };

  const discard = async (previewId) => {
    if (!confirm("Discard this problem?")) return;
    setDiscarding(previewId);
    try {
      await fetch(`${AGENT}/generate/preview/${previewId}`, {
        method: "DELETE",
      });
      show("Problem discarded", "success");
      loadPreviews();
    } catch {
      show("Failed to discard", "error");
    } finally {
      setDiscarding(null);
    }
  };

  const saveDirectly = async (previewId) => {
    setSaving(previewId);
    try {
      const r = await fetch(`${AGENT}/generate/save/${previewId}`, {
        method: "POST",
      });
      if (!r.ok) throw new Error("Failed to save");
      show("Problem saved to database!", "success");
      loadPreviews();
    } catch (e) {
      show(e.message, "error");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="page">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 4,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>AI Problem Generator</h1>
        <span
          className="badge"
          style={{ background: "rgba(34,197,94,0.1)", color: "var(--green)" }}
        >
          Groq (Llama 3.3 70B)
        </span>
      </div>
      <p style={{ color: "var(--text3)", fontSize: 13, marginBottom: 24 }}>
        Generate problems using AI, review and edit them, then save to the
        platform.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "360px 1fr",
          gap: 24,
          alignItems: "start",
        }}
      >
        {/* Generator form */}
        <div className="card" style={{ position: "sticky", top: 80 }}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>
            Generate Problems
          </div>
          <form
            onSubmit={generate}
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
          >
            <div className="form-group">
              <label className="label">Topic</label>
              <input
                className="input"
                placeholder="e.g. dynamic programming"
                value={genForm.topic}
                onChange={(e) =>
                  setGenForm({ ...genForm, topic: e.target.value })
                }
              />
            </div>
            <div className="form-group">
              <label className="label">Difficulty</label>
              <select
                className="input"
                value={genForm.difficulty}
                onChange={(e) =>
                  setGenForm({ ...genForm, difficulty: e.target.value })
                }
              >
                <option value="">Any</option>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </div>
            <div className="form-group">
              <label className="label">Company Style</label>
              <input
                className="input"
                placeholder="e.g. Google, Amazon"
                value={genForm.company_style}
                onChange={(e) =>
                  setGenForm({ ...genForm, company_style: e.target.value })
                }
              />
            </div>
            <div className="form-group">
              <label className="label">Count (1-10)</label>
              <input
                className="input"
                type="number"
                min={1}
                max={10}
                value={genForm.count}
                onChange={(e) =>
                  setGenForm({ ...genForm, count: e.target.value })
                }
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={generating}
              style={{ marginTop: 4 }}
            >
              {generating ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14 }} />{" "}
                  Generating...
                </>
              ) : (
                "✦ Generate"
              )}
            </button>
          </form>
          <div className="divider" />
          <div style={{ fontSize: 12, color: "var(--text3)", lineHeight: 1.7 }}>
            Problems are generated then queued for your review. You can edit any
            field before saving to the database.
          </div>
        </div>

        {/* Preview queue */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              Review Queue{" "}
              <span
                style={{ color: "var(--text3)", fontSize: 13, fontWeight: 400 }}
              >
                ({previews.length} waiting)
              </span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={loadPreviews}>
              ↻ Refresh
            </button>
          </div>

          {loadingPreviews ? (
            <div
              style={{ display: "flex", justifyContent: "center", padding: 40 }}
            >
              <div className="spinner" />
            </div>
          ) : previews.length === 0 ? (
            <div className="card empty-state">
              <div className="icon">✦</div>
              <p>No problems in queue</p>
              <span style={{ fontSize: 13, color: "var(--text3)" }}>
                Generate some problems to get started
              </span>
            </div>
          ) : (
            previews.map((p) => (
              <div
                key={p.preview_id}
                className="card"
                style={{ marginBottom: 16 }}
              >
                {editingId === p.preview_id && editForm ? (
                  <EditPreviewForm
                    editForm={editForm}
                    setEditForm={setEditForm}
                    onSave={() => saveEdited(p.preview_id)}
                    onCancel={() => {
                      setEditingId(null);
                      setEditForm(null);
                    }}
                    saving={saving === p.preview_id}
                  />
                ) : (
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: 12,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 15,
                            marginBottom: 4,
                          }}
                        >
                          {p.title}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {diffBadge(p.difficulty)}
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--text3)",
                              fontFamily: "var(--mono)",
                            }}
                          >
                            {p.preview_id.slice(0, 8)}...
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => startEdit(p.preview_id)}
                        >
                          ✎ Edit
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => saveDirectly(p.preview_id)}
                          disabled={saving === p.preview_id}
                        >
                          {saving === p.preview_id ? (
                            <span
                              className="spinner"
                              style={{ width: 12, height: 12 }}
                            />
                          ) : (
                            "✓ Save"
                          )}
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => discard(p.preview_id)}
                          disabled={discarding === p.preview_id}
                        >
                          {discarding === p.preview_id ? (
                            <span
                              className="spinner"
                              style={{ width: 12, height: 12 }}
                            />
                          ) : (
                            "✕"
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
