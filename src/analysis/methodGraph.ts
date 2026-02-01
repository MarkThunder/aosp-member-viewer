import * as path from "path";
import * as vscode from "vscode";
import { javaFileCache } from "./javaCache";
import { MethodCallGraph, MethodRef, JavaMethodDecl } from "../model";

function findMethodAtOffset(methods: JavaMethodDecl[], offset: number): JavaMethodDecl | undefined {
  return methods.find((method) => offset >= method.startOffset && offset <= method.endOffset);
}

function findEnclosingMethod(methods: JavaMethodDecl[], offset: number): JavaMethodDecl | undefined {
  return methods.find((method) => {
    const start = method.bodyStartOffset ?? method.startOffset;
    const end = method.bodyEndOffset ?? method.endOffset;
    return offset >= start && offset <= end;
  });
}

function buildMethodLabel(className: string, method: JavaMethodDecl): string {
  return `${className}.${method.name}(${method.paramsCount})`;
}

function findCalleesInFile(
  className: string,
  method: JavaMethodDecl,
  invocations: { name: string; argsCount: number; startOffset: number; line: number }[],
  methods: JavaMethodDecl[],
  filePath: string
): MethodRef[] {
  const callees: MethodRef[] = [];
  const bodyStart = method.bodyStartOffset ?? method.startOffset;
  const bodyEnd = method.bodyEndOffset ?? method.endOffset;
  for (const invocation of invocations) {
    if (invocation.startOffset < bodyStart || invocation.startOffset > bodyEnd) {
      continue;
    }
    const candidate = methods.find(
      (decl) => decl.name === invocation.name && decl.paramsCount === invocation.argsCount
    );
    if (candidate) {
      callees.push({
        className,
        methodName: candidate.name,
        filePath,
        line: candidate.startLine
      });
    }
  }
  return callees;
}

export async function buildMethodCallGraph(
  editor: vscode.TextEditor,
  token: vscode.CancellationToken
): Promise<MethodCallGraph | undefined> {
  const document = editor.document;
  const analysis = await javaFileCache.getAnalysis(document, token);
  if (!analysis) {
    return undefined;
  }

  const offset = document.offsetAt(editor.selection.active);
  const currentMethod = findMethodAtOffset(analysis.methodDecls, offset);
  if (!currentMethod) {
    return undefined;
  }

  const className = analysis.summary.className;
  const methodLabel = buildMethodLabel(className, currentMethod);
  const callees = findCalleesInFile(
    className,
    currentMethod,
    analysis.methodInvocations,
    analysis.methodDecls,
    document.fileName
  );

  const callers: MethodRef[] = [];
  const seen = new Set<string>();
  for (const invocation of analysis.methodInvocations) {
    if (invocation.name !== currentMethod.name || invocation.argsCount !== currentMethod.paramsCount) {
      continue;
    }
    const caller = findEnclosingMethod(analysis.methodDecls, invocation.startOffset);
    if (!caller) {
      continue;
    }
    const key = `${caller.name}:${caller.startLine}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    callers.push({
      className,
      methodName: caller.name,
      filePath: document.fileName,
      line: caller.startLine
    });
  }

  return {
    method: methodLabel,
    callers,
    callees
  };
}

export function formatMethodRef(ref: MethodRef): string {
  const file = path.basename(ref.filePath);
  return `${ref.className}.${ref.methodName} · ${file}:${ref.line}`;
}
