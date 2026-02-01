import * as path from "path";
import * as vscode from "vscode";
import { javaFileCache } from "./javaCache";
import { LifecycleTimeline } from "../model";

const LIFECYCLE_METHODS = [
  "main",
  "startBootstrapServices",
  "startCoreServices",
  "startOtherServices"
];

export async function buildLifecycleTimeline(token: vscode.CancellationToken): Promise<LifecycleTimeline[]> {
  const targets = ["ZygoteInit.java", "SystemServer.java"];
  const timelines: LifecycleTimeline[] = [];

  for (const fileName of targets) {
    if (token.isCancellationRequested) {
      return timelines;
    }
    const files = await vscode.workspace.findFiles(`**/${fileName}`, "**/{out,build,.gradle,node_modules}/**");
    for (const uri of files) {
      const analysis = await javaFileCache.getAnalysisForUri(uri, token);
      if (!analysis) {
        continue;
      }
      const entries = analysis.methodDecls
        .filter((method) => LIFECYCLE_METHODS.includes(method.name))
        .map((method) => ({ name: method.name, line: method.startLine }))
        .sort((a, b) => a.line - b.line);

      timelines.push({
        filePath: uri.fsPath,
        className: analysis.summary.className,
        entries
      });
    }
  }

  return timelines;
}

export function formatTimelineLabel(timeline: LifecycleTimeline): string {
  return `${timeline.className} (${path.basename(timeline.filePath)})`;
}
