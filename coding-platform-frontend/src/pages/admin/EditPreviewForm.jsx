export function EditPreviewForm({ editForm, setEditForm, onSave, onCancel, saving }) {
  const f = (k) => (e) => setEditForm({ ...editForm, [k]: e.target.value });
  const tcs = editForm.test_cases || [];

  const addTC = () =>
    setEditForm({ ...editForm, test_cases: [...tcs, { input: "", expected_output: "", hidden: false }] });
  const updateTC = (i, k, v) =>
    setEditForm({ ...editForm, test_cases: tcs.map((tc, idx) => (idx === i ? { ...tc, [k]: v } : tc)) });
  const removeTC = (i) =>
    setEditForm({ ...editForm, test_cases: tcs.filter((_, idx) => idx !== i) });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>Editing Problem</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 12, height: 12 }} /> : "✓ Save to Database"}
          </button>
        </div>
      </div>

      <div className="form-row form-row-2">
        <div className="form-group">
          <label className="label">Title</label>
          <input className="input" value={editForm.title || ""} onChange={f("title")} />
        </div>
        <div className="form-group">
          <label className="label">Difficulty</label>
          <select className="input" value={editForm.difficulty || "EASY"} onChange={f("difficulty")}>
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="label">Description</label>
        <textarea className="input" rows={5} value={editForm.description || ""} onChange={f("description")} style={{ resize: "vertical" }} />
      </div>
      <div className="form-row form-row-2">
        <div className="form-group">
          <label className="label">Constraints</label>
          <input className="input" value={editForm.constraints || ""} onChange={f("constraints")} />
        </div>
        <div className="form-group">
          <label className="label">Time Complexity</label>
          <input className="input" value={editForm.time_complexity || ""} onChange={f("time_complexity")} />
        </div>
      </div>
      <div className="form-row form-row-2">
        <div className="form-group">
          <label className="label">Sample Input</label>
          <textarea className="input" rows={3} style={{ fontFamily: "var(--mono)", fontSize: 12 }} value={editForm.sample_input || ""} onChange={f("sample_input")} />
        </div>
        <div className="form-group">
          <label className="label">Sample Output</label>
          <textarea className="input" rows={3} style={{ fontFamily: "var(--mono)", fontSize: 12 }} value={editForm.sample_output || ""} onChange={f("sample_output")} />
        </div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <label className="label" style={{ marginBottom: 0 }}>Test Cases ({tcs.length})</label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addTC}>+ Add</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tcs.map((tc, i) => (
            <div key={i} className="tc-row">
              <div className="form-group">
                <label className="label" style={{ fontSize: 10 }}>Input</label>
                <textarea className="input" rows={2} style={{ fontFamily: "var(--mono)", fontSize: 12 }} value={tc.input || ""} onChange={(e) => updateTC(i, "input", e.target.value)} />
              </div>
              <div className="form-group">
                <label className="label" style={{ fontSize: 10 }}>Expected Output</label>
                <textarea className="input" rows={2} style={{ fontFamily: "var(--mono)", fontSize: 12 }} value={tc.expected_output || ""} onChange={(e) => updateTC(i, "expected_output", e.target.value)} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 22 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>
                  <input type="checkbox" checked={tc.hidden || false} onChange={(e) => updateTC(i, "hidden", e.target.checked)} />
                  Hidden
                </label>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => removeTC(i)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {(editForm.hints || []).length > 0 && (
        <div>
          <label className="label">Hints</label>
          {editForm.hints.map((h, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "var(--accent)", marginBottom: 4 }}>Hint {i + 1}</div>
              <textarea
                className="input"
                rows={2}
                style={{ resize: "vertical" }}
                value={h}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    hints: editForm.hints.map((hh, hi) => (hi === i ? e.target.value : hh)),
                  })
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}