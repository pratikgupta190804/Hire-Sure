export function diffBadge(d) {
  return <span className={`badge badge-${d?.toLowerCase()}`}>{d}</span>;
}

export function statusBadge(s) {
  const map = {
    ACCEPTED: "accepted",
    WRONG_ANSWER: "wrong",
    TIME_LIMIT_EXCEEDED: "tle",
    COMPILATION_ERROR: "error",
    RUNTIME_ERROR: "error",
    PENDING: "pending",
    PROCESSING: "pending",
    MEMORY_LIMIT_EXCEEDED: "tle",
    INTERNAL_ERROR: "error",
  };
  const label = {
    ACCEPTED: "Accepted",
    WRONG_ANSWER: "Wrong Answer",
    TIME_LIMIT_EXCEEDED: "TLE",
    COMPILATION_ERROR: "CE",
    RUNTIME_ERROR: "RE",
    PENDING: "Pending",
    PROCESSING: "Processing...",
    MEMORY_LIMIT_EXCEEDED: "MLE",
    INTERNAL_ERROR: "Error",
  };
  return <span className={`badge badge-${map[s] || "pending"}`}>{label[s] || s}</span>;
}