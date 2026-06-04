import { useState, useEffect } from "react";
import { useApi } from "../../hooks/useApi";
import { useToast } from "../../hooks/useToast";

export function ProblemFormPage({ navigate, problemId }) {
  const api = useApi();
  const isEdit = !!problemId;
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const { show } = useToast();
  const [form, setForm] = useState({
    title: "",
    description: "",
    difficulty: "EASY",
    constraints: "",
    inputFormat: "",
    outputFormat: "",
    sampleInput: "",
    sampleOutput: "",
  });
  const [testCases, setTestCases] = useState([
    { input: "", expectedOutput: "", hidden: false },
  ]);

  useEffect(() => {
    if (!isEdit) return;
    api(`/api/problems/${problemId}`)
      .then((p) => {
        setForm({
          title: p.title,
          description: p.description,
          difficulty: p.difficulty,
          constraints: p.constraints || "",
          inputFormat: p.inputFormat || "",
          outputFormat: p.outputFormat || "",
          sampleInput: p.sampleInput || "",
          sampleOutput: p.sampleOutput || "",
        });
        if (p.testCases?.length) {
          setTestCases(
            p.testCases.map((tc) => ({
              input: tc.input,
              expectedOutput: tc.expectedOutput,
              hidden: tc.hidden || false,
            })),
          );
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [problemId]);

  const f = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const addTC = () =>
    setTestCases([
      ...testCases,
      { input: "", expectedOutput: "", hidden: false },
    ]);
  const removeTC = (i) => setTestCases(testCases.filter((_, idx) => idx !== i));
  const updateTC = (i, k, v) =>
    setTestCases(
      testCases.map((tc, idx) => (idx === i ? { ...tc, [k]: v } : tc)),
    );

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        ...form,
        testCases: testCases.filter((tc) => tc.input && tc.expectedOutput),
      };
      if (isEdit)
        await api(`/api/problems/${problemId}`, { method: "PUT", body });
      else await api("/api/problems", { method: "POST", body });
      show(isEdit ? "Problem updated!" : "Problem created!", "success");
      navigate("/admin/problems");
    } catch (e) {
      show(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
        <div className="spinner" />
      </div>
    );

  return (
    <div className="page">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => navigate("/admin/problems")}
        >
          ← Back
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>
          {isEdit ? "Edit Problem" : "Add Problem"}
        </h1>
      </div>
      <form onSubmit={save}>
        <div style={{ display: "grid", gap: 20 }}>
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 14 }}>
              Basic Info
            </div>
            <div className="form-row form-row-2" style={{ marginBottom: 16 }}>
              <div className="form-group">
                <label className="label">Title *</label>
                <input
                  className="input"
                  placeholder="Two Sum"
                  value={form.title}
                  onChange={f("title")}
                  required
                />
              </div>
              <div className="form-group">
                <label className="label">Difficulty *</label>
                <select
                  className="input"
                  value={form.difficulty}
                  onChange={f("difficulty")}
                >
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="label">Description *</label>
              <textarea
                className="input"
                rows={6}
                placeholder="Full problem statement..."
                value={form.description}
                onChange={f("description")}
                required
                style={{ resize: "vertical" }}
              />
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 14 }}>
              Format & Constraints
            </div>
            <div className="form-row form-row-2" style={{ marginBottom: 12 }}>
              <div className="form-group">
                <label className="label">Input Format</label>
                <textarea
                  className="input"
                  rows={3}
                  value={form.inputFormat}
                  onChange={f("inputFormat")}
                  style={{ resize: "vertical" }}
                />
              </div>
              <div className="form-group">
                <label className="label">Output Format</label>
                <textarea
                  className="input"
                  rows={3}
                  value={form.outputFormat}
                  onChange={f("outputFormat")}
                  style={{ resize: "vertical" }}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="label">Constraints</label>
              <input
                className="input"
                placeholder="1 ≤ n ≤ 10^4, -10^9 ≤ nums[i] ≤ 10^9"
                value={form.constraints}
                onChange={f("constraints")}
              />
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 14 }}>
              Sample Example
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="label">Sample Input</label>
                <textarea
                  className="input"
                  rows={4}
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 12,
                    resize: "vertical",
                  }}
                  value={form.sampleInput}
                  onChange={f("sampleInput")}
                />
              </div>
              <div className="form-group">
                <label className="label">Sample Output</label>
                <textarea
                  className="input"
                  rows={4}
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 12,
                    resize: "vertical",
                  }}
                  value={form.sampleOutput}
                  onChange={f("sampleOutput")}
                />
              </div>
            </div>
          </div>

          <div className="card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                Test Cases ({testCases.length})
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={addTC}
              >
                + Add Test Case
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {testCases.map((tc, i) => (
                <div key={i} className="tc-row">
                  <div className="form-group">
                    <label className="label" style={{ fontSize: 10 }}>
                      Input
                    </label>
                    <textarea
                      className="input"
                      rows={3}
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 12,
                        resize: "vertical",
                      }}
                      value={tc.input}
                      onChange={(e) => updateTC(i, "input", e.target.value)}
                      placeholder="Test input..."
                    />
                  </div>
                  <div className="form-group">
                    <label className="label" style={{ fontSize: 10 }}>
                      Expected Output
                    </label>
                    <textarea
                      className="input"
                      rows={3}
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 12,
                        resize: "vertical",
                      }}
                      value={tc.expectedOutput}
                      onChange={(e) =>
                        updateTC(i, "expectedOutput", e.target.value)
                      }
                      placeholder="Expected output..."
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      paddingTop: 22,
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 12,
                        color: "var(--text2)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={tc.hidden}
                        onChange={(e) =>
                          updateTC(i, "hidden", e.target.checked)
                        }
                      />
                      Hidden
                    </label>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => removeTC(i)}
                      disabled={testCases.length === 1}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => navigate("/admin/problems")}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? (
                <span className="spinner" style={{ width: 14, height: 14 }} />
              ) : isEdit ? (
                "Save Changes"
              ) : (
                "Create Problem"
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
