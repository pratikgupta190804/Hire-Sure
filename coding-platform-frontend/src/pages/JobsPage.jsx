import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useApi } from "../hooks/useApi";
import { API } from "../utils/constants";

export default function JobsPage({ navigate }) {
  const { token, user } = useAuth();
  const apiCall = useApi();

  const [loading, setLoading] = useState(false);
  const [matchingLoading, setMatchingLoading] = useState(false);
  const [resume, setResume] = useState(null);
  const [jobsData, setJobsData] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [newSkill, setNewSkill] = useState("");
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState("");

  // Filters State
  const [filterKeyword, setFilterKeyword] = useState("");
  const [filterLocation, setFilterLocation] = useState("all"); // "all", "remote", "onsite"
  const [filterMinScore, setFilterMinScore] = useState(0);     // 0, 50, 70, 80, 90
  const [filterWithSalary, setFilterWithSalary] = useState(false);
  const [targetRole, setTargetRole] = useState("");

  // Compute filtered jobs list
  const filteredJobs = jobsData.filter(job => {
    // Keyword match (case-insensitive checks on title, company, description, location)
    if (filterKeyword.trim()) {
      const query = filterKeyword.toLowerCase();
      const matchText = `${job.title} ${job.company} ${job.location} ${job.description}`.toLowerCase();
      if (!matchText.includes(query)) return false;
    }
    
    // Location filter
    if (filterLocation === "remote") {
      const isRemote = job.location.toLowerCase().includes("remote");
      if (!isRemote) return false;
    } else if (filterLocation === "onsite") {
      const isRemote = job.location.toLowerCase().includes("remote");
      if (isRemote) return false;
    }
    
    // Match score filter
    if (job.match_score < filterMinScore) return false;
    
    // Salary presence filter
    if (filterWithSalary) {
      if (!job.salary || job.salary === "Not Specified") return false;
    }
    
    return true;
  });

  // Load existing resume data on mount
  useEffect(() => {
    if (!user) return;
    loadResume();
  }, [user]);

  const loadResume = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiCall("/api/resume");
      if (data) {
        setResume(data);
        const initialRole = data.preferredRoles && data.preferredRoles.length > 0 
          ? data.preferredRoles[0] 
          : "Software Engineer";
        setTargetRole(initialRole);
        fetchMatches(initialRole);
      }
    } catch (err) {
      console.error("Failed to load resume", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMatches = async (roleQuery) => {
    setMatchingLoading(true);
    setError("");
    try {
      const url = roleQuery 
        ? `/api/jobs/matches?role=${encodeURIComponent(roleQuery)}` 
        : "/api/jobs/matches";
      const data = await apiCall(url);
      if (data && data.matches) {
        setJobsData(data.matches);
      }
    } catch (err) {
      console.error("Failed to load matches", err);
      setError("Failed to fetch matching jobs. Please verify the agent-service is running.");
    } finally {
      setMatchingLoading(false);
    }
  };

  // Drag and drop handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      uploadFile(e.target.files[0]);
    }
  };

  const uploadFile = async (file) => {
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["pdf", "docx", "txt"].includes(ext)) {
      setError("Unsupported file format. Please upload a PDF, DOCX, or TXT file.");
      return;
    }

    setLoading(true);
    setError("");
    setUploadProgress("Reading resume text and extracting skills using AI model...");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API}/api/resume/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to process resume");
      }

      const data = await res.json();
      setResume(data);
      setUploadProgress("");
      const initialRole = data.preferredRoles && data.preferredRoles.length > 0 
        ? data.preferredRoles[0] 
        : "Software Engineer";
      setTargetRole(initialRole);
      fetchMatches(initialRole);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to upload and analyze resume. Check your backend status.");
    } finally {
      setLoading(false);
      setUploadProgress("");
    }
  };

  const handleAddSkill = async (e) => {
    e.preventDefault();
    if (!newSkill.trim() || !resume) return;
    const updatedSkills = [...resume.skills, newSkill.trim()];
    
    // Optimistic UI update
    setResume({ ...resume, skills: updatedSkills });
    setNewSkill("");
    
    try {
      const data = await apiCall("/api/resume/skills", {
        method: "POST",
        body: updatedSkills,
      });
      if (data) {
        setResume(data);
        fetchMatches(targetRole);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to update skills list");
    }
  };

  const handleRemoveSkill = async (skillToRemove) => {
    if (!resume) return;
    const updatedSkills = resume.skills.filter(s => s !== skillToRemove);
    
    // Optimistic UI update
    setResume({ ...resume, skills: updatedSkills });
    
    try {
      const data = await apiCall("/api/resume/skills", {
        method: "POST",
        body: updatedSkills,
      });
      if (data) {
        setResume(data);
        fetchMatches(targetRole);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to update skills list");
    }
  };

  const handleResetResume = () => {
    setResume(null);
    setJobsData([]);
    setError("");
    setFilterKeyword("");
    setFilterLocation("all");
    setFilterMinScore(0);
    setFilterWithSalary(false);
  };

  const getMatchScoreColor = (score) => {
    if (score >= 80) return "var(--accent)";
    if (score >= 50) return "var(--amber)";
    return "var(--red)";
  };

  return (
    <div className="main page">
      <div className="content">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
              💼 AI Job Matchmaker
            </h1>
            <p style={{ color: "var(--text2)", fontSize: 13, marginTop: 4 }}>
              Upload your resume to extract skills and find the absolute best tailored jobs matching your developer profile.
            </p>
          </div>
          {resume && (
            <button className="btn btn-ghost btn-sm" onClick={handleResetResume}>
              🔄 Upload Different Resume
            </button>
          )}
        </div>

        {error && (
          <div style={{
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            color: "var(--red)",
            padding: "12px 16px",
            borderRadius: "var(--radius)",
            marginBottom: 20,
            fontSize: 13
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* LOADING SHIMMER */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, gap: 16 }}>
            <div className="spinner" style={{ width: 36, height: 36 }}></div>
            <p style={{ color: "var(--text2)", fontSize: 14, fontWeight: 500 }}>
              {uploadProgress || "Loading resume profiles..."}
            </p>
          </div>
        )}

        {/* UPLOAD SCREEN */}
        {!loading && !resume && (
          <div 
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${dragActive ? "var(--accent)" : "var(--border2)"}`,
              borderRadius: "var(--radius2)",
              background: dragActive ? "rgba(0, 229, 160, 0.02)" : "var(--bg2)",
              padding: "64px 24px",
              textAlign: "center",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              Drag and drop your resume file here
            </h3>
            <p style={{ color: "var(--text2)", fontSize: 13, marginBottom: 20 }}>
              Supports PDF, DOCX, or TXT formats (Max 5MB)
            </p>
            
            <input 
              type="file" 
              id="resume-file" 
              style={{ display: "none" }} 
              onChange={handleFileChange}
              accept=".pdf,.docx,.txt"
            />
            <label htmlFor="resume-file" className="btn btn-primary" style={{ display: "inline-flex" }}>
              Browse Files
            </label>
          </div>
        )}

        {/* DASHBOARD GRID */}
        {!loading && resume && (
          <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24, alignItems: "start" }}>
            
            {/* SIDEBAR PROFILE & SKILLS PANEL */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              
              {/* PROFILE SUMMARY CARD */}
              <div className="card">
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                  👤 Candidate Profile
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
                  <div>
                    <span style={{ color: "var(--text3)", display: "block", fontSize: 11, textTransform: "uppercase", fontWeight: 600 }}>Experience Level</span>
                    <span style={{ color: "var(--accent)", fontWeight: 600 }}>{resume.experienceLevel}</span>
                  </div>
                  <div>
                    <span style={{ color: "var(--text3)", display: "block", fontSize: 11, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Target Job Role</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input 
                        type="text" 
                        className="input" 
                        value={targetRole}
                        onChange={(e) => setTargetRole(e.target.value)}
                        placeholder="e.g. Frontend Developer"
                        style={{ padding: "6px 10px", fontSize: 12 }}
                      />
                      <button 
                        className="btn btn-primary btn-sm" 
                        onClick={() => fetchMatches(targetRole)}
                        disabled={matchingLoading}
                      >
                        Search
                      </button>
                    </div>
                  </div>
                  {resume.preferredRoles && resume.preferredRoles.length > 0 && (
                    <div>
                      <span style={{ color: "var(--text3)", display: "block", fontSize: 11, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Suggested Roles</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {resume.preferredRoles.map((role, idx) => (
                          <span 
                            key={idx} 
                            onClick={() => {
                              setTargetRole(role);
                              fetchMatches(role);
                            }}
                            style={{ 
                              cursor: "pointer", 
                              fontSize: 10.5,
                              background: targetRole === role ? "rgba(0, 229, 160, 0.15)" : "var(--bg3)",
                              border: `1px solid ${targetRole === role ? "var(--accent)" : "var(--border2)"}`,
                              color: targetRole === role ? "var(--accent)" : "var(--text2)",
                              padding: "2px 6px",
                              borderRadius: 4,
                              transition: "all 0.15s"
                            }}
                            title="Click to search this role"
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {resume.summary && (
                    <div>
                      <span style={{ color: "var(--text3)", display: "block", fontSize: 11, textTransform: "uppercase", fontWeight: 600 }}>Summary</span>
                      <p style={{ color: "var(--text2)", lineHeight: 1.5, marginTop: 4 }}>{resume.summary}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* INTERACTIVE SKILLS EDITOR CARD */}
              <div className="card">
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                  🛠️ Skills Extracted
                </h3>
                <p style={{ color: "var(--text2)", fontSize: 12, marginBottom: 12 }}>
                  Edit or append skills to dynamically refine your matches:
                </p>
                
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                  {resume.skills.map((skill, index) => (
                    <span 
                      key={index} 
                      className="tag animate-fade-in"
                      style={{ 
                        display: "inline-flex", 
                        alignItems: "center", 
                        gap: 6, 
                        background: "var(--bg3)", 
                        border: "1px solid var(--border2)",
                        color: "var(--text2)",
                        padding: "3px 8px"
                      }}
                    >
                      {skill}
                      <span 
                        onClick={() => handleRemoveSkill(skill)}
                        style={{ cursor: "pointer", color: "var(--red)", fontWeight: "bold", fontSize: 10 }}
                      >
                        ×
                      </span>
                    </span>
                  ))}
                  {resume.skills.length === 0 && (
                    <span style={{ color: "var(--text3)", fontSize: 12, fontStyle: "italic" }}>No skills listed yet.</span>
                  )}
                </div>

                <form onSubmit={handleAddSkill} style={{ display: "flex", gap: 6 }}>
                  <input 
                    type="text" 
                    className="input" 
                    placeholder="Add skill (e.g. Docker)" 
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value)}
                    style={{ padding: "6px 10px", fontSize: 12 }}
                  />
                  <button type="submit" className="btn btn-primary btn-sm">
                    Add
                  </button>
                </form>
              </div>

            </div>

            {/* MAIN JOBS PANEL */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h2 style={{ fontSize: 16, fontWeight: 600 }}>
                  ✨ Best Matched Jobs ({filteredJobs.length}{filteredJobs.length !== jobsData.length ? ` of ${jobsData.length}` : ""})
                </h2>
                {matchingLoading && <div className="spinner" style={{ width: 16, height: 16 }}></div>}
              </div>

              {/* FILTERS PANEL */}
              {!matchingLoading && jobsData.length > 0 && (
                <div className="card" style={{ padding: "14px 18px", marginBottom: 20, background: "var(--bg3)", borderColor: "var(--border2)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr auto", gap: 12, alignItems: "center" }}>
                    {/* Keyword Search */}
                    <div>
                      <input 
                        type="text" 
                        className="input" 
                        placeholder="🔍 Filter by title, company, or keyword..." 
                        value={filterKeyword}
                        onChange={(e) => setFilterKeyword(e.target.value)}
                        style={{ padding: "8px 12px", fontSize: 12.5 }}
                      />
                    </div>
                    
                    {/* Location Select */}
                    <div>
                      <select 
                        className="input"
                        value={filterLocation}
                        onChange={(e) => setFilterLocation(e.target.value)}
                        style={{ padding: "8px 12px", fontSize: 12.5, background: "var(--bg4)" }}
                      >
                        <option value="all">📍 All Locations</option>
                        <option value="remote">💻 Remote Only</option>
                        <option value="onsite">🏢 Hybrid / Onsite</option>
                      </select>
                    </div>
                    
                    {/* Match Score Select */}
                    <div>
                      <select 
                        className="input"
                        value={filterMinScore}
                        onChange={(e) => setFilterMinScore(Number(e.target.value))}
                        style={{ padding: "8px 12px", fontSize: 12.5, background: "var(--bg4)" }}
                      >
                        <option value="0">⚡ Any Match Score</option>
                        <option value="50">⚡ 50%+ Match</option>
                        <option value="70">⚡ 70%+ Match</option>
                        <option value="80">⚡ 80%+ Match</option>
                        <option value="90">⚡ 90%+ Match</option>
                      </select>
                    </div>
                    
                    {/* Salary Toggle */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 4 }}>
                      <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: "var(--text2)", userSelect: "none" }}>
                        <input 
                          type="checkbox" 
                          checked={filterWithSalary}
                          onChange={(e) => setFilterWithSalary(e.target.checked)}
                          style={{ accentColor: "var(--accent)", width: 15, height: 15 }}
                        />
                        Paid Only 💰
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {matchingLoading && jobsData.length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 200, gap: 12 }}>
                  <div className="spinner"></div>
                  <p style={{ color: "var(--text2)", fontSize: 13 }}>Analyzing jobs & ranking matches...</p>
                </div>
              )}

              {!matchingLoading && jobsData.length === 0 && (
                <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--text3)" }}>
                  <span style={{ fontSize: 36, display: "block", marginBottom: 12 }}>🔍</span>
                  <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>No Jobs Found</h4>
                  <p style={{ fontSize: 12 }}>Try adjusting your skills tags in the sidebar to widen search terms.</p>
                </div>
              )}

              {!matchingLoading && jobsData.length > 0 && filteredJobs.length === 0 && (
                <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--text3)" }}>
                  <span style={{ fontSize: 36, display: "block", marginBottom: 12 }}>🔍</span>
                  <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>No Filter Matches</h4>
                  <p style={{ fontSize: 12, marginBottom: 16 }}>Try resetting or broadening your filters.</p>
                  <button 
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setFilterKeyword("");
                      setFilterLocation("all");
                      setFilterMinScore(0);
                      setFilterWithSalary(false);
                    }}
                    style={{ margin: "0 auto" }}
                  >
                    Reset Filters
                  </button>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {filteredJobs.map((job, index) => (
                  <div 
                    key={index} 
                    className="card fade-in"
                    style={{ 
                      display: "flex", 
                      flexDirection: "column", 
                      gap: 14, 
                      transition: "transform 0.15s, border-color 0.15s",
                      borderColor: "var(--border)"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--border2)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border)";
                      e.currentTarget.style.transform = "none";
                    }}
                  >
                    
                    {/* JOB TITLE & RATING HEADER */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 16 }}>
                      <div>
                        <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
                          {job.title}
                        </h3>
                        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 4, fontSize: 12, color: "var(--text2)" }}>
                          <span style={{ fontWeight: 500, color: "var(--accent)" }}>🏢 {job.company}</span>
                          <span>📍 {job.location}</span>
                          {job.salary && job.salary !== "Not Specified" && (
                            <span style={{ color: "var(--amber)" }}>💰 {job.salary}</span>
                          )}
                        </div>
                      </div>
                      
                      {/* SCORE GAUGE */}
                      <div style={{ 
                        display: "flex", 
                        flexDirection: "column", 
                        alignItems: "center", 
                        justifyContent: "center",
                        background: "var(--bg3)",
                        border: `1px solid ${getMatchScoreColor(job.match_score)}`,
                        borderRadius: "var(--radius)",
                        padding: "6px 12px",
                        textAlign: "center",
                        minWidth: 70
                      }}>
                        <span style={{ 
                          fontSize: 14, 
                          fontWeight: 700, 
                          fontFamily: "var(--mono)",
                          color: getMatchScoreColor(job.match_score) 
                        }}>
                          {job.match_score}%
                        </span>
                        <span style={{ fontSize: 9, color: "var(--text3)", fontWeight: 600, textTransform: "uppercase" }}>Match</span>
                      </div>
                    </div>

                    {/* AI MATCH EXPLANATION */}
                    {job.match_reason && (
                      <div style={{ 
                        background: "rgba(0, 229, 160, 0.02)", 
                        borderLeft: "2px solid var(--accent)", 
                        padding: "10px 14px", 
                        borderRadius: "0 var(--radius) var(--radius) 0",
                        fontSize: 12.5,
                        color: "var(--text2)",
                        lineHeight: 1.5
                      }}>
                        <strong>AI Match Summary:</strong> {job.match_reason}
                      </div>
                    )}

                    {/* SKILLS GAP COMPARISON */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      
                      {/* MATCHING SKILLS */}
                      {job.matching_skills && job.matching_skills.length > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600, width: 85, textTransform: "uppercase" }}>Matching Skills</span>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {job.matching_skills.map((s, idx) => (
                              <span 
                                key={idx} 
                                style={{ 
                                  fontSize: 10.5, 
                                  background: "rgba(0, 229, 160, 0.08)", 
                                  color: "var(--accent)", 
                                  border: "1px solid rgba(0, 229, 160, 0.15)",
                                  padding: "1px 6px",
                                  borderRadius: 4,
                                  fontWeight: 500
                                }}
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* MISSING SKILLS */}
                      {job.missing_skills && job.missing_skills.length > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600, width: 85, textTransform: "uppercase" }}>Missing Skills</span>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {job.missing_skills.map((s, idx) => (
                              <span 
                                key={idx} 
                                style={{ 
                                  fontSize: 10.5, 
                                  background: "rgba(239, 68, 68, 0.08)", 
                                  color: "var(--red)", 
                                  border: "1px solid rgba(239, 68, 68, 0.15)",
                                  padding: "1px 6px",
                                  borderRadius: 4,
                                  fontWeight: 500
                                }}
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* JOB SNIPPET & ACTION BAR */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 4 }}>
                      <p style={{ color: "var(--text3)", fontSize: 11 }}>
                        Source: Web Aggregator
                      </p>
                      <a 
                        href={job.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="btn btn-primary btn-sm"
                        style={{ textDecoration: "none" }}
                      >
                        Apply on Job Site ↗
                      </a>
                    </div>

                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
