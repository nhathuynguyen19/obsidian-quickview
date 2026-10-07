/**
 * Entry point for Obsidian QuickView CodeMirror 6 Bundle.
 * Provides a lightweight, high-performance Markdown editor with rich Live Preview styling.
 * Supports visual formatting for headings, bold, italic, lists, code blocks, tables, blockquotes, and wikilinks.
 */
import { EditorView, basicSetup } from "codemirror";
import { EditorState, Compartment, RangeSetBuilder } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { Decoration, ViewPlugin, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";

// Line decorations for Live Preview
const lineDecoH1 = Decoration.line({ class: "cm-line-h1" });
const lineDecoH2 = Decoration.line({ class: "cm-line-h2" });
const lineDecoH3 = Decoration.line({ class: "cm-line-h3" });
const lineDecoH4 = Decoration.line({ class: "cm-line-h4" });
const lineDecoH5 = Decoration.line({ class: "cm-line-h5" });
const lineDecoH6 = Decoration.line({ class: "cm-line-h6" });
const lineDecoCodeBlock = Decoration.line({ class: "cm-line-codeblock" });
const lineDecoCodeFence = Decoration.line({ class: "cm-line-codeblock cm-line-codeblock-fence" });
const lineDecoList = Decoration.line({ class: "cm-line-list" });
const lineDecoTaskChecked = Decoration.line({ class: "cm-line-list cm-line-task cm-line-task-checked" });
const lineDecoTaskUnchecked = Decoration.line({ class: "cm-line-list cm-line-task cm-line-task-unchecked" });
const lineDecoBlockquote = Decoration.line({ class: "cm-line-blockquote" });
const lineDecoTable = Decoration.line({ class: "cm-line-table" });
const lineDecoHr = Decoration.line({ class: "cm-line-hr" });

// Mark decorations for Live Preview
const markDecoBold = Decoration.mark({ class: "cm-bold" });
const markDecoItalic = Decoration.mark({ class: "cm-italic" });
const markDecoInlineCode = Decoration.mark({ class: "cm-inline-code" });
const markDecoStrikethrough = Decoration.mark({ class: "cm-strikethrough" });
const markDecoHeaderMark = Decoration.mark({ class: "cm-header-mark" });
const markDecoWikilink = Decoration.mark({ class: "cm-wikilink" });
const markDecoTag = Decoration.mark({ class: "cm-tag-pill" });
const markDecoBullet = Decoration.mark({ class: "cm-list-bullet" });
const markDecoTaskBox = Decoration.mark({ class: "cm-task-marker" });

/**
 * Line-level decorator ViewPlugin:
 * Adds rich visual classes to lines based on Markdown syntax.
 */
const markdownLinePlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = this.build(view);
  }
  update(update) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.build(update.view);
    }
  }
  build(view) {
    const builder = new RangeSetBuilder();
    const doc = view.state.doc;
    const tree = syntaxTree(view.state);

    // Collect fenced code blocks
    const codeRanges = [];
    try {
      tree.iterate({
        enter: (node) => {
          if (node.name === "FencedCode") {
            codeRanges.push({ from: node.from, to: node.to });
          }
        }
      });
    } catch (_) {}

    function isInsideCodeBlock(pos) {
      for (const r of codeRanges) {
        if (pos >= r.from && pos <= r.to) return true;
      }
      return false;
    }

    const seenLines = new Set();

    for (let { from, to } of view.visibleRanges) {
      const startLine = doc.lineAt(from).number;
      const endLine = doc.lineAt(to).number;

      for (let l = startLine; l <= endLine; l++) {
        if (seenLines.has(l)) continue;
        seenLines.add(l);

        const line = doc.line(l);
        const text = line.text;
        const trimmed = text.trim();

        // 1. Fenced Code Block
        if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
          builder.add(line.from, line.from, lineDecoCodeFence);
        } else if (isInsideCodeBlock(line.from)) {
          builder.add(line.from, line.from, lineDecoCodeBlock);
        }
        // 2. Headings
        else if (/^#\s/.test(text)) {
          builder.add(line.from, line.from, lineDecoH1);
        } else if (/^##\s/.test(text)) {
          builder.add(line.from, line.from, lineDecoH2);
        } else if (/^###\s/.test(text)) {
          builder.add(line.from, line.from, lineDecoH3);
        } else if (/^####\s/.test(text)) {
          builder.add(line.from, line.from, lineDecoH4);
        } else if (/^#####\s/.test(text)) {
          builder.add(line.from, line.from, lineDecoH5);
        } else if (/^######\s/.test(text)) {
          builder.add(line.from, line.from, lineDecoH6);
        }
        // 3. Task list
        else if (/^\s*[-*+]\s+\[[xX]\]\s/.test(text)) {
          builder.add(line.from, line.from, lineDecoTaskChecked);
        } else if (/^\s*[-*+]\s+\[\s\]\s/.test(text)) {
          builder.add(line.from, line.from, lineDecoTaskUnchecked);
        }
        // 4. Bullet & Numbered List
        else if (/^\s*[-*+]\s/.test(text) || /^\s*\d+\.\s/.test(text)) {
          builder.add(line.from, line.from, lineDecoList);
        }
        // 5. Blockquote
        else if (/^\s*>\s?/.test(text)) {
          builder.add(line.from, line.from, lineDecoBlockquote);
        }
        // 6. Table row
        else if (/^\|(.+)\|$/.test(trimmed)) {
          builder.add(line.from, line.from, lineDecoTable);
        }
        // 7. Horizontal rule
        else if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed) || /^___+$/.test(trimmed)) {
          builder.add(line.from, line.from, lineDecoHr);
        }
      }
    }

    return builder.finish();
  }
}, {
  decorations: v => v.decorations
});

