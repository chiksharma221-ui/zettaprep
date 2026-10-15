"use client";

import { useEffect, useRef } from "react";
import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { Loader2 } from "lucide-react";
import { LANGUAGES, type LanguageKey } from "@/lib/languages";

export type EditorTheme = "studio-dark" | "studio-light";

interface Props {
  value: string;
  language: LanguageKey;
  theme: EditorTheme;
  onChange: (code: string, cursorLine: number | null) => void;
  probeLine: number | null;
  probeText: string | null;
  readOnly?: boolean;
}

const defineThemes: BeforeMount = (monaco) => {
  monaco.editor.defineTheme("studio-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "5f6780", fontStyle: "italic" },
      { token: "keyword", foreground: "c6f432" },
      { token: "number", foreground: "ffb86b" },
      { token: "string", foreground: "38d6c4" },
      { token: "type", foreground: "8b7cff" },
    ],
    colors: {
      "editor.background": "#0c0e14",
      "editor.foreground": "#dfe3ec",
      "editorLineNumber.foreground": "#3a4154",
      "editorLineNumber.activeForeground": "#c6f432",
      "editor.lineHighlightBackground": "#141824",
      "editor.selectionBackground": "#2b3550",
      "editorCursor.foreground": "#c6f432",
      "editorIndentGuide.background1": "#1a1f2c",
      "editorWidget.background": "#11141c",
      "editorGutter.background": "#0c0e14",
    },
  });
  monaco.editor.defineTheme("studio-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "8a91a3", fontStyle: "italic" },
      { token: "keyword", foreground: "4f6b00" },
      { token: "string", foreground: "0f7d72" },
      { token: "type", foreground: "5a48d6" },
    ],
    colors: {
      "editor.background": "#fbfbf8",
      "editor.lineHighlightBackground": "#f1f2ec",
      "editorLineNumber.activeForeground": "#4f6b00",
      "editorCursor.foreground": "#4f6b00",
    },
  });
};

/**
 * Monaco editor wired for the interview: custom themes, cursor-line reporting, and a gutter +
 * line highlight for the line the Cross-Examiner is probing.
 */
export function CodeEditor({ value, language, theme, onChange, probeLine, probeText, readOnly }: Props) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const decorations = useRef<editor.IEditorDecorationsCollection | null>(null);

  const onMount: OnMount = (ed) => {
    editorRef.current = ed;
    decorations.current = ed.createDecorationsCollection();
    ed.focus();
  };

  useEffect(() => {
    const ed = editorRef.current;
    const deco = decorations.current;
    if (!ed || !deco) return;
    const model = ed.getModel();
    if (!probeLine || !model || probeLine > model.getLineCount()) {
      deco.clear();
      return;
    }
    deco.set([
      {
        range: { startLineNumber: probeLine, startColumn: 1, endLineNumber: probeLine, endColumn: 1 },
        options: {
          isWholeLine: true,
          className: "probe-line",
          glyphMarginClassName: "probe-glyph",
          hoverMessage: probeText ? { value: `**Cross-exam:** ${probeText}` } : undefined,
          overviewRuler: { color: "#ff6b3d", position: 4 },
        },
      },
    ]);
    ed.revealLineInCenterIfOutsideViewport(probeLine);
    // Fade the highlight after the probe has been discussed.
    const t = setTimeout(() => deco.clear(), 45_000);
    return () => clearTimeout(t);
  }, [probeLine, probeText]);

  return (
    <Editor
      height="100%"
      language={LANGUAGES[language].monaco}
      value={value}
      theme={theme}
      beforeMount={defineThemes}
      onMount={onMount}
      loading={<Loader2 className="h-5 w-5 animate-spin text-ink-400" />}
      onChange={(v) => onChange(v ?? "", editorRef.current?.getPosition()?.lineNumber ?? null)}
      options={{
        readOnly,
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        fontSize: 14,
        fontLigatures: true,
        lineHeight: 22,
        minimap: { enabled: false },
        glyphMargin: true,
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorSmoothCaretAnimation: "on",
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: "all",
        tabSize: 4,
        automaticLayout: true,
        bracketPairColorization: { enabled: true },
        // No AI autocompletion in an interview — only basic word suggestions.
        quickSuggestions: false,
        suggestOnTriggerCharacters: false,
        wordBasedSuggestions: "currentDocument",
      }}
    />
  );
}
