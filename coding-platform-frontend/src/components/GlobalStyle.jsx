export function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      :root {
        --bg: #0d0f12; --bg2: #12151a; --bg3: #181c23; --bg4: #1e2330;
        --border: #252b38; --border2: #2e3648;
        --text: #e8ecf4; --text2: #8892a4; --text3: #4a5568;
        --accent: #00e5a0; --accent2: #00b87c;
        --amber: #f59e0b; --red: #ef4444; --blue: #3b82f6; --purple: #8b5cf6;
        --easy: #00e5a0; --medium: #f59e0b; --hard: #ef4444;
        --font: 'Sora', sans-serif; --mono: 'JetBrains Mono', monospace;
        --radius: 8px; --radius2: 12px; --shadow: 0 4px 24px rgba(0,0,0,0.4);
      }

      html, body, #root { height: 100%; }
      body { background: var(--bg); color: var(--text); font-family: var(--font); font-size: 14px; line-height: 1.6; }
      a { color: inherit; text-decoration: none; }
      button { cursor: pointer; font-family: var(--font); }
      input, textarea, select { font-family: var(--font); }

      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: var(--bg2); }
      ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }

      @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes slideIn { from { transform: translateX(-8px); opacity:0; } to { transform: none; opacity:1; } }

      .fade-in { animation: fadeIn 0.3s ease forwards; }
      .page { animation: fadeIn 0.25s ease forwards; }

      .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: var(--radius); border: none; font-size: 13px; font-weight: 500; transition: all 0.15s; }
      .btn-primary { background: var(--accent); color: #000; }
      .btn-primary:hover { background: var(--accent2); transform: translateY(-1px); }
      .btn-ghost { background: transparent; color: var(--text2); border: 1px solid var(--border2); }
      .btn-ghost:hover { background: var(--bg3); color: var(--text); }
      .btn-danger { background: rgba(239,68,68,0.1); color: var(--red); border: 1px solid rgba(239,68,68,0.2); }
      .btn-danger:hover { background: rgba(239,68,68,0.2); }
      .btn-amber { background: rgba(245,158,11,0.1); color: var(--amber); border: 1px solid rgba(245,158,11,0.2); }
      .btn-amber:hover { background: rgba(245,158,11,0.2); }
      .btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none !important; }
      .btn-sm { padding: 5px 10px; font-size: 12px; }
      .btn-lg { padding: 12px 28px; font-size: 15px; }

      .card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius2); padding: 20px; }

      .input { width: 100%; background: var(--bg3); border: 1px solid var(--border2); border-radius: var(--radius); color: var(--text); padding: 10px 14px; font-size: 13px; transition: border-color 0.15s; outline: none; }
      .input:focus { border-color: var(--accent); }
      .input::placeholder { color: var(--text3); }

      .label { display: block; font-size: 12px; font-weight: 500; color: var(--text2); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }

      .badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; font-family: var(--mono); text-transform: uppercase; letter-spacing: 0.05em; }
      .badge-easy { background: rgba(0,229,160,0.1); color: var(--easy); }
      .badge-medium { background: rgba(245,158,11,0.1); color: var(--medium); }
      .badge-hard { background: rgba(239,68,68,0.1); color: var(--hard); }
      .badge-accepted { background: rgba(0,229,160,0.1); color: var(--easy); }
      .badge-wrong { background: rgba(239,68,68,0.1); color: var(--red); }
      .badge-pending { background: rgba(59,130,246,0.1); color: var(--blue); }
      .badge-tle { background: rgba(245,158,11,0.1); color: var(--amber); }
      .badge-error { background: rgba(239,68,68,0.1); color: var(--red); }

      .spinner { width: 20px; height: 20px; border: 2px solid var(--border2); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.6s linear infinite; }

      .empty-state { text-align: center; padding: 64px 24px; color: var(--text3); }
      .empty-state .icon { font-size: 48px; margin-bottom: 16px; }
      .empty-state p { font-size: 15px; color: var(--text2); margin-bottom: 8px; }

      .toast { position: fixed; bottom: 24px; right: 24px; z-index: 9999; background: var(--bg3); border: 1px solid var(--border2); border-radius: var(--radius2); padding: 12px 16px; display: flex; align-items: center; gap: 10px; animation: slideIn 0.2s ease; box-shadow: var(--shadow); font-size: 13px; max-width: 360px; }
      .toast-success { border-left: 3px solid var(--accent); }
      .toast-error { border-left: 3px solid var(--red); }

      .table { width: 100%; border-collapse: collapse; }
      .table th { text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600; color: var(--text3); text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 1px solid var(--border); }
      .table td { padding: 12px 16px; border-bottom: 1px solid var(--border); font-size: 13px; }
      .table tr:hover td { background: var(--bg3); }
      .table tr:last-child td { border-bottom: none; }

      .diff-tab { display: inline-flex; border-radius: var(--radius); overflow: hidden; border: 1px solid var(--border2); }
      .diff-tab button { padding: 6px 14px; background: transparent; border: none; color: var(--text2); font-size: 12px; font-weight: 500; transition: all 0.15s; }
      .diff-tab button.active { background: var(--bg4); color: var(--text); }
      .diff-tab button:hover:not(.active) { background: var(--bg3); }

      .verdict-banner { padding: 16px 20px; border-radius: var(--radius); margin-bottom: 16px; display: flex; align-items: center; gap: 12px; font-weight: 600; }
      .verdict-accepted { background: rgba(0,229,160,0.08); border: 1px solid rgba(0,229,160,0.2); color: var(--accent); }
      .verdict-wrong { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); color: var(--red); }
      .verdict-tle { background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.2); color: var(--amber); }
      .verdict-error { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); color: var(--red); }
      .verdict-pending { background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.2); color: var(--blue); }

      .code-block { background: var(--bg3); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; font-family: var(--mono); font-size: 12px; color: var(--text2); overflow-x: auto; white-space: pre-wrap; }

      select.input { appearance: none; }

      .sidebar-link { display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-radius: var(--radius); font-size: 13px; color: var(--text2); transition: all 0.15s; cursor: pointer; border: none; background: transparent; width: 100%; text-align: left; }
      .sidebar-link:hover { background: var(--bg3); color: var(--text); }
      .sidebar-link.active { background: rgba(0,229,160,0.08); color: var(--accent); }
      .sidebar-link .icon { width: 16px; text-align: center; }

      .stat-card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius2); padding: 20px; }
      .stat-card .stat-value { font-size: 28px; font-weight: 700; font-family: var(--mono); color: var(--text); }
      .stat-card .stat-label { font-size: 12px; color: var(--text3); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 4px; }

      .progress-bar { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
      .progress-fill { height: 100%; background: var(--accent); border-radius: 2px; transition: width 0.4s ease; }

      .tag { display: inline-block; padding: 2px 8px; background: var(--bg4); border: 1px solid var(--border2); border-radius: 4px; font-size: 11px; color: var(--text2); font-family: var(--mono); }

      .form-row { display: grid; gap: 16px; }
      .form-row-2 { grid-template-columns: 1fr 1fr; }
      .form-group { display: flex; flex-direction: column; gap: 6px; }

      .tc-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; align-items: start; padding: 12px; background: var(--bg3); border-radius: var(--radius); border: 1px solid var(--border); }

      .nav { background: var(--bg2); border-bottom: 1px solid var(--border); padding: 0 24px; height: 56px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
      .nav-brand { font-family: var(--mono); font-weight: 700; font-size: 16px; color: var(--text); display: flex; align-items: center; gap: 8px; }
      .nav-brand span { color: var(--accent); }
      .nav-links { display: flex; align-items: center; gap: 4px; }
      .nav-link { padding: 6px 12px; border-radius: var(--radius); font-size: 13px; color: var(--text2); transition: all 0.15s; cursor: pointer; }
      .nav-link:hover { color: var(--text); background: var(--bg3); }
      .nav-link.active { color: var(--accent); }

      .layout { display: flex; min-height: calc(100vh - 56px); }
      .sidebar { width: 220px; background: var(--bg2); border-right: 1px solid var(--border); padding: 16px 12px; flex-shrink: 0; }
      .main { flex: 1; overflow: auto; }
      .content { padding: 28px; max-width: 1200px; }

      .problem-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.1s; }
      .problem-row:hover { background: var(--bg3); }
      .problem-row .num { font-family: var(--mono); font-size: 12px; color: var(--text3); width: 40px; }
      .problem-row .title { flex: 1; font-size: 14px; font-weight: 500; }
      .problem-row .solved { width: 16px; height: 16px; border-radius: 50%; }
      .problem-row .solved.yes { background: var(--accent); }
      .problem-row .solved.no { background: var(--border2); }

      .editor-layout { display: grid; grid-template-columns: 1fr 1fr; height: calc(100vh - 56px); }
      .editor-panel { border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
      .editor-panel-right { display: flex; flex-direction: column; overflow: hidden; }
      .panel-header { padding: 12px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; background: var(--bg2); flex-shrink: 0; }
      .panel-title { font-size: 13px; font-weight: 600; color: var(--text2); }
      .panel-body { flex: 1; overflow-y: auto; padding: 20px; }
      .editor-area { flex: 1; background: var(--bg); font-family: var(--mono); font-size: 13px; color: var(--text); padding: 16px; border: none; outline: none; resize: none; line-height: 1.7; }

      .tab-bar { display: flex; border-bottom: 1px solid var(--border); background: var(--bg2); }
      .tab-btn { padding: 10px 16px; font-size: 12px; font-weight: 500; color: var(--text3); border: none; background: transparent; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.15s; }
      .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
      .tab-btn:hover:not(.active) { color: var(--text2); }

      .hint-box { background: var(--bg3); border: 1px solid var(--border2); border-radius: var(--radius); padding: 12px 16px; margin-bottom: 8px; font-size: 13px; color: var(--text2); }
      .hint-box .hint-label { font-size: 11px; font-weight: 600; color: var(--accent); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }

      .search-bar { display: flex; align-items: center; gap: 8px; background: var(--bg3); border: 1px solid var(--border2); border-radius: var(--radius); padding: 8px 14px; }
      .search-bar input { background: none; border: none; outline: none; color: var(--text); font-size: 13px; flex: 1; font-family: var(--font); }
      .search-bar input::placeholder { color: var(--text3); }

      @media (max-width: 768px) {
        .editor-layout { grid-template-columns: 1fr; }
        .form-row-2 { grid-template-columns: 1fr; }
        .sidebar { display: none; }
      }

      .glow { text-shadow: 0 0 20px rgba(0,229,160,0.4); }
      .divider { height: 1px; background: var(--border); margin: 20px 0; }
    `}</style>
  );
}