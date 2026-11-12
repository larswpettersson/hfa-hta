/*
  HTA adapter for the HFA AI assistant (scripts/ai-assist.js).
  Sends the task hierarchy and the TTA rows to the model, and applies the HTA it proposes: a complete
  { root, ttaRecords } or a patch (see schemaPrompt). Applied changes go through HTAEditor.replaceState, so
  Ctrl/⌘+Z undoes them.

  The TTA columns belong to the analysis (meta.columns; hfa-ds design principles 1.7, architecture section 8):
  the adapter has no column list of its own. The column part of the prompt is built from the columns for every
  question, the context carries every column's values, and a patch is checked against the columns.
*/
(function () {
  "use strict";
  const editor = window.HTAEditor;
  if (!editor || !window.HFAAssist) return;

  /** The analysis' columns that hold values on a TTA row (taskStep is the link to the task, not a field). */
  const fieldColumns = (s = editor.getState()) => (s.meta?.columns || []).filter((c) => c.id !== "taskStep");

  const SYSTEM_PROMPT = `You are an expert human factors analyst working on a Hierarchical Task Analysis (HTA, Annett & Duncan; Stanton) with a Tabular Task Analysis (TTA), supplied as JSON.

Method:
1. Hierarchy: the root is the overall goal; children are sub-goals and operations in the order they are normally carried out. Check that each decomposition is complete (the children together achieve the parent), at a consistent level of detail, and stops where further breakdown adds nothing. Name tasks as actions (verb + object).
2. TTA: each row analyses one task. The analysis defines its own columns (listed below with what each means); fill them in as their descriptions say. A task can have several rows. Do not add fields for columns that do not exist.

Rules:
- Reference tasks by their ids (1, 1.2, 1.2.3) and TTA rows by their record ids (r1, …). Do not invent tasks without labelling them "proposed".
- Prefer Markdown tables that use the analysis' column names.
- Be concise and specific; state uncertainty instead of guessing, and leave a cell empty rather than inventing content.
- Answer in the language of the user's question; keep the analysis text in the language the analysis is written in.`;

  /** Column part of the prompt: built from the analysis for every question, after the (editable) system prompt. */
  function columnPrompt() {
    const cols = fieldColumns();
    const lines = cols.map((c) => {
      const kind = c.type === "list" ? "list of strings" : c.type === "select" ? `one of ${JSON.stringify(c.options || [])}` : "text";
      return `- "${c.id}" (${c.label}; ${kind})${c.description ? `: ${c.description}` : ""}`;
    });
    const example = cols.slice(0, 2).map((c) => `"${c.id}": ${c.type === "list" ? '["…"]' : c.type === "select" ? JSON.stringify((c.options || ["…"])[0]) : '"…"'}`).join(", ");
    return `

TTA columns of this analysis (the field name on each row, its label, its type, and what it means):
${lines.join("\n") || "- (no columns besides the task)"}
Only these fields may appear on a TTA row, besides "id" and "taskId".

Data model:
{ "columns": [ … as above … ],
  "root": { "id": "1", "title": "…", "children": [ { "id": "1.1", "title": "…", "children": [] } ] },
  "ttaRecords": [ { "id": "r1", "taskId": "1.1"${example ? ", " + example : ""} } ] }
Task ids are hierarchical and follow the position in the tree (the editor renumbers them). Every task has at least one TTA row. Empty values mean "not analysed yet" and are left out of the context.

Changing the analysis: unless the user explicitly asks for the complete analysis, do NOT repeat unchanged parts. Return one \`\`\`json block that is a patch:
{"patch": true,
 "tasks": [{"id": "1.2", "title": "New title"},
           {"id": "n1", "parent": "1.2", "position": 0, "title": "New sub-task", "children": [{"title": "…"}]}],
 "ttaRecords": [{"id": "r3"${example ? ", " + example : ""}},
                {"taskId": "1.2.1"${example ? ", " + example : ""}}],
 "remove": ["1.4", "r7"]}
- "remove" lists task ids (the task, its sub-tasks and their TTA rows go) and TTA record ids. It is applied first.
- A task whose id exists is updated (title; "parent"/"position" move it). A new task needs a new id (e.g. "n1"), a "parent" (an existing task id or a new id given earlier in the list) and optionally a 0-based "position" among the parent's children (default: last) and nested "children".
- A TTA row whose id exists is merged (only the fields you give change). A row without a known id is added to its "taskId" (which may be a new task id); it fills the task's empty row first.
- The columns themselves cannot be changed by a patch; suggest new columns in text instead.
- Ids are renumbered from the tree after the patch, so use the ids as they are now.
For a complete analysis give {"root": …, "ttaRecords": […]} instead, with the same columns.`;
  }

  const QUICK_ACTIONS = [
    ["Review hierarchy", "Review the task hierarchy: is each decomposition complete and at a consistent level of detail, are steps missing or in the wrong order, and are tasks named as actions? Propose the changes as a patch."],
    ["Fill empty cells", "Fill in the TTA cells that are still empty, following each column's description. Leave a cell empty where the analysis gives no basis for it. Return a patch that merges into the existing record ids."],
    ["Review TTA rows", "Check every TTA row against the column descriptions: is each cell filled in as its column asks, are values inconsistent between rows, do tasks lack rows? Point out problems and propose corrections as a patch."],
    ["Summarise", "Summarise the analysis for a meeting: the main findings, organised by the analysis' columns, the open questions, and which tasks or cells are still empty."],
    ["Decompose selection", "Decompose the selected task (or, without a selection, the bottom-level tasks that are too coarse) into sub-tasks in the order they are carried out. Return a patch."],
  ];

  /* ── Context: the columns, the hierarchy without levels and meta, and the rows without empty values ── */
  const isEmptyValue = (v) => (Array.isArray(v) ? !v.length : v === undefined || v === null || String(v).trim() === "");
  const compactTask = (t) => ({ id: t.id, title: t.title, children: (t.children || []).map(compactTask) });
  const compactColumn = (c) => {
    const out = { id: c.id, label: c.label, type: c.type || "text" };
    if (c.options) out.options = c.options;
    if (c.description) out.description = c.description;
    return out;
  };
  function getContext() {
    const s = editor.getState();
    const cols = fieldColumns(s);
    return {
      columns: cols.map(compactColumn),
      root: compactTask(s.root),
      ttaRecords: (s.ttaRecords || []).map((r) => {
        const out = { id: r.id, taskId: r.taskId };
        cols.forEach((c) => { if (!isEmptyValue(r[c.id])) out[c.id] = r[c.id]; });
        return out;
      }),
    };
  }

  const findTask = (node, id) => {
    if (!node) return null;
    if (node.id === id) return node;
    for (const c of node.children || []) { const hit = findTask(c, id); if (hit) return hit; }
    return null;
  };
  const findParent = (node, id) => {
    for (const c of node.children || []) {
      if (c.id === id) return node;
      const hit = findParent(c, id); if (hit) return hit;
    }
    return null;
  };
  const subtreeIds = (node, out = []) => { out.push(node.id); (node.children || []).forEach((c) => subtreeIds(c, out)); return out; };
  const countTasks = (node) => 1 + (node.children || []).reduce((n, c) => n + countTasks(c), 0);

  function getScope() {
    const id = editor.getSelectedTaskId();
    if (!id) return null;
    const ctx = getContext();
    const task = findTask(ctx.root, id);
    if (!task) return null;
    const ids = new Set(subtreeIds(task));
    return { label: `task ${id} "${task.title}"`, items: { task, ttaRecords: ctx.ttaRecords.filter((r) => ids.has(r.taskId)) } };
  }

  /* ── Proposals ── */
  function inspect(obj) {
    if (obj.patch === true) {
      const n = (k) => (Array.isArray(obj[k]) ? obj[k].length : 0);
      const parts = [];
      if (n("tasks")) parts.push(`${n("tasks")} tasks`);
      if (n("ttaRecords")) parts.push(`${n("ttaRecords")} TTA rows`);
      if (n("remove")) parts.push(`remove ${obj.remove.join(", ")}`);
      return { title: `HTA patch · ${parts.join(", ") || "no changes"}`, applyLabel: "Apply to editor" };
    }
    if (obj.root && typeof obj.root === "object" && typeof obj.root.title === "string") {
      return { title: `HTA · ${countTasks(obj.root)} tasks, ${(obj.ttaRecords || []).length} TTA rows`, applyLabel: "Load into editor",
        confirm: "Replace the hierarchy and the TTA table with this analysis? (Ctrl/⌘+Z undoes it.)" };
    }
    return null;
  }

  /** A row's values from a proposal, checked against the columns: unknown fields and select values outside the
      options are refused; list values become arrays and text values strings. */
  function recordFields(r, cols, where) {
    const byId = new Map(cols.map((c) => [c.id, c]));
    const unknown = Object.keys(r).filter((k) => !["id", "taskId"].includes(k) && !byId.has(k));
    if (unknown.length) {
      throw new Error(`${where} has field${unknown.length === 1 ? "" : "s"} ${unknown.map((k) => `"${k}"`).join(", ")} that ${unknown.length === 1 ? "is not a column" : "are not columns"} of this analysis.`);
    }
    const out = {};
    Object.keys(r).forEach((k) => {
      const c = byId.get(k);
      if (!c) return;
      const v = r[k];
      if (c.type === "list") {
        out[k] = Array.isArray(v) ? v.map(String).filter(Boolean) : String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
      } else {
        const text = Array.isArray(v) ? v.join(", ") : String(v ?? "");
        if (c.type === "select" && text && !(c.options || []).includes(text)) {
          throw new Error(`${where}: "${text}" is not one of the options of "${c.label}" (${(c.options || []).join(", ")}).`);
        }
        out[k] = text;
      }
    });
    return out;
  }
  const emptyFields = (cols) => Object.fromEntries(cols.map((c) => [c.id, c.type === "list" ? [] : ""]));

  /** Merge an HTA patch into the current state. Returns { state, stats }. */
  function applyPatch(cur, patch) {
    const s = JSON.parse(JSON.stringify(cur));
    const cols = fieldColumns(s);
    const isEmptyRecord = (r) => cols.every((c) => isEmptyValue(r[c.id]));
    const stats = { added: 0, changed: 0, removed: 0 };
    const recIds = () => new Set(s.ttaRecords.map((r) => r.id));
    let seq = 1;
    const newRecId = () => { const used = recIds(); let id; do id = `r-ai${seq++}`; while (used.has(id)); return id; };

    (Array.isArray(patch.remove) ? patch.remove : []).forEach((id) => {
      id = String(id);
      const rec = s.ttaRecords.findIndex((r) => r.id === id);
      if (rec >= 0) { s.ttaRecords.splice(rec, 1); stats.removed++; return; }
      if (id === s.root.id) throw new Error("The root task cannot be removed.");
      const parent = findParent(s.root, id);
      if (!parent) return;
      const node = parent.children.find((c) => c.id === id);
      const gone = new Set(subtreeIds(node));
      parent.children = parent.children.filter((c) => c !== node);
      s.ttaRecords = s.ttaRecords.filter((r) => !gone.has(r.taskId));
      stats.removed++;
    });

    // New tasks keep their temporary ids until the editor renumbers the tree, so TTA rows can point at them.
    const build = (t, fallbackId) => ({ id: String(t.id || fallbackId), title: String(t.title || "").trim(), level: 0,
      children: (t.children || []).map((c, i) => build(c, `${t.id || fallbackId}-${i + 1}`)) });
    const place = (parent, node, position) => {
      parent.children = parent.children || [];
      const at = Number.isInteger(position) ? Math.max(0, Math.min(parent.children.length, position)) : parent.children.length;
      parent.children.splice(at, 0, node);
    };
    (Array.isArray(patch.tasks) ? patch.tasks : []).forEach((t, i) => {
      if (!t || typeof t !== "object") return;
      const existing = t.id != null ? findTask(s.root, String(t.id)) : null;
      if (existing) {
        if (typeof t.title === "string" && t.title.trim()) existing.title = t.title.trim();
        if (t.parent != null && existing !== s.root) {
          const target = findTask(existing, String(t.parent)) ? null : findTask(s.root, String(t.parent));
          if (!target) throw new Error(`Cannot move task ${t.id} under ${t.parent}.`);
          const from = findParent(s.root, existing.id);
          from.children = from.children.filter((c) => c !== existing);
          place(target, existing, t.position);
        } else if (Number.isInteger(t.position) && existing !== s.root) {
          const from = findParent(s.root, existing.id);
          from.children = from.children.filter((c) => c !== existing);
          place(from, existing, t.position);
        }
        stats.changed++;
        return;
      }
      if (t.parent == null) throw new Error(`New task ${t.id || "(no id)"} needs a "parent".`);
      const parent = findTask(s.root, String(t.parent));
      if (!parent) throw new Error(`Parent ${t.parent} of new task ${t.id || "(no id)"} not found.`);
      const node = build(t, `n-ai${i + 1}`);
      if (!node.title) throw new Error(`New task ${node.id} needs a title.`);
      place(parent, node, t.position);
      stats.added++;
    });

    (Array.isArray(patch.ttaRecords) ? patch.ttaRecords : []).forEach((r) => {
      if (!r || typeof r !== "object") return;
      const where = `TTA row ${r.id || `for task ${r.taskId ?? "?"}`}`;
      const fields = recordFields(r, cols, where);
      const hit = r.id != null ? s.ttaRecords.find((x) => x.id === String(r.id)) : null;
      if (hit) {
        Object.assign(hit, fields);
        if (r.taskId != null && findTask(s.root, String(r.taskId))) hit.taskId = String(r.taskId);
        stats.changed++;
        return;
      }
      const taskId = String(r.taskId ?? "");
      if (!findTask(s.root, taskId)) throw new Error(`${where} points at unknown task ${taskId || "(none)"}.`);
      const blank = s.ttaRecords.find((x) => x.taskId === taskId && isEmptyRecord(x));
      if (blank) { Object.assign(blank, fields); stats.changed++; return; }
      const id = r.id != null && !recIds().has(String(r.id)) ? String(r.id) : newRecId();
      s.ttaRecords.push({ id, taskId, ...emptyFields(cols), ...fields });
      stats.added++;
    });
    return { state: s, stats };
  }

  function apply(obj) {
    if (obj.patch === true) {
      const { state, stats } = applyPatch(editor.getState(), obj);
      editor.replaceState(state);
      return `Patch applied: ${stats.added} added, ${stats.changed} changed, ${stats.removed} removed. Ctrl/⌘+Z undoes it.`;
    }
    const cols = fieldColumns();
    const rows = (obj.ttaRecords || []).map((r, i) => ({ ...r, ...recordFields(r, cols, `TTA row ${r.id || i + 1}`) }));
    editor.replaceState({ root: obj.root, ttaRecords: rows });
    return "Analysis loaded. Ctrl/⌘+Z undoes it.";
  }

  window.HTAAssist = HFAAssist.mount({
    id: "hta",
    title: "HTA analysis",
    content: document.querySelector(".main-content"),
    systemPrompt: SYSTEM_PROMPT,
    schemaPrompt: columnPrompt,
    contextLabel: "Current HTA and TTA (JSON)",
    getContext,
    getScope,
    quickActions: QUICK_ACTIONS,
    inspect,
    apply,
    snapshot: () => editor.getState(),
    restore: (snap) => editor.replaceState(snap),
    welcome: "Pick a provider in **Settings…**, then use a quick action or ask a question. The task hierarchy, the TTA columns with their descriptions, and the TTA rows are sent with every request; select a task to focus on it and its sub-tasks.",
    exportName: "hta-analysis",
  });
  window.HTAAssist.applyPatch = applyPatch;
})();
