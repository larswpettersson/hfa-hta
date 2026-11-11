# HTA Tool — Hierarchical Task Analysis + TTA

**🔗 Live: [larswpettersson.github.io/hfa-hta/HTA.html](https://larswpettersson.github.io/hfa-hta/HTA.html)**

Tools for creating and visualizing Hierarchical Task Analysis (HTA) diagrams with Tabular Task Analysis (TTA / HEI fields).

## The HFA tools

Human Factors Analysis (HFA) tools for safety and human factors work. Each tool is a separate repository and runs in the browser without installation, a server or an account. Nothing leaves the browser unless you export it, and the tools also work in isolated (air-gapped) environments through their single-file offline versions. All tools are under development; file formats may change.

| Tool | What it does | Links |
|---|---|---|
| **HTA *(this repository)*** | Hierarchical Task Analysis with Tabular Task Analysis (TTA / HEI fields): a task tree and a linked table, JSON and CSV export. | [Open](https://larswpettersson.github.io/hfa-hta/HTA.html) · [offline file](https://larswpettersson.github.io/hfa-hta/hta_offline.html) · [repository](https://github.com/larswpettersson/hfa-hta) |
| **Bowtie** | Bowtie diagrams: causes, preventive and reactive barriers, top event and consequences, with printing to one A4 page. | [Open](https://larswpettersson.github.io/hfa-bowtie/Bowtie.html) · [offline file](https://larswpettersson.github.io/hfa-bowtie/Bowtie_offline.html) · [repository](https://github.com/larswpettersson/hfa-bowtie) |
| **STPA Workbench** | System-Theoretic Process Analysis: a control-structure diagram built directly in the diagram, tables for losses, hazards, unsafe control actions and safety constraints, and optional AI support. | [Open](https://larswpettersson.github.io/hfa-stpa/workbench/) · [offline file](https://larswpettersson.github.io/hfa-stpa/workbench/stpa_offline.html) · [repository](https://github.com/larswpettersson/hfa-stpa) |
| **RBD (Reliability Block Diagram)** | Reliability block diagrams. Early design stage, not runnable yet. | [repository](https://github.com/larswpettersson/hfa-rbd) |
| **HFA DS** | The design system: design tokens, the Penpot library, the design principles and the shared automated tests. Contains no runnable application. | [repository](https://github.com/larswpettersson/hfa-ds) · [architecture](https://github.com/larswpettersson/hfa-ds/blob/main/docs/ARCHITECTURE.md) · [design principles](https://github.com/larswpettersson/hfa-ds/blob/main/docs/design-principles.md) |

The AI support in the tools is optional. With a local model (Ollama, LM Studio, LocalAI) no data leaves the computer; a cloud provider (Claude, Gemini, Hugging Face) receives the analysis and any attached image. The full picture is in the [architecture](https://github.com/larswpettersson/hfa-ds/blob/main/docs/ARCHITECTURE.md).

## Offline use

The editor also runs fully offline. [`hta_offline.html`](https://larswpettersson.github.io/hfa-hta/hta_offline.html) is a single self-contained HTML file (script inlined, no network needed). **[Download hta_offline.html](https://larswpettersson.github.io/hfa-hta/hta_offline.html)** (right-click → *Save link as…*), then open the saved file in any modern browser. **Open…** and **Save** use a local file picker and a download; preferences are kept in `localStorage`.


## AI analysis

Press **AI…** in the toolbar (or **A**) to open the analysis panel on the right. It works the same way as the AI analysis in the [STPA workbench](https://larswpettersson.github.io/hfa-stpa/workbench/):

- **Providers:** Anthropic Claude, Google Gemini, Hugging Face Inference Providers (an `hf_…` token; default model `google/gemma-4-31B-it`), or a local model (Ollama, LM Studio, LocalAI). Pick one under **Settings…** and paste an API key or token (or check the local endpoint). Hugging Face setup and the Space that hosts the tools: [hfa-ds/docs/hugging-face.md](https://github.com/larswpettersson/hfa-ds/blob/main/docs/hugging-face.md). The picker beside **Send** chooses the model for the next question.
- **Context:** every question sends the task hierarchy, the analysis' TTA columns (name, type, options and **description**) and the filled-in values of every column, custom columns included. The model fills in the columns as their descriptions say, so an STPA-input analysis gets STPA content and an HEI analysis HEI content. Select a task to focus the question on it and its sub-tasks.
- **Quick actions** for common questions; **Send earlier turns** for follow-ups; answers fold, and **Export .md** saves the conversation.
- **Proposals:** when the model returns a JSON block with a patch (or a complete analysis), the answer shows **Apply**. **Revert** on the card restores what was there before.
- **Keys** stay in this browser's `localStorage` (only when *Remember API keys* is ticked) and are sent only to the provider you pick. The provider settings are shared by the HFA tools on the same site, so a key saved in the STPA workbench is used here too. Use a restricted key.

The panel is [`scripts/ai-assist.js`](scripts/ai-assist.js) (the same file in hfa-hta and hfa-bowtie) and the HTA adapter is [`scripts/hta-ai.js`](scripts/hta-ai.js): system prompt, quick actions, the data sent to the model and how a patch is applied. The offline file includes both; it needs network access only for the AI calls.

A patch can rename, add, move and remove tasks and add or merge TTA rows by id; the editor then renumbers the tasks and the TTA rows follow. A row in a patch may only have fields of the analysis' columns: an unknown field, or a value outside a select column's options, is refused and nothing changes. A patch cannot change the columns. An applied patch is one step in the undo history (**Ctrl/⌘+Z**).

## HTA + TTA Editor (`HTA.html`)

Primary editor. Open [`HTA.html`](HTA.html) in a modern browser — no build step. Logic lives in [`scripts/hta-app.js`](scripts/hta-app.js). Design reference: Penpot **HFA DS → TTA draft**.

### Layout

| Panel | Role |
| --- | --- |
| **HTA** (left) | Hierarchy tree — source of truth for tasks and IDs |
| **TTA** (right) | Table of HEI fields linked to tasks by `taskId` |

Selecting a task in HTA highlights matching TTA rows (and the reverse). Every HTA task always has at least one TTA row.

### Getting started

1. Open `HTA.html` in a browser.
2. Click a task to select it (IDs are display-only).
3. Click the **description** (or press **Enter** when focused) to edit the title; **Enter** applies, **Esc** cancels.
4. Use toolbar buttons or shortcuts to grow the tree.
5. Fill HEI cells in the TTA table; use **Add row** for extra HEI rows on the selected task.
6. **Export** saves full state as JSON; **Export CSV** (TTA toolbar) saves Excel/SmartArt-friendly CSV.

Sample data: [`fixtures/hta-tta-sample.json`](fixtures/hta-tta-sample.json) — use top-bar **Open…**.

### Toolbar

| Control | What it does |
| --- | --- |
| Light / Dark | Theme |
| New | Replace the analysis with a small, generic example that uses the whole structure (asks first; Ctrl/⌘+Z undoes it; clears the AI conversation) |
| Open… | Open an analysis (versioned JSON file); asks first if there are unsaved changes (Save, Don't save, Cancel) |
| Save | Save the analysis as `hta-tta.json` (HTA tree, TTA columns and all TTA records) |
| + Child (**C**) | Add child under selected task |
| + Sibling (**S**) | Add sibling after selected task |
| + Duplicate (**D**) | Duplicate selected task (subtree + TTA) |

Drag the vertical gutter between HTA and TTA to resize panels (saved in `localStorage`). On the HTA canvas, hold **Space** and drag to pan (hand cursor), like Penpot/Figma.

### TTA toolbar

| Control | What it does |
| --- | --- |
| Columns… | Show/hide columns, **Edit…** a column's name and description, **+ Column…** to add a column, **Reset** to restore the HEI columns (other columns stay) |
| Filter | Reserved (not yet wired) |
| Export CSV | Download `hta-tta.csv` for Excel / SmartArt |
| Add row | Extra HEI row for the selected task |

### TTA columns

The columns belong to the analysis and are saved in `meta.columns` (see [design principles 1.7](https://github.com/larswpettersson/hfa-ds/blob/main/docs/design-principles.md) in hfa-ds).

- **Click a column header** (or press Enter on a focused header) to edit its name and **description**. The description says what the column means and how to fill it in; it shows as the header's tooltip and will be used by the AI support.
- **Columns… → + Column…** adds a column. Its id is made from the name (e.g. *Control and feedback* → `controlAndFeedback`), and each TTA row stores its value under that id.
- **All columns are equal.** A new analysis, or a file without `meta.columns`, starts with the HEI columns (External Error Mode, Recovery, Consequence, Human Error Type, PSFs, Comments), but any of them can be renamed or deleted (with its values). Only **Task Step**, the link to the HTA task, is always there. **Reset** restores the HEI columns and keeps the others.
- A column has a `type`: `text`, `list` (comma-separated, stored as an array) or `select` (with `options`). The HEI columns have a default description, which a renamed HEI column does not keep.
- **✕ at the end of a row** deletes that TTA row. A task's last row is cleared instead, since every task keeps at least one row. There is no question: Ctrl/⌘+Z undoes it.
- Every change can be undone (Ctrl/⌘+Z) and is included in **Save**.

### Keyboard

| Keys | Action |
| --- | --- |
| **Space** + drag | Pan the HTA canvas (hand tool) |
| **⌘Z** / **Ctrl+Z** | Undo |
| **⌘⇧Z** / **Ctrl+Shift+Z** (or **Ctrl+Y**) | Redo |
| **← ↑ → ↓** | Move the indication (hovered shadow) to the nearest task in that direction on the screen. Arrows never select or move |
| **Ctrl/⌘ + Enter** | Select the indicated task |
| **Enter** / **F2** | Edit the indicated task's text |
| **Alt/Option + ↑** | Selected task: outdent (move up a level) |
| **Alt/Option + ↓** | Selected task: indent under the previous sibling (move down a level) |
| **Alt/Option + ←** / **→** | Selected task: move earlier / later among siblings |
| **C** / **S** / **D** | Child / Sibling / Duplicate |
| **A** | Open / close the AI analysis panel |
| **Delete** / **Backspace** | Delete selected task (not root) |
| **Enter** | Start / apply description edit |
| **Esc** | Cancel edit, or clear selection / close column picker |

Hover a task for keyboard focus without selecting; click to select.

### Export CSV (Excel / SmartArt)

TTA **Export CSV** writes UTF-8 CSV (BOM) with columns:

`Depth`, `ID`, `Title`, `Outline`, then HEI fields (External Error Mode, Recovery, Consequence, Human Error Type, PSFs, Comments).

**Outline** is tab-indented with the full hierarchical ID written out, e.g.:

```
1 Operate Train
	1.1 Set Speed
	1.2 Apply Brake
```

Open in Excel, or copy the **Outline** column into Word/PowerPoint as a multilevel list and convert to SmartArt.

### JSON schema (Open… / Save)

Version **2** includes `ttaRecords` and column meta:

```json
{
  "version": 2,
  "meta": {
    "theme": "light",
    "columns": [
      { "id": "taskStep", "label": "Task Step", "visible": true, "order": 0,
        "description": "The HTA task this row analyses (id and title)." },
      { "id": "controlAndFeedback", "label": "Control and feedback", "visible": true, "order": 7,
        "type": "text", "description": "Control actions and feedback for the task." }
    ]
  },
  "root": {
    "id": "1",
    "title": "Root Task",
    "level": 0,
    "children": [
      { "id": "1.1", "title": "Child", "level": 1, "children": [] }
    ]
  },
  "ttaRecords": [
    {
      "id": "r1",
      "taskId": "1.1",
      "externalErrorMode": "",
      "recovery": "",
      "consequence": "",
      "humanErrorType": "",
      "psf": [],
      "comments": "",
      "controlAndFeedback": ""
    }
  ]
}
```

### Smoke test

```bash
python3 scripts/hta-smoke-test.py
```

---

## HTA Editor (`hta-editor2.html`) — text-panel reference

Earlier state-driven editor (Bowtie-style text panel): [`hta-editor2.html`](hta-editor2.html) + [`scripts/hta-editor-app.js`](scripts/hta-editor-app.js). Tree is source of truth; text panel is a synced authoring view.

- Tab-indented text input; auto-commit after idle
- Undo/Redo (Ctrl/Cmd+Z / Y); Shift+Arrow line selection
- JSON Export/Import (version 1 schema, no TTA)
- Smoke: `python3 scripts/hta-editor-smoke-test.py`

Legacy: [`hta-editor.html`](hta-editor.html). Design file: `HTA.penpot`.

### Example text format (editor2)

```
Root Task
	Subtask 1
		Sub-subtask 1.1
		Sub-subtask 1.2
	Subtask 2
```

## License

[MIT](LICENSE) © 2026 Lars Pettersson
