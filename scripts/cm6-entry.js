/**
 * Obsidian QuickView - CodeMirror 6 editor bundle.
 *
 * Goals:
 * - True selection-aware Live Preview (Markdown syntax is hidden away from the
 *   active line and revealed when the caret enters it).
 * - Viewport-only decoration work; no full-document regex pass per keypress.
 * - Incremental Lezer parsing via @codemirror/lang-markdown.
 * - Fresh EditorState when loading another note so undo history never retains
 *   previous note bodies.
 */
import { EditorView, basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { Decoration, ViewPlugin, WidgetType, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";

const headingLineDecorations = [
  null,
  Decoration.line({ class: "cm-line-h1" }),
  Decoration.line({ class: "cm-line-h2" }),
  Decoration.line({ class: "cm-line-h3" }),
  Decoration.line({ class: "cm-line-h4" }),
  Decoration.line({ class: "cm-line-h5" }),
  Decoration.line({ class: "cm-line-h6" })
];
const lineDecoCodeBlock = Decoration.line({ class: "cm-line-codeblock" });
const lineDecoCodeFence = Decoration.line({ class: "cm-line-codeblock cm-line-codeblock-fence" });
const lineDecoList = Decoration.line({ class: "cm-line-list" });
const lineDecoTaskChecked = Decoration.line({ class: "cm-line-list cm-line-task cm-line-task-checked" });
const lineDecoTaskUnchecked = Decoration.line({ class: "cm-line-list cm-line-task cm-line-task-unchecked" });
const lineDecoBlockquote = Decoration.line({ class: "cm-line-blockquote" });
const lineDecoTable = Decoration.line({ class: "cm-line-table" });
const lineDecoHr = Decoration.line({ class: "cm-line-hr" });
const lineDecoFrontmatter = Decoration.line({ class: "cm-line-frontmatter" });

const markDecoBold = Decoration.mark({ class: "cm-bold" });
const markDecoItalic = Decoration.mark({ class: "cm-italic" });
const markDecoBoldItalic = Decoration.mark({ class: "cm-bold cm-italic" });
const markDecoInlineCode = Decoration.mark({ class: "cm-inline-code" });
const markDecoStrikethrough = Decoration.mark({ class: "cm-strikethrough" });
const markDecoWikilink = Decoration.mark({ class: "cm-wikilink" });
const markDecoTag = Decoration.mark({ class: "cm-tag-pill" });
const markDecoBullet = Decoration.mark({ class: "cm-list-bullet" });
const syntaxHide = Decoration.replace({});

function encodeVaultPath(path) {
  return String(path || "")
    .split("/")
    .map(part => encodeURIComponent(part))
    .join("/");
}

function resolveImageSource(src, notePath) {
  src = String(src || "").trim();
  if (/^(?:https?:|data:|blob:|\/)/i.test(src)) return src;
  if (src.startsWith("file:")) return src;

  // Obsidian embeds are resolved by the backend /vault route. Standard relative
  // Markdown images are resolved relative to the current note folder.
  const slash = notePath ? notePath.lastIndexOf("/") : -1;
  const folder = slash >= 0 ? notePath.slice(0, slash + 1) : "";
  const joined = src.startsWith("./") ? folder + src.slice(2) : (src.startsWith("../") ? src : folder + src);
  return `/vault/${encodeVaultPath(joined)}`;
}

class ImagePreviewWidget extends WidgetType {
  constructor(src, alt = "", width = "", notePath = "") {
    super();
    this.src = src;
    this.alt = alt;
    this.width = width;
    this.notePath = notePath;
  }
  eq(other) {
    return other.src === this.src && other.alt === this.alt && other.width === this.width && other.notePath === this.notePath;
  }
  toDOM() {
    const wrap = document.createElement("span");
    wrap.className = "cm-live-image-wrap";
    const img = document.createElement("img");
    img.className = "cm-live-image";
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = this.alt || this.src;
    img.src = resolveImageSource(this.src, this.notePath);
    if (this.width && /^\d{1,4}$/.test(this.width)) img.style.maxWidth = `${this.width}px`;
    wrap.appendChild(img);
    return wrap;
  }
  ignoreEvent() { return false; }
}

class TaskCheckboxWidget extends WidgetType {
  constructor(checked, from, to) {
    super();
    this.checked = checked;
    this.from = from;
    this.to = to;
  }
  eq(other) {
    return other.checked === this.checked && other.from === this.from && other.to === this.to;
  }
  toDOM(view) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "cm-live-task-checkbox";
    input.checked = this.checked;
    input.setAttribute("aria-label", this.checked ? "Mark task incomplete" : "Mark task complete");
    input.addEventListener("change", () => {
      view.dispatch({
        changes: {
          from: this.from,
          to: this.to,
          insert: input.checked ? "[x]" : "[ ]"
        }
      });
    });
    return input;
  }
  ignoreEvent() { return true; }
}

class HorizontalRuleWidget extends WidgetType {
  toDOM() {
    const hr = document.createElement("hr");
    hr.className = "cm-live-hr";
    return hr;
  }
}

function getActiveLines(view) {
  const lines = new Set();
  const doc = view.state.doc;
  for (const range of view.state.selection.ranges) {
    const a = doc.lineAt(range.from).number;
    const b = doc.lineAt(range.to).number;
    for (let n = a; n <= b; n++) lines.add(n);
  }
  return lines;
}

function intersects(aFrom, aTo, bFrom, bTo) {
  return aFrom < bTo && aTo > bFrom;
}

function createLivePreviewPlugin(notePath = "") {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = this.build(view);
    }
    update(update) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = this.build(update.view);
      }
    }
    build(view) {
      const doc = view.state.doc;
      const activeLines = getActiveLines(view);
      const ranges = [];
      const codeRanges = [];
      const seenLines = new Set();
      const tree = syntaxTree(view.state);
      let frontmatterEndLine = 0;
      if (doc.lines >= 2 && doc.line(1).text.trim() === "---") {
        const maxFrontmatterLines = Math.min(doc.lines, 200);
        for (let n = 2; n <= maxFrontmatterLines; n++) {
          if (doc.line(n).text.trim() === "---") {
            frontmatterEndLine = n;
            break;
          }
        }
      }

      // Only inspect syntax nodes that overlap the visible viewport. Lezer reuses
      // unchanged subtrees incrementally, so this remains cheap on large notes.
      for (const visible of view.visibleRanges) {
        try {
          tree.iterate({
            from: visible.from,
            to: visible.to,
            enter(node) {
              if (node.name === "FencedCode") {
                codeRanges.push({ from: node.from, to: node.to });
              }
            }
          });
        } catch (_) {}
      }

      const isInFencedCode = (from, to) => codeRanges.some(r => intersects(from, to, r.from, r.to));
      const add = (from, to, deco) => {
        if (from <= to) ranges.push(deco.range(from, to));
      };
      const hide = (from, to) => {
        if (from < to) add(from, to, syntaxHide);
      };

      for (const visible of view.visibleRanges) {
        const first = doc.lineAt(visible.from).number;
        const last = doc.lineAt(visible.to).number;

        for (let lineNo = first; lineNo <= last; lineNo++) {
          if (seenLines.has(lineNo)) continue;
          seenLines.add(lineNo);

          const line = doc.line(lineNo);
          const text = line.text;
          const trimmed = text.trim();
          const lineFrom = line.from;
          const active = activeLines.has(lineNo);
          const inFence = isInFencedCode(line.from, Math.max(line.from + 1, line.to));

          if (frontmatterEndLine && lineNo <= frontmatterEndLine) {
            add(line.from, line.from, lineDecoFrontmatter);
            if (!active && (lineNo === 1 || lineNo === frontmatterEndLine)) hide(line.from, line.to);
            continue;
          }

          if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
            add(line.from, line.from, lineDecoCodeFence);
            continue;
          }
          if (inFence) {
            add(line.from, line.from, lineDecoCodeBlock);
            continue;
          }

          const heading = text.match(/^(#{1,6})(\s+)/);
          if (heading) {
            add(line.from, line.from, headingLineDecorations[heading[1].length]);
            if (!active) hide(lineFrom, lineFrom + heading[0].length);
          } else if (/^\s*[-*+]\s+\[[xX]\]\s/.test(text)) {
            add(line.from, line.from, lineDecoTaskChecked);
          } else if (/^\s*[-*+]\s+\[\s\]\s/.test(text)) {
            add(line.from, line.from, lineDecoTaskUnchecked);
          } else if (/^\s*[-*+]\s/.test(text) || /^\s*\d+\.\s/.test(text)) {
            add(line.from, line.from, lineDecoList);
          } else if (/^\s*>\s?/.test(text)) {
            add(line.from, line.from, lineDecoBlockquote);
            if (!active) {
              const q = text.match(/^(\s*>\s?)/);
              if (q) hide(lineFrom, lineFrom + q[0].length);
            }
          } else if (/^\|(.+)\|$/.test(trimmed)) {
            add(line.from, line.from, lineDecoTable);
          } else if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
            add(line.from, line.from, lineDecoHr);
            if (!active) {
              add(line.from, line.to, Decoration.replace({ widget: new HorizontalRuleWidget(), block: false }));
              continue;
            }
          }

          // Render Obsidian image embeds as a lightweight widget when the line is
          // not active. Syntax reappears immediately when the caret enters it.
          const widgetSpans = [];
          if (!active) {
            const obsImage = text.match(/!\[\[([^\]|]+\.(?:png|jpe?g|gif|svg|webp|bmp))(?:\|(\d{1,4}))?\]\]/i);
            if (obsImage) {
              const from = lineFrom + obsImage.index;
              const to = from + obsImage[0].length;
              add(from, to, Decoration.replace({
                widget: new ImagePreviewWidget(obsImage[1].trim(), obsImage[1].trim(), obsImage[2] || "", notePath)
              }));
              widgetSpans.push({ from, to });
            }

            const mdImage = text.match(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/);
            if (mdImage) {
              const from = lineFrom + mdImage.index;
              const to = from + mdImage[0].length;
              add(from, to, Decoration.replace({
                widget: new ImagePreviewWidget(mdImage[2], mdImage[1], "", notePath)
              }));
              widgetSpans.push({ from, to });
            }
          }

          const touches = (f, t) => view.state.selection.ranges.some(range => range.from <= t && range.to >= f);

          // Protect inline code from other regex decorations.
          const protectedSpans = [];
          let m;
          const codeRegex = /(`+)([^\n]*?)(\1)/g;
          while ((m = codeRegex.exec(text)) !== null) {
            const from = lineFrom + m.index;
            const to = from + m[0].length;
            protectedSpans.push({ from, to });
            const markerLen = m[1].length;
            if (to - from > markerLen * 2) add(from + markerLen, to - markerLen, markDecoInlineCode);
            if (!touches(from, to)) {
              hide(from, from + markerLen);
              hide(to - markerLen, to);
            }
          }
          const protectedByCode = (from, to) =>
            protectedSpans.some(r => intersects(from, to, r.from, r.to)) ||
            widgetSpans.some(r => intersects(from, to, r.from, r.to));

          // Interactive task checkbox; keep the list bullet itself for stable indent.
          const task = text.match(/^(\s*[-*+]\s+)(\[[ xX]\])/);
          if (task) {
            const from = lineFrom + task[1].length;
            const to = from + task[2].length;
            if (!touches(from, to)) {
              add(from, to, Decoration.replace({
                widget: new TaskCheckboxWidget(/[xX]/.test(task[2]), from, to)
              }));
            }
          } else {
            const bullet = text.match(/^(\s*)([-*+]\s|\d+\.\s)/);
            if (bullet) {
              const from = lineFrom + bullet[1].length;
              add(from, from + bullet[2].length, markDecoBullet);
            }
          }

          const addPaired = (regex, markerLen, deco) => {
            regex.lastIndex = 0;
            while ((m = regex.exec(text)) !== null) {
              const from = lineFrom + m.index;
              const to = from + m[0].length;
              if (protectedByCode(from, to) || to - from <= markerLen * 2) continue;
              protectedSpans.push({ from, to });
              add(from + markerLen, to - markerLen, deco);
              if (!touches(from, to)) {
                hide(from, from + markerLen);
                hide(to - markerLen, to);
              }
            }
          };

          addPaired(/\*\*\*([^*\n]+?)\*\*\*|___([^_\\n]+?)___/g, 3, markDecoBoldItalic);
          addPaired(/\*\*([^*\n]+?)\*\*|__([^_\n]+?)__/g, 2, markDecoBold);
          addPaired(/~~([^~\n]+?)~~/g, 2, markDecoStrikethrough);
          addPaired(/(?<!\*)\*([^*\n]+?)\*(?!\*)|(?<!_)_([^_\n]+?)_(?!_)/g, 1, markDecoItalic);

          // Wikilinks. For aliases, hide [[target| and ]] so only alias is shown.
          const wikiRegex = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;
          while ((m = wikiRegex.exec(text)) !== null) {
            const from = lineFrom + m.index;
            const to = from + m[0].length;
            if (protectedByCode(from, to)) continue;
            protectedSpans.push({ from, to });
            const alias = m[2];
            const visibleStart = alias
              ? from + m[0].indexOf("|") + 1
              : from + 2;
            const visibleEnd = to - 2;
            if (visibleStart < visibleEnd) add(visibleStart, visibleEnd, markDecoWikilink);
            if (!touches(from, to)) {
              hide(from, visibleStart);
              hide(visibleEnd, to);
            }
          }

          // Standard Markdown links: [label](url) -> label when inactive.
          const linkRegex = /(?<!!)\[([^\]\n]+)\]\(([^)\n]+)\)/g;
          while ((m = linkRegex.exec(text)) !== null) {
            const from = lineFrom + m.index;
            const to = from + m[0].length;
            if (protectedByCode(from, to)) continue;
            protectedSpans.push({ from, to });
            const labelFrom = from + 1;
            const labelTo = labelFrom + m[1].length;
            add(labelFrom, labelTo, markDecoWikilink);
            if (!touches(from, to)) {
              hide(from, labelFrom);
              hide(labelTo, to);
            }
          }

          const tagRegex = /(?:^|\s)(#(?=[^\s#]*[\p{L}_])[\p{L}\p{N}_\-/]+)/gu;
          while ((m = tagRegex.exec(text)) !== null) {
            const offset = m[0].indexOf("#");
            const from = lineFrom + m.index + offset;
            if (!protectedByCode(from, from + m[1].length)) add(from, from + m[1].length, markDecoTag);
          }
        }
      }

      return Decoration.set(ranges, true);
    }
  }, {
    decorations: value => value.decorations
  });
}

const darkTheme = EditorView.theme({
  "&": { height: "100%", color: "#dcddde", backgroundColor: "transparent" },
  ".cm-content": { caretColor: "#a855f7", padding: "0", lineHeight: "1.7" },
  "&.cm-focused .cm-cursor": { borderLeftColor: "#a855f7", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "rgba(168, 85, 247, 0.25) !important" },
  ".cm-gutters": { backgroundColor: "transparent", color: "#6b7280", border: "none", paddingRight: "10px" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#a855f7" },
  ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.02)" }
}, { dark: true });

const lightTheme = EditorView.theme({
  "&": { height: "100%", color: "#2b2a27", backgroundColor: "transparent" },
  ".cm-content": { caretColor: "#7c3aed", padding: "0", lineHeight: "1.7" },
  "&.cm-focused .cm-cursor": { borderLeftColor: "#7c3aed", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "rgba(124, 58, 237, 0.18) !important" },
  ".cm-gutters": { backgroundColor: "transparent", color: "#9ca3af", border: "none", paddingRight: "10px" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#7c3aed" },
  ".cm-activeLine": { backgroundColor: "rgba(0, 0, 0, 0.02)" }
}, { dark: false });

function createEditor(parent, options = {}) {
  let currentTheme = options.theme === "light" ? "light" : "dark";
  let currentLivePreview = options.livePreview !== false;
  const notePath = options.notePath || "";
  const onSave = options.onSave || (() => {});
  const onCancel = options.onCancel || (() => {});
  const onChange = options.onChange || (() => {});

  const themeCompartment = new Compartment();
  const livePreviewCompartment = new Compartment();
  const editorClassCompartment = new Compartment();

  const customKeymap = keymap.of([
    indentWithTab,
    { key: "Mod-s", run: () => { onSave(); return true; } },
    { key: "Escape", run: () => { onCancel(); return true; } }
  ]);

  const updateListener = EditorView.updateListener.of(update => {
    if (update.docChanged) {
      onChange({
        length: update.state.doc.length,
        lines: update.state.doc.lines,
        changes: update.changes
      });
    }
  });

  function getEditorAttrs(isLive) {
    return EditorView.editorAttributes.of({ class: isLive ? "cm-live-mode" : "cm-source-mode" });
  }

  function buildState(text) {
    return EditorState.create({
      doc: text || "",
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        customKeymap,
        updateListener,
        editorClassCompartment.of(getEditorAttrs(currentLivePreview)),
        themeCompartment.of(currentTheme === "light" ? lightTheme : darkTheme),
        livePreviewCompartment.of(currentLivePreview ? [createLivePreviewPlugin(notePath)] : [])
      ]
    });
  }

  const view = new EditorView({ state: buildState(options.doc || ""), parent });

  return {
    view,
    getValue() { return view.state.doc.toString(); },
    getStats() { return { lines: view.state.doc.lines, length: view.state.doc.length }; },
    getHeadings() {
      const headings = [];
      const doc = view.state.doc;
      try {
        syntaxTree(view.state).iterate({
          enter(node) {
            const match = /^ATXHeading([1-6])$/.exec(node.name);
            if (!match) return;
            const line = doc.lineAt(node.from);
            const text = line.text.replace(/^#{1,6}\s+/, "").trim();
            if (text) headings.push({
              level: Number(match[1]),
              text,
              lineNumber: line.number,
              lineFrom: line.from
            });
          }
        });
      } catch (_) {
        // Parser may still be catching up on a very large paste. A line fallback
        // keeps the outline functional without affecting typing latency.
        for (let n = 1; n <= doc.lines; n++) {
          const line = doc.line(n);
          const m = line.text.match(/^(#{1,6})\s+(.+)$/);
          if (m) headings.push({ level: m[1].length, text: m[2].trim(), lineNumber: n, lineFrom: line.from });
        }
      }
      return headings;
    },
    setValue(text) {
      // setState intentionally creates a fresh history. A full-document dispatch
      // would keep the previous note body reachable from undo history and waste RAM.
      view.setState(buildState(text || ""));
    },
    setTheme(theme) {
      currentTheme = theme === "light" ? "light" : "dark";
      view.dispatch({ effects: themeCompartment.reconfigure(currentTheme === "light" ? lightTheme : darkTheme) });
    },
    setLivePreview(enabled) {
      currentLivePreview = !!enabled;
      view.dispatch({
        effects: [
          livePreviewCompartment.reconfigure(currentLivePreview ? [createLivePreviewPlugin(notePath)] : []),
          editorClassCompartment.reconfigure(getEditorAttrs(currentLivePreview))
        ]
      });
    },
    focus() { view.focus(); },
    scrollToLine(lineNumber) {
      if (lineNumber < 1 || lineNumber > view.state.doc.lines) return;
      const line = view.state.doc.line(lineNumber);
      view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
      view.focus();
    },
    destroy() { view.destroy(); }
  };
}

if (typeof window !== "undefined") {
  // Runtime Live Preview intentionally layers on top of the small prebuilt CM6
  // bundle. Keep these primitives exposed so a local rebuild remains compatible
  // with the shipped runtime without bundling a second CodeMirror copy.
  window.__OQCM6 = {
    EditorView, EditorState, Compartment, Decoration, ViewPlugin, WidgetType,
    syntaxTree, keymap, indentWithTab, basicSetup, markdown, darkTheme, lightTheme
  };
  window.ObsidianCM6 = { createEditor };
}
