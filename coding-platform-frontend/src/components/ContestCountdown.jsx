import { useState, useEffect } from "react";

function diff(target) {
  const secs = Math.max(0, Math.floor((new Date(target) - Date.now()) / 1000));
  return {
    h: Math.floor(secs / 3600),
    m: Math.floor((secs % 3600) / 60),
    s: secs % 60,
    done: secs === 0,
  };
}

export default function ContestCountdown({ target, label }) {
  const [time, setTime] = useState(() => diff(target));

  useEffect(() => {
    if (time.done) return;
    const id = setInterval(() => setTime(diff(target)), 1000);
    return () => clearInterval(id);
  }, [target, time.done]);

  if (time.done) return null;

  const pad = (n) => String(n).padStart(2, "0");

  return (
    <div style={{ fontSize: 13, color: "var(--text2)" }}>
      {label}{" "}
      <span style={{ fontFamily: "var(--mono)", fontWeight: 500, color: "var(--accent)" }}>
        {time.h > 0 && `${pad(time.h)}h `}{pad(time.m)}m {pad(time.s)}s
      </span>
    </div>
  );
}