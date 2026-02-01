import * as vscode from "vscode";
import { javaFileCache } from "./analysis/javaCache";
import { analyzeConcurrencyWarnings } from "./analysis/concurrency";
import { buildMethodCallGraph } from "./analysis/methodGraph";
import { buildLifecycleTimeline } from "./analysis/lifecycle";
import { AospDefinitionProvider } from "./analysis/definitionProvider";
import { JavaStructureTreeProvider } from "./views/javaStructureView";
import { MethodGraphTreeProvider } from "./views/methodGraphView";
import { SystemServiceTreeProvider } from "./views/systemServiceView";
import { LifecycleTreeProvider } from "./views/lifecycleView";

let debounceTimer: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const structureProvider = new JavaStructureTreeProvider(context);
  const callGraphProvider = new MethodGraphTreeProvider();
  const systemServiceProvider = new SystemServiceTreeProvider();
  const lifecycleProvider = new LifecycleTreeProvider();

  vscode.window.registerTreeDataProvider("aospJavaStructure", structureProvider);
  vscode.window.registerTreeDataProvider("aospMethodGraph", callGraphProvider);
  vscode.window.registerTreeDataProvider("aospSystemServices", systemServiceProvider);
  vscode.window.registerTreeDataProvider("aospLifecycle", lifecycleProvider);

  const diagnostics = vscode.languages.createDiagnosticCollection("aospConcurrency");
  context.subscriptions.push(diagnostics);

  const updateStructureFromDocument = async (document: vscode.TextDocument | undefined) => {
    const targetDoc =
      document && document.languageId === "java"
        ? document
        : vscode.window.activeTextEditor?.document?.languageId === "java"
          ? vscode.window.activeTextEditor.document
          : undefined;

    if (!targetDoc) {
      structureProvider.update(undefined);
      return;
    }

    const analysis = await javaFileCache.getAnalysis(targetDoc);
    if (!analysis) {
      return;
    }
    structureProvider.update(analysis.summary);

    const warnings = analyzeConcurrencyWarnings(targetDoc);
    diagnostics.set(
      targetDoc.uri,
      warnings.map((warning) =>
        new vscode.Diagnostic(warning.range, warning.message, vscode.DiagnosticSeverity.Warning)
      )
    );
  };

  const scheduleUpdate = (document: vscode.TextDocument | undefined) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      void updateStructureFromDocument(document);
    }, 200);
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => scheduleUpdate(doc)),
    vscode.window.onDidChangeActiveTextEditor((editor) => scheduleUpdate(editor?.document)),
    vscode.commands.registerCommand("aosp.refreshStructure", () => scheduleUpdate(vscode.window.activeTextEditor?.document)),
    vscode.commands.registerCommand("aosp.revealLine", (line: number) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const position = new vscode.Position(Math.max(0, line - 1), 0);
      const range = new vscode.Range(position, position);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }),
    vscode.commands.registerCommand("aosp.openFileAtLine", async (filePath: string, line: number) => {
      const doc = await vscode.workspace.openTextDocument(filePath);
      const editor = await vscode.window.showTextDocument(doc, { preview: true });
      const position = new vscode.Position(Math.max(0, line - 1), 0);
      const range = new vscode.Range(position, position);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }),
    vscode.commands.registerCommand("aosp.showMethodCallGraph", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "java") {
        return;
      }
      const graph = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: "Analyzing method call graph" },
        (progress, token) => {
          progress.report({ increment: 0 });
          return buildMethodCallGraph(editor, token);
        }
      );
      callGraphProvider.update(graph ?? undefined);
    }),
    vscode.commands.registerCommand("aosp.showSystemServices", async () => {
      const summaries: Array<{ serviceClass: string; onStartLine?: number; onBootPhases: number[]; binderServices: { name: string; line: number }[] }> = [];
      const files = await vscode.workspace.findFiles("**/*.java", "**/{out,build,.gradle,node_modules}/**");
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: "Scanning SystemService classes" },
        async (progress, token) => {
          const increment = files.length ? 100 / files.length : 100;
          for (const uri of files) {
            if (token.isCancellationRequested) {
              return;
            }
            const analysis = await javaFileCache.getAnalysisForUri(uri, token);
            if (analysis?.systemService) {
              summaries.push(analysis.systemService);
            }
            progress.report({ increment });
          }
        }
      );
      systemServiceProvider.update(summaries);
    }),
    vscode.commands.registerCommand("aosp.showLifecycle", async () => {
      const timelines = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: "Building framework timeline" },
        (progress, token) => {
          progress.report({ increment: 0 });
          return buildLifecycleTimeline(token);
        }
      );
      lifecycleProvider.update(timelines);
    })
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider("java", {
      provideHover(document, position) {
        const warnings = analyzeConcurrencyWarnings(document);
        const warning = warnings.find((item) => item.range.contains(position));
        if (!warning) {
          return undefined;
        }
        return new vscode.Hover(warning.message);
      }
    })
  );

  context.subscriptions.push(vscode.languages.registerDefinitionProvider("java", new AospDefinitionProvider()));

  if (vscode.window.activeTextEditor) {
    scheduleUpdate(vscode.window.activeTextEditor.document);
  }
}

export function deactivate(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
}
