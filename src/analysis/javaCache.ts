import * as path from "path";
import * as vscode from "vscode";
import { analyzeJavaSource, JavaFileAnalysis } from "./javaAst";

const MAX_PARSE_BYTES = 1024 * 1024;

function hashText(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class JavaFileCache {
  private cache = new Map<string, { hash: number; size: number; analysis: JavaFileAnalysis }>();

  async getAnalysis(document: vscode.TextDocument, token?: vscode.CancellationToken): Promise<JavaFileAnalysis | undefined> {
    if (document.languageId !== "java") {
      return undefined;
    }
    const text = document.getText();
    const size = Buffer.byteLength(text, "utf8");
    if (size > MAX_PARSE_BYTES) {
      return {
        summary: {
          className: path.basename(document.fileName, ".java"),
          packageName: "",
          fields: [],
          methods: [],
          innerClasses: []
        },
        methodDecls: [],
        methodInvocations: [],
        systemService: undefined
      };
    }

    const fileKey = document.uri.toString();
    const hash = hashText(text);
    const cached = this.cache.get(fileKey);
    if (cached && cached.hash === hash && cached.size === size) {
      return cached.analysis;
    }

    if (token?.isCancellationRequested) {
      return undefined;
    }

    try {
      const analysis = analyzeJavaSource(text, path.basename(document.fileName, ".java"));
      this.cache.set(fileKey, { hash, size, analysis });
      return analysis;
    } catch {
      return undefined;
    }
  }

  async getAnalysisForUri(uri: vscode.Uri, token?: vscode.CancellationToken): Promise<JavaFileAnalysis | undefined> {
    const document = await vscode.workspace.openTextDocument(uri);
    if (token?.isCancellationRequested) {
      return undefined;
    }
    return this.getAnalysis(document, token);
  }

  clear(uri?: vscode.Uri): void {
    if (!uri) {
      this.cache.clear();
      return;
    }
    this.cache.delete(uri.toString());
  }
}

export const javaFileCache = new JavaFileCache();
