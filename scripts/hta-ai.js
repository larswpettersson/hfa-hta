/*
  HTA adapter for the HFA AI assistant (scripts/ai-assist.js).
  Sends the task hierarchy and the TTA / HEI records to the model, and applies the HTA it proposes:
  a complete { root, ttaRecords } or a patch (see SCHEMA_PROMPT). Applied changes go through
  HTAEditor.replaceState, so Ctrl/⌘+Z undoes them.
*/
(function () {
  "use strict";
  const editor = window.HTAEditor;
  if (!editor || !window.HFAAssist) return;

  const TTA_FIELDS = ["externalErrorMode", "recovery", "consequence", "humanErrorType", "psf", "comments"];

  const SYSTEM_PROMPT = `You are an expert human factors analyst. You apply Hierarchical Task Analysis (HTA, Annett & Duncan; Stanton) and Human Error Identification (HEI) in the style of SHERPA / TTA (Tabular Task Analysis) to the task analysis supplied as JSON.

Method:
1. Hierarchy: the root is the overall goal; children are sub-goals and operations in the order they are normally carried out. Check that each decomposition is complete (the children together achieve the parent), at a consistent level of detail, and stops where further breakdown adds nothing (the P × C rule). Name tasks as actions (verb + object).
2. Human error identification for the bottom-level operations: for each operation consider the credible external error modes (Omission, Action too much, Action too little, Action too late, Action too early, Mis-ordering, Wrong action), the consequence of each, whether and how it can be recovered (and at which step), the human error type (Skill-based slip, Lapse, Rule-based mistake, Knowledge-based mistake, Violation) and the performance shaping factors (PSFs: e.g. Interface, Procedures, Training, Time pressure, Workload, Fatigue, Environment, Communication).
3. Remedial measures: propose design, procedure, training or organisational changes that prevent the most severe errors or make them recoverable. Put them in "comments" when you fill in TTA rows.

Rules:
- Reference tasks by their ids (1, 1.2, 1.2.3) and TTA rows by their record ids (r1, …). Do not invent tasks without labelling them "proposed".
- Prefer Markdown tables for error lists: columns Task | Error mode | Consequence | Recovery | Error type | PSFs.
- Be concise and specific; state uncertainty instead of guessing.
- Answer in the language of the user's question; keep the analysis text in the language the analysis is written in.`;

  const SCHEMA_PROMPT = `

Data model:
{ "root": { "id": "1", "title": "…", "children": [ { "id": "1.1", "title": "…", "children": [] } ] },
  "ttaRecords": [ { "id": "r1", "taskId": "1.1", "externalErrorMode": "Omission", "recovery": "…", "consequence": "…",
                    "humanErrorType": "Lapse", "psf": ["Interface", "Time pressure"], "comments": "…" } ] }
Task ids are hierarchical and follow the position in the tree (the editor renumbers them). Every task has at least one TTA row; a task can have several (one per error mode). Empty strings mean "not analysed yet".

Changing the analysis: unless the user explicitly asks for the complete analysis, do NOT repeat unchanged parts. Return one \`\`\`json block that is a patch:
{"patch": true,
 "tasks": [{"id": "1.2", "title": "New title"},
           {"id": "n1", "parent": "1.2", "position": 0, "title": "New sub-task", "children": [{"title": "…"}]}],
 "ttaRecords": [{"id": "r3", "recovery": "…"},
                {"taskId": "1.2.1", "externalErrorMode": "Omission", "consequence": "…", "recovery": "…", "humanErrorType": "Lapse", "psf": ["Procedures"], "comments": "…"}],
 "remove": ["1.4", "r7"]}
- "remove" lists task ids (the task, its sub-tasks and their TTA rows go) and TTA record ids. It is applied first.
- A task whose id exists is updated (title; "parent"/"position" move it). A new task needs a new id (e.g. "n1"), a "parent" (an existing task id or a new id given earlier in the list) and optionally a 0-based "position" among the parent's children (default: last) and nested "children".
- A TTA row whose id exists is merged (only the fields you give change). A row without a known id is added to its "taskId" (which may be a new task id); it fills the task's empty row first.
- Ids are renumbered from the tree after the patch, so use the ids as they are now.
For a complete analysis give {"root": …, "ttaRecords": […]} instead.`;

  const QUICK_ACTIONS = [
    ["Review hierarchy", "Review the task hierarchy: is each decomposition complete and at a consistent level of detail, are steps missing or in the wrong order, and are tasks named as actions? Propose the changes as a patch."],
    ["Identify errors (HEI)", "For every bottom-level task, identify the credible external error modes with their consequence, recovery, human error type and PSFs. Show them in a table, then give the TTA rows as a patch."],
    ["Fill empty TTA rows", "Fill in the TTA rows that are still empty (no error mode or consequence). Return them as a patch that merges into the existing record ids."],
    ["Critical tasks", "Rank the tasks by the severity and likelihood of their errors. Which are safety-critical, and why? Point out errors that have no recovery."],
    ["Remedial measures", "For the most severe errors, propose remedial measures (design, procedures, training, organisation). Add them to the comments of the TTA rows as a patch."],
    ["Decompose selection", "Decompose the selected task (or, without a selection, the bottom-level tasks that are too coarse) into sub-tasks in the order they are carried out. Return a patch."],
  ];

  /* ── Context: the hierarchy without levels and meta, and the TTA rows without empty fields ── */
  const compactTask = (t) => ({ id: t.id, title: t.title, children: (t.children || []).map(compactTask) });
  const compactRecord = (r) => {
    const out = { id: r.id, taskId: r.taskId };
    TTA_FIELDS.forEach((k) => { const v = r[k]; if (Array.isArray(v) ? v.length : v) out[k] = v; });
    return out;
  };
  function getContext() {
    const s = editor.getState();
    return { root: compactTask(s.root), ttaRecords: (s.ttaRecords || []).map(compactRecord) };
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

  const isEmptyRecord = (r) => TTA_FIELDS.every((k) => (Array.isArray(r[k]) ? !r[k].length : !r[k]));
  const normPsf = (v) => (Array.isArray(v) ? v.map(String) : String(v || "").split(",").map((x) => x.trim()).filter(Boolean));
  const recordFields = (r) => {
    const out = {};
    TTA_FIELDS.forEach((k) => { if (r[k] !== undefined) out[k] = k === "psf" ? normPsf(r[k]) : String(r[k] ?? ""); });
    return out;
  };

  /** Merge an HTA patch into the current state. Returns { state, stats }. */
  function applyPatch(cur, patch) {
    const s = JSON.parse(JSON.stringify(cur));
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
      const hit = r.id != null ? s.ttaRecords.find((x) => x.id === String(r.id)) : null;
      if (hit) {
        Object.assign(hit, recordFields(r));
        if (r.taskId != null && findTask(s.root, String(r.taskId))) hit.taskId = String(r.taskId);
        stats.changed++;
        return;
      }
      const taskId = String(r.taskId ?? "");
      if (!findTask(s.root, taskId)) throw new Error(`TTA row ${r.id || ""} points at unknown task ${taskId || "(none)"}.`);
      const blank = s.ttaRecords.find((x) => x.taskId === taskId && isEmptyRecord(x));
      if (blank) { Object.assign(blank, recordFields(r)); stats.changed++; return; }
      const id = r.id != null && !recIds().has(String(r.id)) ? String(r.id) : newRecId();
      s.ttaRecords.push({ id, taskId, externalErrorMode: "", recovery: "", consequence: "", humanErrorType: "", psf: [], comments: "", ...recordFields(r) });
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
    editor.replaceState({ root: obj.root, ttaRecords: obj.ttaRecords || [] });
    return "Analysis loaded. Ctrl/⌘+Z undoes it.";
  }

  window.HTAAssist = HFAAssist.mount({
    id: "hta",
    title: "HTA analysis",
    toolbar: document.querySelector(".header .toolbar"),
    buttonClass: "action-btn",
    systemPrompt: SYSTEM_PROMPT,
    schemaPrompt: SCHEMA_PROMPT,
    contextLabel: "Current HTA and TTA (JSON)",
    getContext,
    getScope,
    quickActions: QUICK_ACTIONS,
    inspect,
    apply,
    snapshot: () => editor.getState(),
    restore: (snap) => editor.replaceState(snap),
    welcome: "Pick a provider in **Settings**, then use a quick action or ask a question. The task hierarchy and the TTA table are sent with every request; select a task to focus on it and its sub-tasks.",
    exportName: "hta-analysis",
  });
  window.HTAAssist.applyPatch = applyPatch;
})();
