import * as path from "path";
import * as vscode from "vscode";
import { parseJavaMembers } from "./javaParser";
import { JavaMember } from "./model";
import { JavaMemberTreeProvider } from "./treeProvider";

let debounceTimer: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const treeProvider = new JavaMemberTreeProvider(context);
  vscode.window.registerTreeDataProvider("javaMemberView", treeProvider);

  const updateFromDocument = (document: vscode.TextDocument | undefined) => {
    const activeDoc = vscode.window.activeTextEditor?.document;
    const targetDoc =
      document && document.languageId === "java"
        ? document
        : activeDoc && activeDoc.languageId === "java"
          ? activeDoc
          : undefined;

    if (!targetDoc) {
      treeProvider.update(undefined);
      return;
    }

    const source = targetDoc.getText();
    const fileBase = path.basename(targetDoc.fileName, ".java");
    const info = parseJavaMembers(source, fileBase);
    treeProvider.update(info);
  };

  const scheduleUpdate = (document: vscode.TextDocument | undefined) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      updateFromDocument(document);
    }, 200);
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => scheduleUpdate(doc)),
    vscode.window.onDidChangeActiveTextEditor((editor) => scheduleUpdate(editor?.document)),
    vscode.workspace.onDidChangeTextDocument((event) => scheduleUpdate(event.document)),
    vscode.commands.registerCommand("javaMemberView.revealMember", (member: JavaMember) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "java") {
        return;
      }

      const position = editor.document.positionAt(member.startOffset ?? 0);
      const range = new vscode.Range(position, position);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    })
  );

  if (vscode.window.activeTextEditor) {
    scheduleUpdate(vscode.window.activeTextEditor.document);
  }
}

export function deactivate(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
}
