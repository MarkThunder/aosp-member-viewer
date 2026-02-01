import * as vscode from "vscode";
import { SystemServiceSummary } from "../model";

export type SystemServiceNode = SystemServiceRoot | SystemServiceItem | SystemServiceDetail | SystemServiceEmpty;

export class SystemServiceRoot {
  constructor(public readonly summaries: SystemServiceSummary[]) {}
}

export class SystemServiceItem {
  constructor(public readonly summary: SystemServiceSummary) {}
}

export class SystemServiceDetail {
  constructor(public readonly label: string, public readonly line?: number) {}
}

export class SystemServiceEmpty {
  constructor(public readonly label: string) {}
}

export class SystemServiceTreeProvider implements vscode.TreeDataProvider<SystemServiceNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<SystemServiceNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private summaries: SystemServiceSummary[] = [];

  update(summaries: SystemServiceSummary[]): void {
    this.summaries = summaries;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: SystemServiceNode): vscode.TreeItem {
    if (element instanceof SystemServiceRoot) {
      return new vscode.TreeItem("System Services", vscode.TreeItemCollapsibleState.Expanded);
    }

    if (element instanceof SystemServiceItem) {
      const item = new vscode.TreeItem(element.summary.serviceClass, vscode.TreeItemCollapsibleState.Expanded);
      item.description = `onStart ${element.summary.onStartLine ? "@" + element.summary.onStartLine : "-"}`;
      return item;
    }

    if (element instanceof SystemServiceDetail) {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      if (element.line) {
        item.command = {
          command: "aosp.revealLine",
          title: "Reveal",
          arguments: [element.line]
        };
        item.description = `line ${element.line}`;
      }
      return item;
    }

    if (element instanceof SystemServiceEmpty) {
      return new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    }

    return new vscode.TreeItem("", vscode.TreeItemCollapsibleState.None);
  }

  getChildren(element?: SystemServiceNode): vscode.ProviderResult<SystemServiceNode[]> {
    if (!element) {
      return [new SystemServiceRoot(this.summaries)];
    }

    if (element instanceof SystemServiceRoot) {
      if (element.summaries.length === 0) {
        return [new SystemServiceEmpty("No SystemService classes found")];
      }
      return element.summaries.map((summary) => new SystemServiceItem(summary));
    }

    if (element instanceof SystemServiceItem) {
      const details: SystemServiceDetail[] = [];
      if (element.summary.onStartLine) {
        details.push(new SystemServiceDetail("onStart", element.summary.onStartLine));
      }
      if (element.summary.onBootPhases.length > 0) {
        for (const phaseLine of element.summary.onBootPhases) {
          details.push(new SystemServiceDetail("onBootPhase", phaseLine));
        }
      }
      if (element.summary.binderServices.length > 0) {
        for (const binder of element.summary.binderServices) {
          details.push(new SystemServiceDetail(`binder: ${binder.name}`, binder.line));
        }
      }
      if (details.length === 0) {
        return [new SystemServiceDetail("(no lifecycle hooks found)")];
      }
      return details;
    }

    return [];
  }
}
