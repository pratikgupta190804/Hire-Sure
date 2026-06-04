import { useEffect, useState } from "react";
import { useApi } from "../../hooks/useApi";
import { useToast } from "../../hooks/useToast";

export function ContestFormPage({ navigate, contestId }) {
  const api = useApi();
  const { show } = useToast();
  const isEdit = !!contestId;
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [form, setForm] = useState({
    title: "",
    startAt: "",
    endAt: "",
    description: "",
    rules: "",
    visibility: "PUBLIC",
  });
  const makeEmptyTestCase = () => ({
    input: "",
    expectedOutput: "",
    hidden: false,
  });
  const makeEmptyProblem = () => ({
    title: "",
    description: "",
    difficulty: "EASY",
    constraints: "",
    inputFormat: "",
    outputFormat: "",
    sampleInput: "",
    sampleOutput: "",
    points: 100,
    testCases: [makeEmptyTestCase()],
  });
  const [problems, setProblems] = useState([makeEmptyProblem()]);

  const f = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const addProblem = () => setProblems([...problems, makeEmptyProblem()]);
  const removeProblem = (i) =>
    setProblems(problems.filter((_, idx) => idx !== i));
  const updateProblem = (i, k, v) =>
    setProblems(problems.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)));
  const addTestCase = (problemIndex) =>
    setProblems(
      problems.map((p, idx) =>
        idx === problemIndex
          ? { ...p, testCases: [...p.testCases, makeEmptyTestCase()] }
          : p,
      ),
    );
  const removeTestCase = (problemIndex, testIndex) =>
    setProblems(
      problems.map((p, idx) =>
        idx === problemIndex
          ? {
              ...p,
              testCases: p.testCases.filter((_, tIdx) => tIdx !== testIndex),
            }
          : p,
      ),
    );
  const updateTestCase = (problemIndex, testIndex, k, v) =>
    setProblems(
      problems.map((p, idx) =>
        idx === problemIndex
          ? {
              ...p,
              testCases: p.testCases.map((tc, tIdx) =>
                tIdx === testIndex ? { ...tc, [k]: v } : tc,
              ),
            }
          : p,
      ),
    );

  useEffect(() => {
    if (!isEdit) return;
    api(`/api/contests/${contestId}`)
      .then((c) => {
        setForm({
          title: c.title || "",
          startAt: c.startAt ? c.startAt.slice(0, 16) : "",
          endAt: c.endAt ? c.endAt.slice(0, 16) : "",
          description: c.description || "",
          rules: c.rules || "",
          visibility: c.visibility || "PUBLIC",
        });
        if (c.problems?.length) {
          setProblems(
            c.problems.map((p) => ({
              title: p.title || "",
              description: p.description || "",
              difficulty: p.difficulty || "EASY",
              constraints: p.constraints || "",
              inputFormat: p.inputFormat || "",
              outputFormat: p.outputFormat || "",
              sampleInput: p.sampleInput || "",
              sampleOutput: p.sampleOutput || "",
              points: p.points ?? 0,
              testCases: p.testCases?.map((tc) => ({
                input: tc.input,
                expectedOutput: tc.expectedOutput,
                hidden: !!tc.hidden,
              })) || [{ input: "", expectedOutput: "", hidden: false }],
            })),
          );
        }
      })
      .catch((e) => show(e.message, "error"))
      .finally(() => setLoading(false));
  }, [api, contestId, isEdit, show]);

  const save = async (e) => {
    e.preventDefault();
    const selectedProblems = problems.map((p) => ({
      title: p.title?.trim(),
      description: p.description?.trim(),
      difficulty: p.difficulty,
      constraints: p.constraints?.trim(),
      inputFormat: p.inputFormat?.trim(),
      outputFormat: p.outputFormat?.trim(),
      sampleInput: p.sampleInput?.trim(),
      sampleOutput: p.sampleOutput?.trim(),
      points: Number(p.points) || 0,
      testCases: (p.testCases || []).filter(
        (tc) => tc.input && tc.expectedOutput,
      ),
    }));

    if (selectedProblems.length === 0) {
      show("Add at least one problem", "error");
      return;
    }

    const missingIndex = selectedProblems.findIndex(
      (p) => !p.title || !p.description,
    );
    if (missingIndex !== -1) {
      show(
        `Problem ${missingIndex + 1} needs a title and description`,
        "error",
      );
      return;
    }

    const missingTests = selectedProblems.findIndex(
      (p) => !p.testCases || p.testCases.length === 0,
    );
    if (missingTests !== -1) {
      show(`Problem ${missingTests + 1} needs at least one test case`, "error");
      return;
    }

    setSaving(true);
    try {
      const body = {
        ...form,
        problems: selectedProblems,
      };
      if (isEdit) {
        await api(`/api/contests/${contestId}`, { method: "PUT", body });
        show("Contest updated!", "success");
      } else {
        await api("/api/contests", { method: "POST", body });
        show("Contest created!", "success");
      }
      navigate("/admin/contests");
    } catch (e) {
      show(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

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
          onClick={() => navigate("/admin/contests")}
        >
          ← Back
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>
          {isEdit ? "Edit Contest" : "Create Contest"}
        </h1>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <div className="spinner" />
        </div>
      ) : (
        <form onSubmit={save}>
          <div style={{ display: "grid", gap: 20 }}>
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 14 }}>
                Contest Details
              </div>
              <div className="form-row form-row-2" style={{ marginBottom: 16 }}>
                <div className="form-group">
                  <label className="label">Title *</label>
                  <input
                    className="input"
                    placeholder="Weekly Contest #1"
                    value={form.title}
                    onChange={f("title")}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="label">Visibility</label>
                  <select
                    className="input"
                    value={form.visibility}
                    onChange={f("visibility")}
                  >
                    <option value="PUBLIC">Public</option>
                    <option value="PRIVATE">Private</option>
                  </select>
                </div>
              </div>
              <div className="form-row form-row-2" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label className="label">Start Time *</label>
                  <input
                    className="input"
                    type="datetime-local"
                    value={form.startAt}
                    onChange={f("startAt")}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="label">End Time *</label>
                  <input
                    className="input"
                    type="datetime-local"
                    value={form.endAt}
                    onChange={f("endAt")}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="label">Description</label>
                <textarea
                  className="input"
                  rows={4}
                  placeholder="Describe the contest format and rules"
                  value={form.description}
                  onChange={f("description")}
                  style={{ resize: "vertical" }}
                />
              </div>
              <div className="form-group">
                <label className="label">Rules</label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Scoring rules, tie-breakers, penalties"
                  value={form.rules}
                  onChange={f("rules")}
                  style={{ resize: "vertical" }}
                />
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
                  Contest Problems ({problems.length})
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={addProblem}
                >
                  + Add Problem
                </button>
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 16 }}
              >
                {problems.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius2)",
                      padding: 16,
                      background: "var(--bg3)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 12,
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>Problem {i + 1}</div>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => removeProblem(i)}
                        disabled={problems.length === 1}
                      >
                        Remove
                      </button>
                    </div>

                    <div
                      className="form-row form-row-2"
                      style={{ marginBottom: 12 }}
                    >
                      <div className="form-group">
                        <label className="label">Title *</label>
                        <input
                          className="input"
                          placeholder="Two Sum"
                          value={p.title}
                          onChange={(e) =>
                            updateProblem(i, "title", e.target.value)
                          }
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="label">Difficulty *</label>
                        <select
                          className="input"
                          value={p.difficulty}
                          onChange={(e) =>
                            updateProblem(i, "difficulty", e.target.value)
                          }
                        >
                          <option value="EASY">Easy</option>
                          <option value="MEDIUM">Medium</option>
                          <option value="HARD">Hard</option>
                        </select>
                      </div>
                    </div>

                    <div
                      className="form-row form-row-2"
                      style={{ marginBottom: 12 }}
                    >
                      <div className="form-group">
                        <label className="label">Points</label>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          value={p.points}
                          onChange={(e) =>
                            updateProblem(i, "points", Number(e.target.value))
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label className="label">Constraints</label>
                        <input
                          className="input"
                          placeholder="1 ≤ n ≤ 10^4"
                          value={p.constraints}
                          onChange={(e) =>
                            updateProblem(i, "constraints", e.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 12 }}>
                      <label className="label">Description *</label>
                      <textarea
                        className="input"
                        rows={4}
                        value={p.description}
                        onChange={(e) =>
                          updateProblem(i, "description", e.target.value)
                        }
                        required
                        style={{ resize: "vertical" }}
                      />
                    </div>

                    <div
                      className="form-row form-row-2"
                      style={{ marginBottom: 12 }}
                    >
                      <div className="form-group">
                        <label className="label">Input Format</label>
                        <textarea
                          className="input"
                          rows={3}
                          value={p.inputFormat}
                          onChange={(e) =>
                            updateProblem(i, "inputFormat", e.target.value)
                          }
                          style={{ resize: "vertical" }}
                        />
                      </div>
                      <div className="form-group">
                        <label className="label">Output Format</label>
                        <textarea
                          className="input"
                          rows={3}
                          value={p.outputFormat}
                          onChange={(e) =>
                            updateProblem(i, "outputFormat", e.target.value)
                          }
                          style={{ resize: "vertical" }}
                        />
                      </div>
                    </div>

                    <div
                      className="form-row form-row-2"
                      style={{ marginBottom: 12 }}
                    >
                      <div className="form-group">
                        <label className="label">Sample Input</label>
                        <textarea
                          className="input"
                          rows={3}
                          value={p.sampleInput}
                          onChange={(e) =>
                            updateProblem(i, "sampleInput", e.target.value)
                          }
                          style={{
                            fontFamily: "var(--mono)",
                            fontSize: 12,
                            resize: "vertical",
                          }}
                        />
                      </div>
                      <div className="form-group">
                        <label className="label">Sample Output</label>
                        <textarea
                          className="input"
                          rows={3}
                          value={p.sampleOutput}
                          onChange={(e) =>
                            updateProblem(i, "sampleOutput", e.target.value)
                          }
                          style={{
                            fontFamily: "var(--mono)",
                            fontSize: 12,
                            resize: "vertical",
                          }}
                        />
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        Test Cases ({p.testCases.length})
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => addTestCase(i)}
                      >
                        + Add Test Case
                      </button>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}
                    >
                      {p.testCases.map((tc, tIdx) => (
                        <div key={tIdx} className="tc-row">
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
                              onChange={(e) =>
                                updateTestCase(i, tIdx, "input", e.target.value)
                              }
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
                                updateTestCase(
                                  i,
                                  tIdx,
                                  "expectedOutput",
                                  e.target.value,
                                )
                              }
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
                                  updateTestCase(
                                    i,
                                    tIdx,
                                    "hidden",
                                    e.target.checked,
                                  )
                                }
                              />
                              Hidden
                            </label>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => removeTestCase(i, tIdx)}
                              disabled={p.testCases.length === 1}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => navigate("/admin/contests")}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? (
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                ) : (
                  "Save Contest"
                )}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