/**
 * Inline-level decorator ViewPlugin:
 * Adds formatting spans to bold, italic, code pills, wikilinks, tags, and header markers.
 */
const markdownInlinePlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = this.build(view);
  }
  update(update) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.build(update.view);
    }
  }
  build(view) {
    const builder = new RangeSetBuilder();
    const doc = view.state.doc;
    const items = [];
    const seenLines = new Set();

    for (let { from, to } of view.visibleRanges) {
      const startLine = doc.lineAt(from).number;
      const endLine = doc.lineAt(to).number;

      for (let l = startLine; l <= endLine; l++) {
        if (seenLines.has(l)) continue;
        seenLines.add(l);

        const line = doc.line(l);
        const text = line.text;
        const lineFrom = line.from;

        // Header mark (#, ##, ...)
        const headerMatch = text.match(/^(#{1,6})\s/);
        if (headerMatch) {
          items.push({ from: lineFrom, to: lineFrom + headerMatch[1].length, deco: markDecoHeaderMark });
        }

        // List bullet or task box mark
        const taskMatch = text.match(/^(\s*[-*+]\s+)(\[[ xX]\])/);
        if (taskMatch) {
          const markerStart = lineFrom + taskMatch[1].length;
          items.push({ from: markerStart, to: markerStart + taskMatch[2].length, deco: markDecoTaskBox });
        } else {
          const listMatch = text.match(/^(\s*)([-*+]\s|\d+\.\s)/);
          if (listMatch) {
            const bStart = lineFrom + listMatch[1].length;
            items.push({ from: bStart, to: bStart + listMatch[2].length, deco: markDecoBullet });
          }
        }

        // Bold: **text** or __text__
        const boldRegex = /\*\*([^\*\n]+?)\*\*|__([^_\n]+?)__/g;
        let m;
        while ((m = boldRegex.exec(text)) !== null) {
          items.push({ from: lineFrom + m.index, to: lineFrom + m.index + m[0].length, deco: markDecoBold });
        }

        // Italic: *text* (excluding **) or _text_ (excluding __)
        const italicRegex = /(?<!\*)\*([^*\n]+?)\*(?!\*)|(?<!_)_([^_\n]+?)_(?!_)/g;
        while ((m = italicRegex.exec(text)) !== null) {
          items.push({ from: lineFrom + m.index, to: lineFrom + m.index + m[0].length, deco: markDecoItalic });
        }

        // Inline Code: `code`
        const codeRegex = /`([^`\n]+?)`/g;
        while ((m = codeRegex.exec(text)) !== null) {
          items.push({ from: lineFrom + m.index, to: lineFrom + m.index + m[0].length, deco: markDecoInlineCode });
        }

        // Strikethrough: ~~text~~
        const strikeRegex = /~~([^~\n]+?)~~/g;
        while ((m = strikeRegex.exec(text)) !== null) {
          items.push({ from: lineFrom + m.index, to: lineFrom + m.index + m[0].length, deco: markDecoStrikethrough });
        }

        // Wikilinks: [[Target]] or [[Target|Alias]]
        const wikiRegex = /\[\[([^\]\n]+?)\]\]/g;
        while ((m = wikiRegex.exec(text)) !== null) {
          items.push({ from: lineFrom + m.index, to: lineFrom + m.index + m[0].length, deco: markDecoWikilink });
        }

        // Tags: #tag
        const tagRegex = /(?:^|\s)(#[a-zA-Z0-9_\-\/]+)/g;
        while ((m = tagRegex.exec(text)) !== null) {
          const startOffset = m[0].indexOf('#');
          items.push({ from: lineFrom + m.index + startOffset, to: lineFrom + m.index + m[0].length, deco: markDecoTag });
        }
      }
    }

    // Sort items strictly by from, then by to
    items.sort((a, b) => a.from - b.from || a.to - b.to);

    // Add without overlapping ranges
    let lastTo = -1;
    for (const item of items) {
      if (item.from >= lastTo && item.from < item.to) {
        builder.add(item.from, item.to, item.deco);
        lastTo = item.to;
      }
    }

    return builder.finish();
  }
}, {
  decorations: v => v.decorations
});

const livePreviewExtensions = [
  markdownLinePlugin,
  markdownInlinePlugin
];

// Paper-styled themes for Light and Dark modes
const darkTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "#dcddde",
    backgroundColor: "transparent"
  },
  ".cm-content": {
    caretColor: "#a855f7",
    padding: "0",
    lineHeight: "1.7"
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "#a855f7",
    borderLeftWidth: "2px"
  },
  "&.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(168, 85, 247, 0.25) !important"
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "#6b7280",
    border: "none",
    paddingRight: "10px"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "#a855f7"
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(255, 255, 255, 0.02)"
  }
}, { dark: true });

const lightTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "#2b2a27",
    backgroundColor: "transparent"
  },
  ".cm-content": {
    caretColor: "#7c3aed",
    padding: "0",
    lineHeight: "1.7"
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "#7c3aed",
    borderLeftWidth: "2px"
  },
  "&.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(124, 58, 237, 0.18) !important"
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "#9ca3af",
    border: "none",
    paddingRight: "10px"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "#7c3aed"
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(0, 0, 0, 0.02)"
  }
}, { dark: false });

/**
 * Creates and mounts a CodeMirror 6 editor instance.
 */
function createEditor(parent, options = {}) {
  const initialText = options.doc || "";
  const isDark = options.theme === "dark";
  const initialLivePreview = options.livePreview !== false;
  const onSave = options.onSave || (() => {});
  const onCancel = options.onCancel || (() => {});
  const onChange = options.onChange || (() => {});

  // Instance-specific compartments to prevent cross-instance leaks
  const themeCompartment = new Compartment();
  const livePreviewCompartment = new Compartment();
  const editorClassCompartment = new Compartment();

  const customKeymap = keymap.of([
    indentWithTab,
    {
      key: "Mod-s",
      run: () => {
        onSave();
        return true;
      }
    },
    {
      key: "Escape",
      run: () => {
        onCancel();
        return true;
      }
    }
  ]);

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      onChange(update.state.doc.toString());
    }
  });

  function getEditorAttrs(isLive) {
    return EditorView.editorAttributes.of({
      class: isLive ? "cm-live-mode" : "cm-source-mode"
    });
  }

  const state = EditorState.create({
    doc: initialText,
    extensions: [
      basicSetup,
      markdown(),
      EditorView.lineWrapping,
      customKeymap,
      updateListener,
      editorClassCompartment.of(getEditorAttrs(initialLivePreview)),
      themeCompartment.of(isDark ? darkTheme : lightTheme),
      livePreviewCompartment.of(initialLivePreview ? livePreviewExtensions : [])
    ]
  });

  const view = new EditorView({
    state,
    parent
  });

  return {
    view,
    getValue() {
      return view.state.doc.toString();
    },
    setValue(text) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text }
      });
    },
    setTheme(theme) {
      view.dispatch({
        effects: themeCompartment.reconfigure(theme === "light" ? lightTheme : darkTheme)
      });
    },
    setLivePreview(enabled) {
      view.dispatch({
        effects: [
          livePreviewCompartment.reconfigure(enabled ? livePreviewExtensions : []),
          editorClassCompartment.reconfigure(getEditorAttrs(enabled))
        ]
      });
    },
    focus() {
      view.focus();
    },
    scrollToLine(lineNumber) {
      if (lineNumber < 1 || lineNumber > view.state.doc.lines) return;
      const line = view.state.doc.line(lineNumber);
      view.dispatch({
        selection: { anchor: line.from },
        scrollIntoView: true
      });
      view.focus();
    },
    destroy() {
      view.destroy();
    }
  };
}

if (typeof window !== "undefined") {
  window.ObsidianCM6 = {
    createEditor
  };
}
