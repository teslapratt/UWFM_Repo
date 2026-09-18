import React, { useState, useEffect, useCallback } from "react";
import T38Packaging from "./PackagingTool";

// ─── UWFM Etrain Project Tracker ────────────────────────────────────────────
// Drawing-sheet aesthetic: white ground, black hairlines, square corners.
// One accent: HV orange, used only for actions and the active state.

const ACCENT = "#4b2e83"; // UW purple
const STORE_KEY = "uwfm-etrain-tracker-v1";

const TASK_STATUSES = ["Not Started", "In Progress", "Blocked", "Complete"];
const VAL_STATUSES = ["Open", "In Test", "Passed", "Failed"];
const DELIV_STATUSES = ["Open", "Draft", "Submitted", "Accepted"];
const CATEGORIES = ["Design", "Calcs", "CAD", "Testing", "Manufacturing", "Integration", "Review", "Purchasing"];

const uid = () => Math.random().toString(36).slice(2, 9);
const genCode = () =>
  Array.from({ length: 6 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");

const emptyProject = (name, member) => ({
  id: uid(),
  name,
  member,
  code: genCode(),
  createdAt: new Date().toISOString(),
  tasks: [],
  deliverables: [],
  validations: [],
  info: { description: "", mdsUrl: "", debriefUrl: "", links: [] },
});

const statusColor = (s) => {
  if (["Complete", "Passed", "Received", "Accepted"].includes(s)) return "#0a7a2f";
  if (["Blocked", "Failed"].includes(s)) return "#c11414";
  if (["In Progress", "In Test", "Ordered", "Approved", "Submitted", "Draft"].includes(s)) return ACCENT;
  return "#666";
};

const fmtDate = (d) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${m}/${day}`;
};

const isOverdue = (due, status) =>
  due && !["Complete", "Passed", "Received", "Accepted"].includes(status) && new Date(due + "T23:59") < new Date();

// ─── Storage layer ──────────────────────────────────────────────────────────

async function loadStore() {
  try {
    const r = await window.storage.get(STORE_KEY, true);
    return r ? JSON.parse(r.value) : { adminPin: null, projects: [] };
  } catch {
    return { adminPin: null, projects: [] };
  }
}

async function saveStore(data) {
  try {
    await window.storage.set(STORE_KEY, JSON.stringify(data), true);
    return true;
  } catch {
    return false;
  }
}

// ─── Shared UI primitives ───────────────────────────────────────────────────

const S = {
  input: {
    border: "1px solid #000",
    borderRadius: 0,
    padding: "5px 8px",
    fontSize: 13,
    fontFamily: "inherit",
    background: "#fff",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  btn: {
    border: "1px solid #000",
    borderRadius: 0,
    background: "#fff",
    padding: "5px 14px",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  btnPrimary: {
    border: `1px solid ${ACCENT}`,
    borderRadius: 0,
    background: ACCENT,
    color: "#fff",
    padding: "5px 14px",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  th: {
    textAlign: "left",
    fontWeight: 600,
    fontSize: 12,
    padding: "6px 8px",
    borderBottom: "1px solid #000",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "5px 8px",
    borderBottom: "1px solid #ddd",
    fontSize: 13,
    verticalAlign: "top",
  },
  mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontVariantNumeric: "tabular-nums" },
};

function StatusChip({ value, options, onChange }) {
  return (
    <button
      onClick={() => {
        const i = options.indexOf(value);
        onChange(options[(i + 1) % options.length]);
      }}
      title="Click to cycle status"
      style={{
        border: `1px solid ${statusColor(value)}`,
        color: statusColor(value),
        background: "#fff",
        borderRadius: 0,
        fontSize: 11,
        padding: "2px 8px",
        cursor: "pointer",
        fontFamily: "inherit",
        whiteSpace: "nowrap",
      }}
    >
      {value}
    </button>
  );
}

function DelBtn({ onClick }) {
  return (
    <button
      onClick={onClick}
      title="Delete row"
      style={{ border: "none", background: "none", cursor: "pointer", color: "#999", fontSize: 13, padding: "0 4px" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "#c11414")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "#999")}
    >
      ✕
    </button>
  );
}

const LEAD_NAME = "Tesla Pratt";

function LeadDot({ kind }) {
  return (
    <span
      title={`${LEAD_NAME} added ${kind}`}
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: ACCENT,
        marginRight: 6,
        verticalAlign: "middle",
        cursor: "help",
        flexShrink: 0,
      }}
    />
  );
}

// ─── Row tables per section ─────────────────────────────────────────────────

function TaskTable({ rows, onUpdate, isAdmin }) {
  const [draft, setDraft] = useState({ name: "", start: "", due: "", category: "Design" });
  const add = () => {
    if (!draft.name.trim()) return;
    onUpdate([...rows, { id: uid(), ...draft, status: "Not Started", addedByLead: !!isAdmin }]);
    setDraft({ name: "", start: "", due: "", category: draft.category });
  };
  const set = (id, patch) => onUpdate(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const sorted = [...rows].sort((a, b) => (a.due || "9999") < (b.due || "9999") ? -1 : 1);
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={S.th}>Task</th>
          <th style={S.th}>Category</th>
          <th style={{ ...S.th, width: 70 }}>Start</th>
          <th style={{ ...S.th, width: 70 }}>Due</th>
          <th style={{ ...S.th, width: 110 }}>Status</th>
          <th style={{ ...S.th, width: 30 }}></th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.id} style={isOverdue(r.due, r.status) ? { background: "#fdeeee" } : undefined}>
            <td style={S.td}>{r.addedByLead && <LeadDot kind="item" />}{r.name}</td>
            <td style={S.td}>{r.category}</td>
            <td style={{ ...S.td, ...S.mono }}>{fmtDate(r.start)}</td>
            <td style={{ ...S.td, ...S.mono, color: isOverdue(r.due, r.status) ? "#c11414" : undefined }}>
              {fmtDate(r.due)}
            </td>
            <td style={S.td}>
              <StatusChip value={r.status} options={TASK_STATUSES} onChange={(v) => set(r.id, { status: v })} />
            </td>
            <td style={S.td}>
              <DelBtn onClick={() => onUpdate(rows.filter((x) => x.id !== r.id))} />
            </td>
          </tr>
        ))}
        <tr>
          <td style={S.td}>
            <input
              style={S.input}
              placeholder="New task"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
          </td>
          <td style={S.td}>
            <select style={S.input} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </td>
          <td style={S.td}>
            <input type="date" style={{ ...S.input, ...S.mono, fontSize: 12 }} value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
          </td>
          <td style={S.td}>
            <input type="date" style={{ ...S.input, ...S.mono, fontSize: 12 }} value={draft.due} onChange={(e) => setDraft({ ...draft, due: e.target.value })} />
          </td>
          <td style={S.td} colSpan={2}>
            <button style={S.btnPrimary} onClick={add}>Add</button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

const RULESETS = ["Michigan (FSAE)", "Germany (FSG)", "Both"];
const CRITICALITY_LEVELS = ["Relevant", "Iffy", "Critical"];
const criticalityColor = (c) => (c === "Critical" ? "#c11414" : c === "Iffy" ? "#c17d0a" : "#1a6dd1");

function CriticalityDot({ value, onChange }) {
  const v = value || "Relevant";
  return (
    <button
      onClick={() => {
        const i = CRITICALITY_LEVELS.indexOf(v);
        onChange(CRITICALITY_LEVELS[(i + 1) % CRITICALITY_LEVELS.length]);
      }}
      title={`${v} — click to cycle`}
      style={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: criticalityColor(v),
        border: "none",
        cursor: "pointer",
        padding: 0,
        marginTop: 4,
        flexShrink: 0,
      }}
    />
  );
}

// One ruleset's citation + full-rule paste box within the expanded "Full rule" row.
function RulesetRuleBlock({ label, citation, fullRule, editing, draftText, onCitationChange, onDraftChange, onStartEdit, onSave }) {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{label}</div>
      <input
        style={{ ...S.input, ...S.mono, fontSize: 12, marginBottom: 6 }}
        placeholder="Rule citation (e.g. EV.6.6.2)"
        defaultValue={citation || ""}
        onBlur={(e) => onCitationChange(e.target.value.trim())}
      />
      {editing ? (
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
          <textarea
            style={{ ...S.input, minHeight: 70, lineHeight: 1.5, flex: 1 }}
            placeholder="Paste the full rule text here so you don't have to look it up every time…"
            value={draftText ?? ""}
            onChange={(e) => onDraftChange(e.target.value)}
          />
          <button style={{ ...S.btnPrimary, padding: "4px 10px" }} onClick={onSave} title="Save">
            ✓
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <div style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", flex: 1 }}>{fullRule || "—"}</div>
          <button style={{ ...S.btn, fontSize: 11, padding: "2px 8px" }} onClick={onStartEdit}>
            Edit
          </button>
        </div>
      )}
    </div>
  );
}

function ValidationTable({ rows, onUpdate }) {
  const [draft, setDraft] = useState({ item: "", ruleset: "Both", method: "" });
  const [expanded, setExpanded] = useState(() => new Set());
  const [ruleEditing, setRuleEditing] = useState(() => new Set()); // keys: `${id}:de` / `${id}:mi`
  const [ruleDraft, setRuleDraft] = useState({});
  const add = () => {
    if (!draft.item.trim()) return;
    onUpdate([...rows, { id: uid(), ...draft, criticality: "Relevant", status: "Open" }]);
    setDraft({ item: "", ruleset: draft.ruleset, method: "" });
  };
  const set = (id, patch) => onUpdate(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const rsShort = (rs) => (rs === "Michigan (FSAE)" ? "FSAE" : rs === "Germany (FSG)" ? "FSG" : "Both");

  const combinedCitation = (r) => {
    const parts = [];
    if (r.germanCitation) parts.push(`FSG ${r.germanCitation}`);
    if (r.michiganCitation) parts.push(`FSAE ${r.michiganCitation}`);
    return parts.length ? parts.join(" / ") : r.rule || "—"; // r.rule: legacy fallback for older rows
  };

  const startRuleEdit = (r, lang) => {
    const key = `${r.id}:${lang}`;
    setRuleDraft((d) => ({ ...d, [key]: (lang === "de" ? r.germanRule : r.michiganRule) || "" }));
    setRuleEditing((prev) => new Set(prev).add(key));
  };
  const saveRuleEdit = (r, lang) => {
    const key = `${r.id}:${lang}`;
    set(r.id, { [lang === "de" ? "germanRule" : "michiganRule"]: (ruleDraft[key] ?? "").trim() });
    setRuleEditing((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };
  const toggleExpanded = (r) => {
    const willOpen = !expanded.has(r.id);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(r.id)) next.delete(r.id);
      else next.add(r.id);
      return next;
    });
    if (willOpen) {
      if (!r.germanRule) startRuleEdit(r, "de");
      if (!r.michiganRule) startRuleEdit(r, "mi");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#666", marginBottom: 8 }}>
        {CRITICALITY_LEVELS.map((level) => (
          <span key={level} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: criticalityColor(level) }} />
            {level}
          </span>
        ))}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ ...S.th, width: 200 }}>Item to validate</th>
          <th style={{ ...S.th, width: 130 }}>Ruleset</th>
          <th style={{ ...S.th, width: 170 }}>Rule citation</th>
          <th style={{ ...S.th, width: 180 }}>Method / evidence</th>
          <th style={{ ...S.th, width: 90 }}>Status</th>
          <th style={{ ...S.th, width: 30 }}></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <React.Fragment key={r.id}>
            <tr>
              <td style={S.td}>
                <div style={{ display: "flex", gap: 6 }}>
                  <CriticalityDot value={r.criticality} onChange={(v) => set(r.id, { criticality: v })} />
                  <div>
                    <div>{r.item}</div>
                    <button
                      onClick={() => toggleExpanded(r)}
                      style={{ border: "none", background: "none", color: "#666", fontSize: 11, cursor: "pointer", padding: 0, marginTop: 2 }}
                    >
                      {expanded.has(r.id) ? "▾ Full rule" : "▸ Full rule"}
                    </button>
                  </div>
                </div>
              </td>
              <td style={S.td}>
                <select
                  style={{ ...S.input, fontSize: 12, border: "1px solid #ddd" }}
                  value={r.ruleset || "Both"}
                  onChange={(e) => set(r.id, { ruleset: e.target.value })}
                >
                  {RULESETS.map((rs) => (
                    <option key={rs} value={rs}>{rsShort(rs)}</option>
                  ))}
                </select>
              </td>
              <td style={{ ...S.td, ...S.mono, fontSize: 12 }}>{combinedCitation(r)}</td>
              <td style={S.td}>{r.method || "—"}</td>
              <td style={S.td}>
                <StatusChip value={r.status} options={VAL_STATUSES} onChange={(v) => set(r.id, { status: v })} />
              </td>
              <td style={S.td}>
                <DelBtn onClick={() => onUpdate(rows.filter((x) => x.id !== r.id))} />
              </td>
            </tr>
            {expanded.has(r.id) && (
              <tr>
                <td style={{ ...S.td, background: "#fafafa" }} colSpan={6}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                    <RulesetRuleBlock
                      label="Germany (FSG)"
                      citation={r.germanCitation}
                      fullRule={r.germanRule}
                      editing={ruleEditing.has(`${r.id}:de`)}
                      draftText={ruleDraft[`${r.id}:de`]}
                      onCitationChange={(v) => set(r.id, { germanCitation: v })}
                      onDraftChange={(v) => setRuleDraft((d) => ({ ...d, [`${r.id}:de`]: v }))}
                      onStartEdit={() => startRuleEdit(r, "de")}
                      onSave={() => saveRuleEdit(r, "de")}
                    />
                    <RulesetRuleBlock
                      label="Michigan (FSAE)"
                      citation={r.michiganCitation}
                      fullRule={r.michiganRule}
                      editing={ruleEditing.has(`${r.id}:mi`)}
                      draftText={ruleDraft[`${r.id}:mi`]}
                      onCitationChange={(v) => set(r.id, { michiganCitation: v })}
                      onDraftChange={(v) => setRuleDraft((d) => ({ ...d, [`${r.id}:mi`]: v }))}
                      onStartEdit={() => startRuleEdit(r, "mi")}
                      onSave={() => saveRuleEdit(r, "mi")}
                    />
                  </div>
                </td>
              </tr>
            )}
          </React.Fragment>
        ))}
        <tr>
          <td style={S.td}>
            <input style={S.input} placeholder="e.g. Fuse DC rating vs pack short-circuit current" value={draft.item} onChange={(e) => setDraft({ ...draft, item: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} />
          </td>
          <td style={S.td}>
            <select style={{ ...S.input, fontSize: 12 }} value={draft.ruleset} onChange={(e) => setDraft({ ...draft, ruleset: e.target.value })}>
              {RULESETS.map((rs) => (
                <option key={rs} value={rs}>{rs}</option>
              ))}
            </select>
          </td>
          <td style={{ ...S.td, color: "#999", fontSize: 12 }}>Add citation after creating</td>
          <td style={S.td}>
            <input style={S.input} placeholder="Calc / test / inspection" value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value })} />
          </td>
          <td style={S.td} colSpan={2}>
            <button style={S.btnPrimary} onClick={add}>Add</button>
          </td>
        </tr>
      </tbody>
      </table>
    </div>
  );
}

function DeliverableTable({ rows, onUpdate, isAdmin }) {
  const [draft, setDraft] = useState({ name: "", due: "" });
  const add = () => {
    if (!draft.name.trim()) return;
    onUpdate([...rows, { id: uid(), ...draft, status: "Open", addedByLead: !!isAdmin }]);
    setDraft({ name: "", due: "" });
  };
  const set = (id, patch) => onUpdate(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={S.th}>Deliverable</th>
          <th style={{ ...S.th, width: 70 }}>Due</th>
          <th style={{ ...S.th, width: 100 }}>Status</th>
          <th style={{ ...S.th, width: 30 }}></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} style={isOverdue(r.due, r.status) ? { background: "#fdeeee" } : undefined}>
            <td style={S.td}>{r.addedByLead && <LeadDot kind="deliverable" />}{r.name}</td>
            <td style={{ ...S.td, ...S.mono }}>{fmtDate(r.due)}</td>
            <td style={S.td}>
              <StatusChip value={r.status} options={DELIV_STATUSES} onChange={(v) => set(r.id, { status: v })} />
            </td>
            <td style={S.td}>
              <DelBtn onClick={() => onUpdate(rows.filter((x) => x.id !== r.id))} />
            </td>
          </tr>
        ))}
        <tr>
          <td style={S.td}>
            <input style={S.input} placeholder="e.g. Gusset FEA report, CDR slide deck" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} />
          </td>
          <td style={S.td}>
            <input type="date" style={{ ...S.input, ...S.mono, fontSize: 12 }} value={draft.due} onChange={(e) => setDraft({ ...draft, due: e.target.value })} />
          </td>
          <td style={S.td} colSpan={2}>
            <button style={S.btnPrimary} onClick={add}>Add</button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}



// ─── Gantt bar view of the timeline ─────────────────────────────────────────

const DAY_MS = 86400000;
const toDate = (s) => new Date(s + "T00:00");

// Turns "M/D" text into a resolver that tracks its own running year, bumping
// forward whenever the month drops (e.g. 12/20 → 1/23 rolls into next year).
// Each outline section (the Gates summary line vs. the phase/task body) gets
// its own resolver since both restart from the same beginning-of-timeline date.
function makeDateResolver(refYear) {
  let year = refYear;
  let lastMonth = null;
  return (md) => {
    const [m, d] = md.split("/").map(Number);
    if (lastMonth !== null && m < lastMonth - 1) year += 1;
    lastMonth = m;
    return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
}

// Parses a pasted deliverable-timeline outline (gates line, PHASE headers with
// date ranges + a description line, "M/D — task" bullets, trailing CRITICAL
// PATH section) into structured gates/phases/tasks/criticalPath.
function parseTimelineOutline(text, refYear) {
  const gates = [];
  const phases = [];
  const tasks = [];
  let criticalPath = "";
  let curPhase = null;
  let inCriticalPath = false;
  const gateDate = makeDateResolver(refYear);
  const bodyDate = makeDateResolver(refYear);

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^CRITICAL PATH$/i.test(line)) { inCriticalPath = true; continue; }
    if (inCriticalPath) { criticalPath += (criticalPath ? "\n" : "") + line; continue; }

    const gatesLine = line.match(/^Gates:\s*(.+)$/i);
    if (gatesLine) {
      gatesLine[1].split("|").forEach((seg) => {
        const m = seg.trim().match(/^(.+?)\s+(\d{1,2}\/\d{1,2})$/);
        if (m) gates.push({ id: uid(), name: m[1].trim(), date: gateDate(m[2]) });
      });
      continue;
    }

    const phaseHeader = line.match(/^(.+?)\s*\((\d{1,2}\/\d{1,2})\s*[–-]\s*(\d{1,2}\/\d{1,2})/);
    if (phaseHeader) {
      // Only the "from" date advances the shared running resolver — it's the
      // next true chronological point in the walk through the outline. The
      // "to" date is derived relative to "from" instead of also being fed
      // through bodyDate; otherwise it'd peek ahead (e.g. a phase ending in
      // March of next year) and desync the year for every bullet that
      // follows within that same phase, which still belongs to the earlier year.
      const from = bodyDate(phaseHeader[2]);
      const [fromM] = phaseHeader[2].split("/").map(Number);
      const [toM, toD] = phaseHeader[3].split("/").map(Number);
      const fromYear = Number(from.slice(0, 4));
      const toYear = toM < fromM ? fromYear + 1 : fromYear;
      const to = `${toYear}-${String(toM).padStart(2, "0")}-${String(toD).padStart(2, "0")}`;
      curPhase = { id: uid(), name: phaseHeader[1].trim(), from, to, description: "" };
      phases.push(curPhase);
      continue;
    }

    const bullet = line.match(/^(\d{1,2}\/\d{1,2})\s*[—-]+\s*(.+)$/);
    if (bullet) {
      tasks.push({ id: uid(), name: bullet[2].trim(), due: bodyDate(bullet[1]), status: "Not Started", category: curPhase ? curPhase.name : "Milestone" });
      continue;
    }

    if (curPhase && !curPhase.description) curPhase.description = line;
  }
  return { gates, phases, tasks, criticalPath };
}

const PHASE_BANDS = ["#f3f0fa", "#eef6f4", "#fdf4ea", "#eef2fb"];

function MonthCalendar({ tasks, deliverables, phases = [], gates = [], order = [], onReorder }) {
  const DAY_W = 28;
  const NAME_W = 240;
  const ROW_H = 44;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rawItems = [
    ...tasks.map((t) => ({ ...t, kind: "task", from: t.start || t.due, to: t.due || t.start })),
    ...deliverables.map((d) => ({ ...d, kind: "deliv", from: d.due, to: d.due })),
  ].filter((i) => i.from);

  if (rawItems.length === 0)
    return <div style={{ padding: 30, color: "#666", fontSize: 13, border: "1px solid #ddd" }}>No dated tasks or deliverables yet — add dates in the table view and they'll appear here.</div>;

  // Manual drag order (sidebar) wins; anything not yet ordered falls back to date order at the end.
  const byId = new Map(rawItems.map((i) => [i.id, i]));
  const dateSorted = [...rawItems].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : (a.to || a.from) < (b.to || b.from) ? -1 : 1));
  const orderedIds = order.filter((id) => byId.has(id));
  const missing = dateSorted.filter((i) => !orderedIds.includes(i.id));
  const items = [...orderedIds.map((id) => byId.get(id)), ...missing];

  const dragId = React.useRef(null);
  const reorderRows = (targetId) => {
    if (!dragId.current || dragId.current === targetId || !onReorder) return;
    const ids = items.map((i) => i.id).filter((id) => id !== dragId.current);
    ids.splice(ids.indexOf(targetId), 0, dragId.current);
    onReorder(ids);
  };

  // Range: min start → max due, padded 3 days each side, always including today.
  let min = toDate(items[0].from);
  let max = toDate(items[0].to || items[0].from);
  items.forEach((i) => {
    const f = toDate(i.from), t = toDate(i.to || i.from);
    if (f < min) min = f;
    if (t > max) max = t;
  });
  phases.forEach((p) => {
    const f = toDate(p.from), t = toDate(p.to);
    if (f < min) min = f;
    if (t > max) max = t;
  });
  gates.forEach((g) => {
    const d = toDate(g.date);
    if (d < min) min = d;
    if (d > max) max = d;
  });
  if (today < min) min = today;
  if (today > max) max = today;
  min = new Date(min.getTime() - 3 * DAY_MS);
  max = new Date(max.getTime() + 3 * DAY_MS);
  const nDays = Math.round((max - min) / DAY_MS) + 1;

  const dayX = (d) => Math.round((toDate(typeof d === "string" ? d : dkeyStr(d)) - min) / DAY_MS) * DAY_W;
  const dkeyStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayX = Math.round((today - min) / DAY_MS) * DAY_W;

  // Month header segments
  const months = [];
  for (let i = 0; i < nDays; i++) {
    const d = new Date(min.getTime() + i * DAY_MS);
    const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
    if (!months.length || months[months.length - 1].label !== label) months.push({ label, start: i, count: 1 });
    else months[months.length - 1].count++;
  }

  const chartW = nDays * DAY_W;

  return (
    <div style={{ border: "1px solid #000" }}>
      <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", minWidth: NAME_W + chartW }}>
        {/* Fixed name column */}
        <div style={{ width: NAME_W, flexShrink: 0, borderRight: "1px solid #000", position: "sticky", left: 0, background: "#fff", zIndex: 2 }}>
          <div style={{ height: 46, borderBottom: "1px solid #000", display: "flex", alignItems: "flex-end", padding: "4px 12px", fontSize: 13, fontWeight: 700 }}>
            Task / deliverable
          </div>
          {items.map((it) => (
            <div
              key={it.id}
              draggable={!!onReorder}
              onDragStart={() => { dragId.current = it.id; }}
              onDragOver={(e) => { e.preventDefault(); reorderRows(it.id); }}
              onDragEnd={() => { dragId.current = null; }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f7f7f7")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
              style={{ height: ROW_H, borderBottom: "1px solid #eee", display: "flex", alignItems: "center", gap: 8, padding: "0 12px", fontSize: 13, cursor: onReorder ? "grab" : "default", background: "#fff" }}
            >
              {onReorder && <span style={{ color: "#bbb", fontSize: 13, flexShrink: 0 }} title="Drag to reorder">⠿</span>}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.kind === "deliv" ? "◆ " : ""}{it.name}</span>
            </div>
          ))}
        </div>

        {/* Chart area */}
        <div style={{ position: "relative", width: chartW }}>
          {/* Phase row */}
          {phases.length > 0 && (
            <div style={{ display: "flex", height: 20, borderBottom: "1px solid #ddd", position: "relative" }}>
              {phases.map((p, i) => {
                const x = dayX(p.from);
                const w = (Math.round((toDate(p.to) - toDate(p.from)) / DAY_MS) + 1) * DAY_W;
                return (
                  <div
                    key={p.id}
                    title={p.description}
                    style={{ position: "absolute", left: x, width: w, top: 0, bottom: 0, background: PHASE_BANDS[i % PHASE_BANDS.length], borderRight: "1px solid #ddd", fontSize: 10, fontWeight: 700, padding: "3px 4px", whiteSpace: "nowrap", overflow: "hidden" }}
                  >
                    {p.name}
                  </div>
                );
              })}
            </div>
          )}
          {/* Month row */}
          <div style={{ display: "flex", height: 22, borderBottom: "1px solid #ddd" }}>
            {months.map((m, i) => (
              <div key={i} style={{ width: m.count * DAY_W, fontSize: 12, fontWeight: 700, padding: "3px 4px", borderRight: "1px solid #ddd", whiteSpace: "nowrap", overflow: "hidden" }}>
                {m.label}
              </div>
            ))}
          </div>
          {/* Day row */}
          <div style={{ display: "flex", height: 24, borderBottom: "1px solid #000" }}>
            {Array.from({ length: nDays }, (_, i) => {
              const d = new Date(min.getTime() + i * DAY_MS);
              const wknd = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div key={i} style={{ width: DAY_W, fontSize: 10, textAlign: "center", paddingTop: 6, color: wknd ? "#bbb" : "#666", background: wknd ? "#fafafa" : "#fff", ...S.mono }}>
                  {d.getDate()}
                </div>
              );
            })}
          </div>

          {/* Grid + weekend shading behind bars */}
          <div style={{ position: "relative", height: items.length * ROW_H }}>
            {/* Phase background bands */}
            {phases.map((p, i) => {
              const x = dayX(p.from);
              const w = (Math.round((toDate(p.to) - toDate(p.from)) / DAY_MS) + 1) * DAY_W;
              return <div key={p.id} style={{ position: "absolute", left: x, width: w, top: 0, bottom: 0, background: PHASE_BANDS[i % PHASE_BANDS.length], opacity: 0.5 }} />;
            })}
            {Array.from({ length: nDays }, (_, i) => {
              const d = new Date(min.getTime() + i * DAY_MS);
              const wknd = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div key={i} style={{ position: "absolute", left: i * DAY_W, top: 0, bottom: 0, width: DAY_W, background: wknd ? "rgba(0,0,0,0.04)" : "none", borderRight: "1px solid #f0f0f0" }} />
              );
            })}
            {/* Row separators */}
            {items.map((_, r) => (
              <div key={r} style={{ position: "absolute", left: 0, right: 0, top: (r + 1) * ROW_H, borderTop: "1px solid #eee" }} />
            ))}
            {/* Today line */}
            {todayX >= 0 && todayX <= chartW && (
              <div style={{ position: "absolute", left: todayX + DAY_W / 2, top: phases.length ? -66 : -46, bottom: 0, width: 0, borderLeft: `2px solid ${ACCENT}`, zIndex: 1 }} />
            )}
            {/* Gates */}
            {gates.map((g) => {
              const gx = dayX(g.date) + DAY_W / 2;
              if (gx < 0 || gx > chartW) return null;
              return (
                <div key={g.id} style={{ position: "absolute", left: gx, top: phases.length ? -66 : -46, bottom: 0, width: 0, borderLeft: "2px dashed #c17d0a", zIndex: 1 }}>
                  <div style={{ position: "absolute", top: -14, left: 4, fontSize: 10, fontWeight: 700, color: "#c17d0a", whiteSpace: "nowrap" }}>{g.name}</div>
                </div>
              );
            })}
            {/* Bars */}
            {items.map((it, r) => {
              const c = statusColor(it.status);
              const x = dayX(it.from);
              const w = (Math.round((toDate(it.to || it.from) - toDate(it.from)) / DAY_MS) + 1) * DAY_W;
              const late = isOverdue(it.to || it.from, it.status);
              const tip = `${it.name} — ${it.status}\n${fmtDate(it.from)}${it.to !== it.from ? " → " + fmtDate(it.to) : ""}${late ? "  (OVERDUE)" : ""}`;
              if (it.kind === "deliv")
                return (
                  <div key={it.id} title={tip} style={{ position: "absolute", left: x + DAY_W / 2 - 8, top: r * ROW_H + ROW_H / 2 - 8, width: 16, height: 16, background: c, transform: "rotate(45deg)", border: late ? "2px solid #c11414" : "none", borderRadius: 2, boxShadow: "0 1px 2px rgba(0,0,0,0.25)", cursor: "default" }} />
                );
              return (
                <div
                  key={it.id}
                  title={tip}
                  style={{
                    position: "absolute",
                    left: x,
                    top: r * ROW_H + 8,
                    width: Math.max(w, DAY_W) - 2,
                    height: ROW_H - 16,
                    background: c,
                    border: late ? "2px solid #c11414" : "none",
                    borderRadius: 3,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                    boxSizing: "border-box",
                    cursor: "default",
                    overflow: "hidden",
                  }}
                >
                  <span style={{ color: "#fff", fontSize: 11, fontWeight: 600, lineHeight: `${ROW_H - 16}px`, padding: "0 6px", whiteSpace: "nowrap" }}>{it.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      </div>
      <div style={{ borderTop: "1px solid #000", padding: "8px 12px", fontSize: 11, color: "#666", display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#666", borderRadius: 2 }} /> Not started</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: ACCENT, borderRadius: 2 }} /> In progress</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#0a7a2f", borderRadius: 2 }} /> Complete</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#c11414", borderRadius: 2 }} /> Blocked</span>
        <span>◆ deliverable · red outline = overdue · purple line = today{gates.length ? " · orange dashed = gate" : ""}{onReorder ? " · drag ⠿ to reorder" : ""}</span>
      </div>
    </div>
  );
}

// ─── Project information tab ────────────────────────────────────────────────

function LinkRow({ label, url, placeholder, onChange }) {
  const [editing, setEditing] = useState(!url);
  const [val, setVal] = useState(url || "");
  const save = () => { onChange(val.trim()); setEditing(false); };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #ddd", padding: "8px 0" }}>
      <span style={{ fontWeight: 600, fontSize: 13, width: 150, flexShrink: 0 }}>{label}</span>
      {editing ? (
        <>
          <input style={{ ...S.input, fontSize: 12 }} placeholder={placeholder} value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
          <button style={S.btnPrimary} onClick={save}>Save</button>
        </>
      ) : (
        <>
          <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: ACCENT, wordBreak: "break-all" }}>{url}</a>
          <span style={{ flex: 1 }} />
          <button style={{ ...S.btn, fontSize: 11, padding: "2px 8px" }} onClick={() => setEditing(true)}>Edit</button>
        </>
      )}
    </div>
  );
}

// Generic single-photo upload/replace/remove slot, backed by its own storage key.
// Used for the main project picture, last year's photo, and the vision board.
function ImageSlot({ label, imageId, prefix, onChange, compact }) {
  const [imgData, setImgData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = React.useRef(null);

  useEffect(() => {
    let live = true;
    if (imageId) {
      window.storage
        .get(prefix + imageId, true)
        .then((r) => live && r && setImgData(r.value))
        .catch(() => live && setImgData(null));
    } else {
      setImgData(null);
    }
    return () => { live = false; };
  }, [imageId]); // eslint-disable-line

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await resizeImage(file, compact ? 800 : 1200, 0.75);
      const id = uid();
      await window.storage.set(prefix + id, dataUrl, true);
      if (imageId) {
        try { await window.storage.delete(prefix + imageId, true); } catch { /* gone */ }
      }
      setImgData(dataUrl);
      onChange(id);
      if (ref.current) ref.current.value = "";
    } catch {
      alert("Couldn't process that image.");
    }
    setUploading(false);
  };

  const remove = async () => {
    if (imageId) {
      try { await window.storage.delete(prefix + imageId, true); } catch { /* gone */ }
    }
    setImgData(null);
    onChange(null);
  };

  return (
    <div>
      {label && <div style={{ fontWeight: 700, fontSize: compact ? 12 : 14, marginBottom: 6 }}>{label}</div>}
      {imgData ? compact ? (
        <div style={{ position: "relative", border: "1px solid #000" }}>
          <img src={imgData} alt={label || "photo"} style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }} />
          <button
            onClick={() => setMenuOpen((v) => !v)}
            title="Edit photo"
            style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, border: "1px solid #000", background: "#fff", cursor: "pointer", fontSize: 11, padding: 0, lineHeight: "18px" }}
          >
            ✎
          </button>
          {menuOpen && (
            <div style={{ position: "absolute", top: 26, right: 4, background: "#fff", border: "1px solid #000", zIndex: 5 }}>
              <button
                style={{ display: "block", width: "100%", border: "none", borderBottom: "1px solid #000", background: "none", fontSize: 11, padding: "4px 10px", cursor: "pointer", textAlign: "left", whiteSpace: "nowrap" }}
                onClick={() => { setMenuOpen(false); ref.current?.click(); }}
              >
                Replace
              </button>
              <button
                style={{ display: "block", width: "100%", border: "none", background: "none", fontSize: 11, padding: "4px 10px", cursor: "pointer", textAlign: "left", color: "#c11414", whiteSpace: "nowrap" }}
                onClick={() => { setMenuOpen(false); remove(); }}
              >
                Remove
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ border: "1px solid #000" }}>
          <img src={imgData} alt={label || "photo"} style={{ width: "100%", display: "block" }} />
          <div style={{ display: "flex", borderTop: "1px solid #000" }}>
            <button style={{ ...S.btn, border: "none", borderRight: "1px solid #000", flex: 1, fontSize: 12 }} onClick={() => ref.current?.click()}>Replace</button>
            <button style={{ ...S.btn, border: "none", flex: 1, fontSize: 12, color: "#c11414" }} onClick={remove}>Remove</button>
          </div>
        </div>
      ) : (
        <div
          style={{
            border: "1px dashed #000",
            padding: compact ? 10 : 24,
            textAlign: "center",
            fontSize: compact ? 10 : 12,
            color: "#666",
            cursor: "pointer",
            height: compact ? 130 : undefined,
            display: compact ? "flex" : undefined,
            alignItems: compact ? "center" : undefined,
            justifyContent: compact ? "center" : undefined,
          }}
          onClick={() => ref.current?.click()}
        >
          {uploading ? "Uploading…" : compact ? "+ Add photo" : "Click to add a picture (CAD render, assembly photo, schematic…)"}
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => upload(e.target.files?.[0])} />
    </div>
  );
}

function InfoTab({ info, onUpdate, isAdmin }) {
  const [desc, setDesc] = useState(info.description || "");
  const [extraDraft, setExtraDraft] = useState({ label: "", url: "" });
  const [pastDraft, setPastDraft] = useState({ label: "", url: "" });
  const links = info.links || [];
  const past = info.pastResources || [];
  const visionBoard = (info.visionBoard || []).filter(Boolean);

  const addExtra = () => {
    if (!extraDraft.url.trim()) return;
    onUpdate({ ...info, links: [...links, { id: uid(), ...extraDraft, addedByLead: !!isAdmin }] });
    setExtraDraft({ label: "", url: "" });
  };

  const addPast = () => {
    if (!pastDraft.url.trim()) return;
    onUpdate({ ...info, pastResources: [...past, { id: uid(), ...pastDraft, addedByLead: !!isAdmin }] });
    setPastDraft({ label: "", url: "" });
  };

  return (
    <div style={{ maxWidth: 1400 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px minmax(240px, 1fr)", gap: 20, alignItems: "start" }}>
        {/* Description */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, borderBottom: "1px solid #000", paddingBottom: 4, marginBottom: 8 }}>
            Project description
          </div>
          <textarea
            style={{ ...S.input, minHeight: 180, lineHeight: 1.5 }}
            placeholder="Scope, interfaces, key requirements, what done looks like…"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => onUpdate({ ...info, description: desc })}
          />
        </div>

        {/* Picture */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, borderBottom: "1px solid #000", paddingBottom: 4, marginBottom: 8 }}>
            Picture
          </div>
          <ImageSlot
            imageId={info.imageId}
            prefix="uwfm-projimg:"
            onChange={(id) => onUpdate({ ...info, imageId: id })}
          />

          <div style={{ marginTop: 20 }}>
            <ImageSlot
              label="Last year's photo"
              imageId={info.lastYearImageId}
              prefix="uwfm-lastyear:"
              onChange={(id) => onUpdate({ ...info, lastYearImageId: id })}
            />
          </div>
        </div>

        {/* Vision board */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, borderBottom: "1px solid #000", paddingBottom: 4, marginBottom: 8 }}>
            Vision board
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
            {visionBoard.map((slotId, i) => (
              <ImageSlot
                key={slotId}
                compact
                imageId={slotId}
                prefix="uwfm-vision:"
                onChange={(id) => {
                  const next = [...visionBoard];
                  if (id) next[i] = id;
                  else next.splice(i, 1);
                  onUpdate({ ...info, visionBoard: next });
                }}
              />
            ))}
            <ImageSlot
              key={`add-${visionBoard.length}`}
              compact
              imageId={null}
              prefix="uwfm-vision:"
              onChange={(id) => {
                if (id) onUpdate({ ...info, visionBoard: [...visionBoard, id] });
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ fontWeight: 700, fontSize: 14, borderBottom: "1px solid #000", paddingBottom: 4, margin: "20px 0 4px" }}>
        Key documents
      </div>
      <LinkRow
        label="MDS"
        url={info.mdsUrl}
        placeholder="Link to Mechanical Design Spec (Drive/Docs URL)"
        onChange={(v) => onUpdate({ ...info, mdsUrl: v })}
      />
      <LinkRow
        label="Project debrief"
        url={info.debriefUrl}
        placeholder="Link to project debrief Google Doc"
        onChange={(v) => onUpdate({ ...info, debriefUrl: v })}
      />
      {links.map((l) => (
        <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #ddd", padding: "8px 0" }}>
          <span style={{ fontWeight: 600, fontSize: 13, width: 150, flexShrink: 0, display: "flex", alignItems: "center" }}>{l.addedByLead && <LeadDot kind="link" />}{l.label || "Link"}</span>
          <a href={l.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: ACCENT, wordBreak: "break-all" }}>{l.url}</a>
          <span style={{ flex: 1 }} />
          <DelBtn onClick={() => onUpdate({ ...info, links: links.filter((x) => x.id !== l.id) })} />
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, padding: "10px 0" }}>
        <input style={{ ...S.input, width: 150 }} placeholder="Label (e.g. ADR deck)" value={extraDraft.label} onChange={(e) => setExtraDraft({ ...extraDraft, label: e.target.value })} />
        <input style={{ ...S.input, flex: 1 }} placeholder="https://…" value={extraDraft.url} onChange={(e) => setExtraDraft({ ...extraDraft, url: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addExtra()} />
        <button style={S.btn} onClick={addExtra}>Add link</button>
      </div>

      <div style={{ fontWeight: 700, fontSize: 14, borderBottom: "1px solid #000", paddingBottom: 4, margin: "20px 0 4px" }}>
        Past resources
      </div>
      <div style={{ fontSize: 12, color: "#666", padding: "4px 0 6px" }}>
        Prior-year documents, old ADRs, T37 debriefs, reference designs — anything from before this project.
      </div>
      {past.map((l) => (
        <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #ddd", padding: "8px 0" }}>
          <span style={{ fontWeight: 600, fontSize: 13, width: 150, flexShrink: 0, display: "flex", alignItems: "center" }}>{l.addedByLead && <LeadDot kind="link" />}{l.label || "Resource"}</span>
          <a href={l.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: ACCENT, wordBreak: "break-all" }}>{l.url}</a>
          <span style={{ flex: 1 }} />
          <DelBtn onClick={() => onUpdate({ ...info, pastResources: past.filter((x) => x.id !== l.id) })} />
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, padding: "10px 0" }}>
        <input style={{ ...S.input, width: 150 }} placeholder="Label (e.g. T37 LV debrief)" value={pastDraft.label} onChange={(e) => setPastDraft({ ...pastDraft, label: e.target.value })} />
        <input style={{ ...S.input, flex: 1 }} placeholder="https://…" value={pastDraft.url} onChange={(e) => setPastDraft({ ...pastDraft, url: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addPast()} />
        <button style={S.btn} onClick={addPast}>Add resource</button>
      </div>
    </div>
  );
}

// ─── Project view (title-block header + sections) ───────────────────────────

const TAB_ORDER_PREFIX = "uwfm-tab-order:";

function ProjectView({ project, onChange, onBack, isAdmin }) {
  const [tab, setTab] = useState("info");
  const [tlView, setTlView] = useState("table"); // table | calendar
  const patch = (p) => onChange({ ...project, ...p });
  const info = project.info || { description: "", mdsUrl: "", debriefUrl: "", links: [] };
  const gates = project.gates || [];
  const phases = project.phases || [];

  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importYear, setImportYear] = useState(new Date().getFullYear());
  const importOutline = () => {
    const parsed = parseTimelineOutline(importText, importYear);
    patch({
      gates: parsed.gates,
      phases: parsed.phases,
      tasks: [...project.tasks, ...parsed.tasks],
      criticalPath: parsed.criticalPath || project.criticalPath || "",
    });
    setShowImport(false);
    setImportText("");
  };

  const openTasks = project.tasks.filter((t) => t.status !== "Complete").length;
  const overdue = [...project.tasks, ...project.deliverables].filter((t) => isOverdue(t.due, t.status)).length;
  const valOpen = project.validations.filter((v) => !["Passed"].includes(v.status)).length;

  const tabs = [
    ["info", "Information"],
    ["timeline", `Timeline (${project.tasks.length})`],
    ["deliverables", `Deliverables (${project.deliverables.length})`],
    ["validation", `Validation & rules (${project.validations.length})`],
  ];

  // Members can drag their tabs into whatever order they like; the order is
  // remembered per-project in this browser only (it's a personal view preference).
  const canReorderTabs = !isAdmin;
  const tabOrderKey = TAB_ORDER_PREFIX + project.id;
  const [tabOrder, setTabOrder] = useState(() => {
    if (!canReorderTabs) return tabs.map(([id]) => id);
    try {
      const saved = JSON.parse(localStorage.getItem(tabOrderKey) || "null");
      if (Array.isArray(saved)) return saved;
    } catch { /* ignore */ }
    return tabs.map(([id]) => id);
  });
  const dragId = React.useRef(null);

  const labelById = Object.fromEntries(tabs);
  const knownIds = tabs.map(([id]) => id);
  const orderedIds = [...tabOrder.filter((id) => knownIds.includes(id)), ...knownIds.filter((id) => !tabOrder.includes(id))];
  const orderedTabs = orderedIds.map((id) => [id, labelById[id]]);

  const reorderTabs = (targetId) => {
    if (!dragId.current || dragId.current === targetId) return;
    const next = orderedIds.filter((id) => id !== dragId.current);
    const targetIdx = next.indexOf(targetId);
    next.splice(targetIdx, 0, dragId.current);
    setTabOrder(next);
    try { localStorage.setItem(tabOrderKey, JSON.stringify(next)); } catch { /* ignore */ }
  };

  return (
    <div>
      {/* Title block */}
      <div style={{ border: "1px solid #000", display: "grid", gridTemplateColumns: "1fr auto auto auto", marginBottom: 16 }}>
        <div style={{ padding: "10px 14px", borderRight: "1px solid #000" }}>
          <div style={{ fontSize: 11, color: "#666" }}>{isAdmin ? "Project" : "Your project"}</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{project.name}</div>
          <div style={{ fontSize: 12, marginTop: 2 }}>Owner: {project.member || "unassigned"}</div>
        </div>
        {[
          ["Open tasks", openTasks, "#000"],
          ["Overdue", overdue, overdue ? "#c11414" : "#000"],
          ["Validation open", valOpen, "#000"],
        ].map(([label, n, color]) => (
          <div key={label} style={{ padding: "10px 14px", borderRight: "1px solid #000", textAlign: "right", minWidth: 90 }}>
            <div style={{ fontSize: 11, color: "#666" }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color, ...S.mono }}>{n}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #000", marginBottom: 12, flexWrap: "wrap" }}>
        {onBack && (
          <button style={{ ...S.btn, border: "none", borderRight: "1px solid #000" }} onClick={onBack}>← All projects</button>
        )}
        {orderedTabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            draggable={canReorderTabs}
            onDragStart={() => { dragId.current = id; }}
            onDragOver={(e) => { if (canReorderTabs) { e.preventDefault(); reorderTabs(id); } }}
            onDragEnd={() => { dragId.current = null; }}
            style={{
              ...S.btn,
              border: "none",
              borderBottom: tab === id ? `3px solid ${ACCENT}` : "3px solid transparent",
              fontWeight: tab === id ? 700 : 400,
              padding: "8px 14px",
              cursor: canReorderTabs ? "grab" : "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "timeline" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", border: "1px solid #000" }}>
              {[["table", "Table"], ["calendar", "Bar view"]].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTlView(id)}
                  style={{
                    ...S.btn,
                    border: "none",
                    background: tlView === id ? "#000" : "#fff",
                    color: tlView === id ? "#fff" : "#000",
                    fontSize: 12,
                    padding: "4px 14px",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {isAdmin && (
              <button style={{ ...S.btn, fontSize: 12 }} onClick={() => setShowImport((v) => !v)}>
                {showImport ? "Cancel import" : "Import outline"}
              </button>
            )}
          </div>

          {showImport && (
            <div style={{ border: "1px solid #000", padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
                Paste a deliverable-timeline outline (Gates line, PHASE headers with "(M/D – M/D)" ranges, "M/D — task" bullets, trailing CRITICAL PATH section). Parsed gates/phases replace existing ones; tasks are added to the current list.
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
                  Reference year (for the first M/D date)
                  <input type="number" style={{ ...S.input, width: 80 }} value={importYear} onChange={(e) => setImportYear(+e.target.value)} />
                </label>
              </div>
              <textarea
                style={{ ...S.input, minHeight: 200, lineHeight: 1.5, fontFamily: "monospace", fontSize: 12 }}
                placeholder="Paste the full outline here…"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
              <div style={{ marginTop: 8 }}>
                <button style={S.btnPrimary} onClick={importOutline} disabled={!importText.trim()}>Parse &amp; import</button>
              </div>
            </div>
          )}

          {gates.length > 0 && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10, fontSize: 12 }}>
              {gates.map((g) => (
                <span key={g.id} style={{ border: "1px solid #c17d0a", color: "#c17d0a", padding: "3px 8px" }}>{g.name} — {fmtDate(g.date)}</span>
              ))}
            </div>
          )}
          {project.criticalPath && (
            <div style={{ border: "1px solid #000", padding: 10, marginBottom: 14, fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Critical path</div>
              {project.criticalPath}
            </div>
          )}

          {tlView === "table" ? (
            <TaskTable rows={project.tasks} onUpdate={(tasks) => patch({ tasks })} isAdmin={isAdmin} />
          ) : (
            <div style={{ position: "relative", left: "50%", right: "50%", width: "100vw", marginLeft: "-50vw", marginRight: "-50vw", padding: "0 20px" }}>
              <MonthCalendar
                tasks={project.tasks}
                deliverables={project.deliverables}
                phases={phases}
                gates={gates}
                order={project.timelineOrder || []}
                onReorder={(order) => patch({ timelineOrder: order })}
              />
            </div>
          )}
        </div>
      )}
      {tab === "info" && <InfoTab info={info} onUpdate={(i) => patch({ info: i })} isAdmin={isAdmin} />}
      {tab === "deliverables" && <DeliverableTable rows={project.deliverables} onUpdate={(deliverables) => patch({ deliverables })} isAdmin={isAdmin} />}
      {tab === "validation" && <ValidationTable rows={project.validations} onUpdate={(validations) => patch({ validations })} />}
    </div>
  );
}

// ─── Etrain Home (team page: weekly posts, pit schedule, photos) ────────────

const emptyHome = { posts: [], pit: [], photos: [], gcalUrl: "" };
const PHOTO_PREFIX = "uwfm-potd:";

function resizeImage(file, maxDim = 1000, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}

function EtrainHome({ home, onChangeHome, isAdmin, defaultName }) {
  // ── posts
  const [draftPost, setDraftPost] = useState({ title: "", body: "" });
  const [editingId, setEditingId] = useState(null);
  const [showPostForm, setShowPostForm] = useState(false);

  const savePost = () => {
    if (!draftPost.title.trim() && !draftPost.body.trim()) return;
    if (editingId) {
      onChangeHome({ ...home, posts: home.posts.map((p) => (p.id === editingId ? { ...p, ...draftPost } : p)) });
    } else {
      onChangeHome({ ...home, posts: [{ id: uid(), ...draftPost, date: new Date().toISOString() }, ...home.posts] });
    }
    setDraftPost({ title: "", body: "" });
    setEditingId(null);
    setShowPostForm(false);
  };

  // ── pit schedule
  const [slot, setSlot] = useState({ name: defaultName || "", date: "", start: "", end: "", note: "" });
  const addSlot = () => {
    if (!slot.name.trim() || !slot.date || !slot.start) return;
    onChangeHome({ ...home, pit: [...home.pit, { id: uid(), ...slot }] });
    setSlot({ ...slot, date: "", start: "", end: "", note: "" });
  };
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = home.pit
    .filter((s) => s.date >= todayStr)
    .sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1));
  const byDate = upcoming.reduce((acc, s) => ((acc[s.date] = acc[s.date] || []).push(s), acc), {});

  // ── photos
  const [photoData, setPhotoData] = useState({});
  const [caption, setCaption] = useState("");
  const [photoName, setPhotoName] = useState(defaultName || "");
  const [pendingFile, setPendingFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = React.useRef(null);

  useEffect(() => {
    let live = true;
    (async () => {
      for (const m of home.photos.slice(0, 24)) {
        if (photoData[m.id]) continue;
        try {
          const r = await window.storage.get(PHOTO_PREFIX + m.id, true);
          if (live && r) setPhotoData((d) => ({ ...d, [m.id]: r.value }));
        } catch { /* missing photo */ }
      }
    })();
    return () => { live = false; };
  }, [home.photos]); // eslint-disable-line

  const uploadPhoto = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await resizeImage(file);
      const id = uid();
      await window.storage.set(PHOTO_PREFIX + id, dataUrl, true);
      setPhotoData((d) => ({ ...d, [id]: dataUrl }));
      onChangeHome({
        ...home,
        photos: [{ id, caption: caption.trim(), author: photoName.trim() || "anon", date: new Date().toISOString() }, ...home.photos],
      });
      setCaption("");
      setPhotoName("");
      setPendingFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      alert("Couldn't process that image.");
    }
    setUploading(false);
  };

  const deletePhoto = async (id) => {
    try { await window.storage.delete(PHOTO_PREFIX + id, true); } catch { /* already gone */ }
    setPhotoData((d) => { const n = { ...d }; delete n[id]; return n; });
    onChangeHome({ ...home, photos: home.photos.filter((p) => p.id !== id) });
  };

  const fmtDay = (d) =>
    toDate(d).toLocaleDateString("default", { weekday: "short", month: "short", day: "numeric" });
  const fmtPostDate = (iso) =>
    new Date(iso).toLocaleDateString("default", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 20, alignItems: "start" }}>
      {/* ── Left: weekly posts + photos ── */}
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, borderBottom: "2px solid #000", paddingBottom: 6, marginBottom: 14 }}>
          <span style={{ fontSize: 20, fontWeight: 700 }}>Etrain weekly</span>
          {isAdmin && (
            <button style={{ ...S.btn, fontSize: 12 }} onClick={() => { setShowPostForm(!showPostForm); setEditingId(null); setDraftPost({ title: "", body: "" }); }}>
              {showPostForm ? "Cancel" : "+ New post"}
            </button>
          )}
        </div>

        {isAdmin && showPostForm && (
          <div style={{ border: "1px solid #000", padding: 12, marginBottom: 16 }}>
            <input style={{ ...S.input, fontWeight: 700, marginBottom: 6 }} placeholder="Post title (e.g. Week of 9/14 — CDR prep)" value={draftPost.title} onChange={(e) => setDraftPost({ ...draftPost, title: e.target.value })} />
            <textarea style={{ ...S.input, minHeight: 120, lineHeight: 1.5, marginBottom: 6 }} placeholder="Updates, events, deadlines, shoutouts…" value={draftPost.body} onChange={(e) => setDraftPost({ ...draftPost, body: e.target.value })} />
            <button style={S.btnPrimary} onClick={savePost}>{editingId ? "Save changes" : "Publish"}</button>
          </div>
        )}

        {home.posts.length === 0 && !showPostForm && (
          <div style={{ color: "#666", fontSize: 13, padding: "10px 0 20px" }}>
            No posts yet.{isAdmin ? " Hit + New post to write the first weekly update." : " Your lead hasn't posted yet."}
          </div>
        )}
        {home.posts.map((p) => (
          <div key={p.id} style={{ borderBottom: "1px solid #ddd", padding: "12px 0", marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{p.title}</span>
              <span style={{ ...S.mono, fontSize: 11, color: "#666" }}>{fmtPostDate(p.date)}</span>
              <span style={{ flex: 1 }} />
              {isAdmin && (
                <>
                  <button style={{ ...S.btn, fontSize: 11, padding: "2px 8px" }} onClick={() => { setEditingId(p.id); setDraftPost({ title: p.title, body: p.body }); setShowPostForm(true); window.scrollTo(0, 0); }}>Edit</button>
                  <button style={{ ...S.btn, fontSize: 11, padding: "2px 8px", color: "#c11414", borderColor: "#c11414" }} onClick={() => window.confirm("Delete this post?") && onChangeHome({ ...home, posts: home.posts.filter((x) => x.id !== p.id) })}>Delete</button>
                </>
              )}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", marginTop: 6 }}>{p.body}</div>
          </div>
        ))}

        {/* Photos of the day */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, borderBottom: "2px solid #000", paddingBottom: 6, margin: "28px 0 12px" }}>
          <span style={{ fontSize: 20, fontWeight: 700 }}>Pictures of the day</span>
        </div>
        <div style={{ border: "1px solid #000", padding: 10, marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input ref={fileRef} type="file" accept="image/*" style={{ fontSize: 12 }} onChange={(e) => setPendingFile(e.target.files?.[0] || null)} disabled={uploading} />
          <input style={{ ...S.input, flex: 1, minWidth: 140 }} placeholder="Caption" value={caption} onChange={(e) => setCaption(e.target.value)} />
          <input style={{ ...S.input, width: 120 }} placeholder="Your name" value={photoName} onChange={(e) => setPhotoName(e.target.value)} />
          <button style={S.btnPrimary} onClick={() => uploadPhoto(pendingFile)} disabled={!pendingFile || uploading}>Post</button>
          {uploading && <span style={{ fontSize: 12, color: "#666" }}>Uploading…</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {home.photos.map((m) => (
            <div key={m.id} style={{ border: "1px solid #000" }}>
              {photoData[m.id] ? (
                <img src={photoData[m.id]} alt={m.caption || "team photo"} style={{ width: "100%", display: "block" }} />
              ) : (
                <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 12 }}>loading…</div>
              )}
              <div style={{ padding: "6px 8px", borderTop: "1px solid #000" }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{m.caption || "—"}</div>
                <div style={{ fontSize: 11, color: "#666", display: "flex", gap: 6 }}>
                  <span>{m.author}</span>
                  <span style={S.mono}>{fmtPostDate(m.date)}</span>
                  <span style={{ flex: 1 }} />
                  <button style={{ border: "none", background: "none", color: "#999", cursor: "pointer", fontSize: 11 }} onClick={() => window.confirm("Delete photo?") && deletePhoto(m.id)}>✕</button>
                </div>
              </div>
            </div>
          ))}
          {home.photos.length === 0 && <div style={{ color: "#666", fontSize: 13 }}>No photos yet — first one in the pit wins.</div>}
        </div>
      </div>

      {/* ── Right: pit schedule ── */}
      <div style={{ border: "1px solid #000" }}>
        <div style={{ padding: "8px 12px", borderBottom: "1px solid #000", fontWeight: 700 }}>Pit schedule</div>
        <div style={{ padding: 10, borderBottom: "1px solid #000", display: "grid", gap: 6 }}>
          <input style={S.input} placeholder="Your name" value={slot.name} onChange={(e) => setSlot({ ...slot, name: e.target.value })} />
          <div style={{ display: "flex", gap: 6 }}>
            <input type="date" style={{ ...S.input, ...S.mono, fontSize: 12 }} value={slot.date} onChange={(e) => setSlot({ ...slot, date: e.target.value })} />
            <input type="time" style={{ ...S.input, ...S.mono, fontSize: 12, width: 100 }} value={slot.start} onChange={(e) => setSlot({ ...slot, start: e.target.value })} />
            <input type="time" style={{ ...S.input, ...S.mono, fontSize: 12, width: 100 }} value={slot.end} onChange={(e) => setSlot({ ...slot, end: e.target.value })} />
          </div>
          <input style={S.input} placeholder="What you're working on (optional)" value={slot.note} onChange={(e) => setSlot({ ...slot, note: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addSlot()} />
          <button style={S.btnPrimary} onClick={addSlot}>I'll be in the pit</button>
        </div>
        <div style={{ maxHeight: 480, overflowY: "auto" }}>
          {Object.keys(byDate).length === 0 && (
            <div style={{ padding: 12, fontSize: 13, color: "#666" }}>Nobody signed up yet.</div>
          )}
          {Object.entries(byDate).map(([date, slots]) => (
            <div key={date}>
              <div style={{ padding: "4px 12px", background: "#f0f0f0", borderBottom: "1px solid #ddd", fontSize: 12, fontWeight: 700 }}>
                {fmtDay(date)}{date === todayStr ? " — today" : ""}
              </div>
              {slots.map((s) => (
                <div key={s.id} style={{ padding: "6px 12px", borderBottom: "1px solid #eee", display: "flex", gap: 8, fontSize: 13, alignItems: "baseline" }}>
                  <span style={{ ...S.mono, fontSize: 12, whiteSpace: "nowrap" }}>{s.start}{s.end ? `–${s.end}` : ""}</span>
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  <span style={{ color: "#666", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.note}</span>
                  <DelBtn onClick={() => onChangeHome({ ...home, pit: home.pit.filter((x) => x.id !== s.id) })} />
                </div>
              ))}
            </div>
          ))}
        </div>
        {/* Optional embedded Google Calendar */}
        <div style={{ borderTop: "1px solid #000", padding: 10 }}>
          {home.gcalUrl ? (
            <>
              <iframe src={home.gcalUrl} title="Team Google Calendar" style={{ width: "100%", height: 380, border: "1px solid #ddd" }} />
              {isAdmin && (
                <button style={{ ...S.btn, fontSize: 11, marginTop: 6 }} onClick={() => onChangeHome({ ...home, gcalUrl: "" })}>Remove embedded calendar</button>
              )}
            </>
          ) : isAdmin ? (
            <div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
                Optional: embed a shared Google Calendar (Calendar settings → Integrate calendar → copy the embed URL; calendar must be public or shared with the team).
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input style={{ ...S.input, fontSize: 11 }} placeholder="https://calendar.google.com/calendar/embed?src=…" onKeyDown={(e) => { if (e.key === "Enter" && e.target.value.startsWith("https://calendar.google.com")) onChangeHome({ ...home, gcalUrl: e.target.value.trim() }); }} />
              </div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>Paste and hit Enter.</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Admin home ─────────────────────────────────────────────────────────────

function AdminHome({ store, setStore, openProject }) {
  const [name, setName] = useState("");
  const [member, setMember] = useState("");
  const [copied, setCopied] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ name: "", member: "", code: "" });

  const create = () => {
    if (!name.trim()) return;
    setStore({ ...store, projects: [...store.projects, emptyProject(name.trim(), member.trim())] });
    setName("");
    setMember("");
  };

  const copyCode = (p) => {
    const text = `${p.name} — access code: ${p.code}\nOpen the tracker link and enter this code to see your project.`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(p.id);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditDraft({ name: p.name, member: p.member || "", code: p.code });
  };

  const saveEdit = () => {
    if (!editDraft.name.trim() || !editDraft.code.trim()) return;
    setStore({
      ...store,
      projects: store.projects.map((x) =>
        x.id === editingId
          ? { ...x, name: editDraft.name.trim(), member: editDraft.member.trim(), code: editDraft.code.trim().toUpperCase() }
          : x
      ),
    });
    setEditingId(null);
  };

  const dragId = React.useRef(null);
  const reorderProjects = (targetId) => {
    if (!dragId.current || dragId.current === targetId) return;
    const ids = store.projects.map((p) => p.id).filter((id) => id !== dragId.current);
    ids.splice(ids.indexOf(targetId), 0, dragId.current);
    setStore({ ...store, projects: ids.map((id) => store.projects.find((p) => p.id === id)) });
  };

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
        <thead>
          <tr>
            <th style={{ ...S.th, width: 50 }}></th>
            <th style={S.th}>Project</th>
            <th style={S.th}>Member</th>
            <th style={{ ...S.th, width: 110 }}>Access code</th>
            <th style={{ ...S.th, width: 90 }}>Tasks open</th>
            <th style={{ ...S.th, width: 80 }}>Overdue</th>
            <th style={{ ...S.th, width: 200 }}></th>
          </tr>
        </thead>
        <tbody>
          {store.projects.map((p) => {
            const open = p.tasks.filter((t) => t.status !== "Complete").length;
            const od = [...p.tasks, ...p.deliverables].filter((t) => isOverdue(t.due, t.status)).length;
            return (
              <tr
                key={p.id}
                draggable={editingId !== p.id}
                onDragStart={() => { dragId.current = p.id; }}
                onDragOver={(e) => { e.preventDefault(); reorderProjects(p.id); }}
                onDragEnd={() => { dragId.current = null; }}
              >
                <td style={{ ...S.td, cursor: "grab", color: "#999", textAlign: "center", fontSize: 14 }} title="Drag to reorder">
                  ⠿
                </td>
                {editingId === p.id ? (
                  <>
                    <td style={S.td}>
                      <input style={S.input} value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && saveEdit()} />
                    </td>
                    <td style={S.td}>
                      <input style={S.input} value={editDraft.member} onChange={(e) => setEditDraft({ ...editDraft, member: e.target.value })} onKeyDown={(e) => e.key === "Enter" && saveEdit()} />
                    </td>
                    <td style={S.td}>
                      <input style={{ ...S.input, ...S.mono }} value={editDraft.code} onChange={(e) => setEditDraft({ ...editDraft, code: e.target.value })} onKeyDown={(e) => e.key === "Enter" && saveEdit()} />
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ ...S.td, fontWeight: 600, cursor: "pointer" }} onClick={() => openProject(p.id)}>
                      {p.name}
                    </td>
                    <td style={S.td}>{p.member || "—"}</td>
                    <td style={{ ...S.td, ...S.mono }}>{p.code}</td>
                  </>
                )}
                <td style={{ ...S.td, ...S.mono }}>{open}</td>
                <td style={{ ...S.td, ...S.mono, color: od ? "#c11414" : undefined, fontWeight: od ? 700 : 400 }}>{od}</td>
                <td style={S.td}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {editingId === p.id ? (
                      <>
                        <button style={S.btnPrimary} onClick={saveEdit}>Save</button>
                        <button style={S.btn} onClick={() => setEditingId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button style={S.btn} onClick={() => openProject(p.id)}>Open</button>
                        <button style={S.btn} onClick={() => startEdit(p)}>Edit</button>
                        <button style={S.btn} onClick={() => copyCode(p)}>{copied === p.id ? "Copied" : "Copy invite"}</button>
                        <button
                          style={{ ...S.btn, color: "#c11414", borderColor: "#c11414" }}
                          onClick={() => {
                            if (window.confirm(`Delete project "${p.name}" and all its data?`))
                              setStore({ ...store, projects: store.projects.filter((x) => x.id !== p.id) });
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {store.projects.length === 0 && (
            <tr>
              <td style={{ ...S.td, color: "#666" }} colSpan={7}>
                No projects yet. Create the first one below — e.g. "LV Battery", "Accumulator", "Inverters".
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div style={{ border: "1px solid #000", padding: 14, maxWidth: 560 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>New project</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input style={{ ...S.input, flex: 2, minWidth: 160 }} placeholder="Project name (e.g. LV Battery)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
          <input style={{ ...S.input, flex: 1, minWidth: 120 }} placeholder="Member name" value={member} onChange={(e) => setMember(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
          <button style={S.btnPrimary} onClick={create}>Create</button>
        </div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
          Each project gets an access code. Send the member this app's link plus their code — entering the code shows them only their project.
        </div>
      </div>
    </div>
  );
}

// ─── Gate (login) ───────────────────────────────────────────────────────────

function Gate({ store, setStore, onEnter }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [newPin, setNewPin] = useState("");
  const needsSetup = !store.adminPin;

  const submit = () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    if (store.adminPin && c === store.adminPin.toUpperCase()) return onEnter({ role: "admin" });
    const p = store.projects.find((x) => x.code === c);
    if (p) return onEnter({ role: "member", projectId: p.id });
    setErr("Code not recognized.");
  };

  const setup = () => {
    const pin = newPin.trim().toUpperCase();
    if (pin.length < 4) return setErr("Lead PIN must be at least 4 characters.");
    setStore({ ...store, adminPin: pin });
    onEnter({ role: "admin" });
  };

  return (
    <div style={{ maxWidth: 420, margin: "60px auto", border: "1px solid #000", padding: 24 }}>
      <div style={{ fontSize: 12, color: "#666" }}>UWFM · T38 Etrain</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Project Tracker</div>
      {needsSetup ? (
        <>
          <div style={{ fontSize: 13, marginBottom: 10 }}>
            First run — set a lead PIN. You'll use it to open the full team view; members get per-project codes.
          </div>
          <input style={{ ...S.input, ...S.mono, marginBottom: 8 }} placeholder="Choose lead PIN (min 4 chars)" value={newPin} onChange={(e) => setNewPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setup()} />
          <button style={{ ...S.btnPrimary, width: "100%" }} onClick={setup}>Set PIN & enter</button>
        </>
      ) : (
        <>
          <input
            style={{ ...S.input, ...S.mono, marginBottom: 8 }}
            placeholder="Lead PIN or member access code"
            value={code}
            onChange={(e) => { setCode(e.target.value); setErr(""); }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoFocus
          />
          <button style={{ ...S.btnPrimary, width: "100%" }} onClick={submit}>Enter</button>
        </>
      )}
      {err && <div style={{ color: "#c11414", fontSize: 12, marginTop: 8 }}>{err}</div>}
      <div style={{ fontSize: 11, color: "#666", marginTop: 14, borderTop: "1px solid #ddd", paddingTop: 10 }}>
        Data is shared: everyone with this link sees the same tracker, scoped by their code.
      </div>
    </div>
  );
}

// ─── App root ───────────────────────────────────────────────────────────────

export default function App() {
  const [store, setStoreState] = useState(null);
  const [session, setSession] = useState(null); // {role, projectId?}
  const [openId, setOpenId] = useState(null);
  const [page, setPage] = useState("home"); // home | projects
  const [saveErr, setSaveErr] = useState(false);

  useEffect(() => {
    loadStore().then(setStoreState);
  }, []);

  const setStore = useCallback((next) => {
    setStoreState(next);
    saveStore(next).then((ok) => setSaveErr(!ok));
  }, []);

  const refresh = () => loadStore().then(setStoreState);

  if (!store)
    return (
      <div style={{ fontFamily: "system-ui, sans-serif", padding: 40, fontSize: 14 }}>Loading tracker…</div>
    );

  const home = store.home || emptyHome;
  const setHome = (h) => setStore({ ...store, home: h });

  const updateProject = (proj) =>
    setStore({ ...store, projects: store.projects.map((p) => (p.id === proj.id ? proj : p)) });

  const memberProject =
    session?.role === "member" ? store.projects.find((x) => x.id === session.projectId) : null;

  let body;
  if (!session) {
    body = <Gate store={store} setStore={setStore} onEnter={(s) => { setSession(s); setPage("home"); }} />;
  } else if (page === "home") {
    body = (
      <EtrainHome
        home={home}
        onChangeHome={setHome}
        isAdmin={session.role === "admin"}
        defaultName={memberProject?.member || ""}
      />
    );
  } else if (page === "packaging") {
    body = <T38Packaging isAdmin={session.role === "admin"} />;
  } else if (session.role === "member") {
    body = memberProject ? (
      <ProjectView project={memberProject} onChange={updateProject} isAdmin={false} />
    ) : (
      <div style={{ padding: 40 }}>This project was removed. Ask your lead for a new code.</div>
    );
  } else if (openId) {
    const p = store.projects.find((x) => x.id === openId);
    body = p ? (
      <ProjectView project={p} onChange={updateProject} onBack={() => setOpenId(null)} isAdmin />
    ) : null;
  } else {
    body = <AdminHome store={store} setStore={setStore} openProject={setOpenId} />;
  }

  const navTabs = session
    ? [["home", "Etrain home"], ["projects", session.role === "admin" ? "Projects" : "My project"], ["packaging", "Packaging"]]
    : [];

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", color: "#000", background: "#fff", minHeight: "100vh" }}>
      {session && (
        <div style={{ borderBottom: "1px solid #000", padding: "0 20px", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontWeight: 700, padding: "8px 0", marginRight: 12 }}>UWFM · T38 Etrain</span>
          {navTabs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setPage(id); if (id === "projects") setOpenId(null); }}
              style={{
                ...S.btn,
                border: "none",
                borderBottom: page === id ? `3px solid ${ACCENT}` : "3px solid transparent",
                fontWeight: page === id ? 700 : 400,
                padding: "10px 14px",
              }}
            >
              {label}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: "#666", marginRight: 10 }}>{session.role === "admin" ? "Lead view" : "Member view"}</span>
          {saveErr && <span style={{ color: "#c11414", fontSize: 12, marginRight: 10 }}>Save failed — retry your last edit</span>}
          <button style={{ ...S.btn, fontSize: 12, marginRight: 6 }} onClick={refresh}>Refresh</button>
          <button style={{ ...S.btn, fontSize: 12 }} onClick={() => { setSession(null); setOpenId(null); setPage("home"); }}>Sign out</button>
        </div>
      )}
      {page === "packaging" && session ? (
        <div style={{ height: "calc(100vh - 45px)" }}>{body}</div>
      ) : (
        <div style={{ padding: session ? 20 : 0, maxWidth: 1280, margin: "0 auto" }}>{body}</div>
      )}
    </div>
  );
}
