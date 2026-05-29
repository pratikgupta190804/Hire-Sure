import { useState, useEffect, useCallback, useRef } from "react";
import Editor from "@monaco-editor/react";
import { useAuth } from "../contexts/AuthContext";
import { useApi } from "../hooks/useApi";
import { diffBadge, statusBadge } from "../utils/helpers";
import { LANGUAGES, LANG_STARTERS } from "../utils/constants";

// Map Judge0 language IDs to Monaco Editor language identifiers
const LANG_ID_MAP = {
  50: "c",
  52: "cpp",
  54: "csharp",
  62: "java",
  71: "python",
  73: "javascript",
  74: "typescript",
  75: "bash",
  77: "golang",
  80: "rust",
  82: "ruby",
  85: "kotlin",
};

function SubmissionsTab({ problemId, api, navigate }) {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api(`/api/submissions/problem/${problemId}`)
      .then((d) => {
        setSubs(d.content || d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [problemId]);

  if (loading)
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
        <div className="spinner" />
      </div>
    );
  if (!subs.length)
    return (
      <div style={{ color: "var(--text3)", fontSize: 13 }}>
        No submissions yet.
      </div>
    );

  return (
    <div>
      {subs.map((s) => (
        <div
          key={s.id}
          style={{
            padding: "10px 0",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          {statusBadge(s.status)}
          <span
            style={{
              fontSize: 12,
              color: "var(--text3)",
              fontFamily: "var(--mono)",
            }}
          >
            {LANGUAGES.find((l) => l.id === s.languageId)?.name}
          </span>
          {s.runtimeMs && (
            <span style={{ fontSize: 12, color: "var(--text3)" }}>
              {s.runtimeMs}ms
            </span>
          )}
          <span
            style={{ fontSize: 11, color: "var(--text3)", marginLeft: "auto" }}
          >
            {new Date(s.submittedAt).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ProblemPage({ navigate, slug }) {
  const { user } = useAuth();
  const api = useApi();
  const [problem, setProblem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [langId, setLangId] = useState(71);
  const [submitting, setSubmitting] = useState(false);
  const [submission, setSubmission] = useState(null);
  const [polling, setPolling] = useState(false);
  const [activeTab, setActiveTab] = useState("description");
  const [hintIdx, setHintIdx] = useState(-1);

  useEffect(() => {
    api(`/api/problems/${slug}`)
      .then((p) => {
        setProblem(p);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    setCode(LANG_STARTERS[langId] || "");
  }, [slug]);

  useEffect(() => {
    setCode(LANG_STARTERS[langId] || "");
  }, [langId]);

  const pollSubmission = useCallback(
    async (id) => {
      setPolling(true);
      let pollCount = 0;
      const maxAttempts = 20;

      for (let i = 0; i < maxAttempts; i++) {
        pollCount++;
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const s = await api(`/api/submissions/${id}`);
          console.log(`Poll attempt ${pollCount}: Status = ${s.status}`, s);
          setSubmission(s);

          if (!["PENDING", "PROCESSING"].includes(s.status)) {
            setPolling(false);
            return;
          }
        } catch (err) {
          console.error(`Poll error on attempt ${pollCount}:`, err);
          break;
        }
      }

      // Timeout reached - submission still pending
      setPolling(false);
      console.warn(
        `Polling timeout: Submission ${id} still in PENDING after ${maxAttempts} attempts`,
      );
      setSubmission((prev) => ({
        ...prev,
        status: "TIMEOUT",
        stderr: `Submission judgment timed out after ${maxAttempts * 1.5}s. This usually means the backend execution service is not responding. Check if Docker is running and backend is functioning.`,
      }));
    },
    [api],
  );

  const submit = async () => {
    if (!user) {
      navigate("/login");
      return;
    }
    setSubmitting(true);
    setSubmission(null);
    setActiveTab("result");
    try {
      const s = await api("/api/submissions", {
        method: "POST",
        body: { problemId: problem.id, sourceCode: code, languageId: langId },
      });
      setSubmission(s);
      pollSubmission(s.id);
    } catch (e) {
      setSubmission({ status: "INTERNAL_ERROR", stderr: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const verdictClass = (s) =>
    ({
      ACCEPTED: "accepted",
      WRONG_ANSWER: "wrong",
      TIME_LIMIT_EXCEEDED: "tle",
      COMPILATION_ERROR: "error",
      RUNTIME_ERROR: "error",
      MEMORY_LIMIT_EXCEEDED: "tle",
      TIMEOUT: "error",
    })[s] || "pending";

  const verdictMsg = (s) =>
    ({
      ACCEPTED: "✓ Accepted",
      WRONG_ANSWER: "✗ Wrong Answer",
      TIME_LIMIT_EXCEEDED: "⏱ Time Limit Exceeded",
      COMPILATION_ERROR: "✗ Compilation Error",
      RUNTIME_ERROR: "✗ Runtime Error",
      PENDING: "⏳ Pending...",
      PROCESSING: "⚙ Processing...",
      TIMEOUT: "✗ Judgment Timeout",
    })[s] || s;

  if (loading)
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "calc(100vh - 56px)",
        }}
      >
        <div className="spinner" />
      </div>
    );
  if (!problem)
    return (
      <div className="empty-state page">
        <p>Problem not found</p>
      </div>
    );

  const hints = problem.hints || [];

  return (
    <div className="editor-layout page">
      {/* Left panel */}
      <div className="editor-panel">
        <div className="panel-header">
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>
              {problem.title}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {diffBadge(problem.difficulty)}
              {problem.topicTags?.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="tab-bar">
          {["description", "submissions", "hints"].map((t) => (
            <button
              key={t}
              className={`tab-btn ${activeTab === t ? "active" : ""}`}
              onClick={() => setActiveTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
          {submission && (
            <button
              className={`tab-btn ${activeTab === "result" ? "active" : ""}`}
              onClick={() => setActiveTab("result")}
            >
              Result
            </button>
          )}
        </div>
        <div className="panel-body">
          {activeTab === "description" && (
            <div style={{ fontSize: 14, lineHeight: 1.8 }}>
              <div
                style={{
                  marginBottom: 20,
                  color: "var(--text)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {problem.description}
              </div>
              {problem.constraints && (
                <>
                  <div
                    style={{
                      fontWeight: 600,
                      marginBottom: 8,
                      fontSize: 13,
                      color: "var(--text2)",
                    }}
                  >
                    Constraints
                  </div>
                  <pre
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 12,
                      color: "var(--text2)",
                      marginBottom: 16,
                    }}
                  >
                    {problem.constraints}
                  </pre>
                </>
              )}
              {problem.inputFormat && (
                <>
                  <div
                    style={{
                      fontWeight: 600,
                      marginBottom: 6,
                      fontSize: 13,
                      color: "var(--text2)",
                    }}
                  >
                    Input Format
                  </div>
                  <div
                    style={{
                      color: "var(--text2)",
                      fontSize: 13,
                      marginBottom: 16,
                    }}
                  >
                    {problem.inputFormat}
                  </div>
                </>
              )}
              {problem.outputFormat && (
                <>
                  <div
                    style={{
                      fontWeight: 600,
                      marginBottom: 6,
                      fontSize: 13,
                      color: "var(--text2)",
                    }}
                  >
                    Output Format
                  </div>
                  <div
                    style={{
                      color: "var(--text2)",
                      fontSize: 13,
                      marginBottom: 16,
                    }}
                  >
                    {problem.outputFormat}
                  </div>
                </>
              )}
              {problem.sampleInput && (
                <div style={{ marginTop: 16 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      marginBottom: 8,
                      fontSize: 13,
                      color: "var(--text2)",
                    }}
                  >
                    Example
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text3)",
                          marginBottom: 4,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        Input
                      </div>
                      <div className="code-block">{problem.sampleInput}</div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text3)",
                          marginBottom: 4,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        Output
                      </div>
                      <div className="code-block">{problem.sampleOutput}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "hints" && (
            <div>
              <p
                style={{
                  color: "var(--text3)",
                  fontSize: 13,
                  marginBottom: 20,
                }}
              >
                Hints are revealed one at a time. Try without them first!
              </p>
              {hints.length === 0 ? (
                <div style={{ color: "var(--text3)", fontSize: 13 }}>
                  No hints available.
                </div>
              ) : (
                hints.map((h, i) => (
                  <div key={i} style={{ marginBottom: 12 }}>
                    {i <= hintIdx ? (
                      <div className="hint-box">
                        <div className="hint-label">Hint {i + 1}</div>
                        {h}
                      </div>
                    ) : i === hintIdx + 1 ? (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setHintIdx(i)}
                      >
                        Reveal Hint {i + 1}
                      </button>
                    ) : null}
                  </div>
                ))
              )}
              {hintIdx < hints.length - 1 && hintIdx === -1 && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setHintIdx(0)}
                >
                  Show Hint 1
                </button>
              )}
            </div>
          )}

          {activeTab === "submissions" && (
            <SubmissionsTab
              problemId={problem.id}
              api={api}
              navigate={navigate}
            />
          )}

          {activeTab === "result" && submission && (
            <div>
              <div
                className={`verdict-banner verdict-${verdictClass(submission.status)}`}
              >
                <span style={{ fontSize: 18 }}>
                  {polling ? "⚙" : submission.status === "ACCEPTED" ? "✓" : "✗"}
                </span>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {polling ? "Judging..." : verdictMsg(submission.status)}
                  </div>
                  {submission.runtimeMs && (
                    <div
                      style={{ fontSize: 12, fontWeight: 400, opacity: 0.8 }}
                    >
                      Runtime: {submission.runtimeMs}ms
                    </div>
                  )}
                </div>
                {polling && (
                  <div className="spinner" style={{ marginLeft: "auto" }} />
                )}
              </div>
              {submission.compileOutput && (
                <>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text3)",
                      marginBottom: 6,
                    }}
                  >
                    Compiler Output
                  </div>
                  <div className="code-block" style={{ color: "var(--red)" }}>
                    {submission.compileOutput}
                  </div>
                </>
              )}
              {submission.stderr && (
                <>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text3)",
                      marginBottom: 6,
                      marginTop: 12,
                    }}
                  >
                    Stderr
                  </div>
                  <div className="code-block" style={{ color: "var(--red)" }}>
                    {submission.stderr}
                  </div>
                </>
              )}
              {submission.stdout && (
                <>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text3)",
                      marginBottom: 6,
                      marginTop: 12,
                    }}
                  >
                    Output
                  </div>
                  <div className="code-block">{submission.stdout}</div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right panel — code editor */}
      <div className="editor-panel-right">
        <div className="panel-header">
          <select
            className="input"
            style={{ width: 160 }}
            value={langId}
            onChange={(e) => setLangId(Number(e.target.value))}
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setCode(LANG_STARTERS[langId] || "")}
            >
              Reset
            </button>
            <button
              className="btn btn-primary"
              onClick={submit}
              disabled={submitting || polling}
            >
              {submitting ? (
                <span className="spinner" style={{ width: 14, height: 14 }} />
              ) : (
                "Submit ▶"
              )}
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <Editor
            language={LANG_ID_MAP[langId] || "python"}
            value={code}
            onChange={(value) => setCode(value || "")}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              fontFamily: "var(--mono, 'Monaco', monospace)",
              tabSize: 2,
              insertSpaces: true,
              wordWrap: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </div>
        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid var(--border)",
            fontSize: 11,
            color: "var(--text3)",
            fontFamily: "var(--mono)",
            display: "flex",
            gap: 16,
          }}
        >
          <span>{code.split("\n").length} lines</span>
          <span>{LANGUAGES.find((l) => l.id === langId)?.name}</span>
        </div>
      </div>
    </div>
  );
}
