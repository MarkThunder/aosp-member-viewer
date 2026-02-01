import * as vscode from "vscode";

function isStringLiteralRange(document: vscode.TextDocument, position: vscode.Position): { text: string; range: vscode.Range } | undefined {
  const lineText = document.lineAt(position.line).text;
  const quoteIndex = lineText.lastIndexOf("\"", position.character);
  if (quoteIndex === -1) {
    return undefined;
  }
  const endQuote = lineText.indexOf("\"", quoteIndex + 1);
  if (endQuote === -1) {
    return undefined;
  }
  if (position.character < quoteIndex || position.character > endQuote) {
    return undefined;
  }
  const value = lineText.slice(quoteIndex + 1, endQuote);
  return {
    text: value,
    range: new vscode.Range(position.line, quoteIndex + 1, position.line, endQuote)
  };
}

async function findInFiles(pattern: string, glob: string, token: vscode.CancellationToken): Promise<vscode.Location | undefined> {
  const files = await vscode.workspace.findFiles(glob, "**/{out,build,.gradle,node_modules}/**");
  for (const uri of files) {
    if (token.isCancellationRequested) {
      return undefined;
    }
    const document = await vscode.workspace.openTextDocument(uri);
    const text = document.getText();
    const index = text.indexOf(pattern);
    if (index !== -1) {
      const pos = document.positionAt(index);
      return new vscode.Location(uri, pos);
    }
  }
  return undefined;
}

async function findServiceContext(serviceName: string, token: vscode.CancellationToken): Promise<vscode.Location | undefined> {
  const files = await vscode.workspace.findFiles("**/service_contexts", "**/{out,build,.gradle,node_modules}/**");
  for (const uri of files) {
    if (token.isCancellationRequested) {
      return undefined;
    }
    const document = await vscode.workspace.openTextDocument(uri);
    const lines = document.getText().split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].includes(serviceName)) {
        return new vscode.Location(uri, new vscode.Position(i, Math.max(0, lines[i].indexOf(serviceName))));
      }
    }
  }
  return undefined;
}

async function findInitService(serviceName: string, token: vscode.CancellationToken): Promise<vscode.Location | undefined> {
  const files = await vscode.workspace.findFiles("**/*.rc", "**/{out,build,.gradle,node_modules}/**");
  for (const uri of files) {
    if (token.isCancellationRequested) {
      return undefined;
    }
    const document = await vscode.workspace.openTextDocument(uri);
    const lines = document.getText().split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.startsWith("service ") && line.includes(serviceName)) {
        return new vscode.Location(uri, new vscode.Position(i, line.indexOf(serviceName)));
      }
    }
  }
  return undefined;
}

async function findJniMethod(methodName: string, token: vscode.CancellationToken): Promise<vscode.Location | undefined> {
  return findInFiles(methodName, "**/jni/**/*.cpp", token);
}

export class AospDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Definition | undefined> {
    if (document.languageId !== "java") {
      return undefined;
    }

    const lineText = document.lineAt(position.line).text;
    const stringLiteral = isStringLiteralRange(document, position);

    if (stringLiteral) {
      if (/publishBinderService|addService/.test(lineText)) {
        return findServiceContext(stringLiteral.text, token);
      }
      if (/start|ctl\.start|init/.test(lineText)) {
        return findInitService(stringLiteral.text, token);
      }
    }

    if (/\bnative\b/.test(lineText)) {
      const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_]+/);
      if (wordRange) {
        const word = document.getText(wordRange);
        return findJniMethod(word, token);
      }
    }

    return undefined;
  }
}
