import * as vscode from "vscode";
import { MethodCallGraph, MethodRef } from "../model";
import { formatMethodRef } from "../analysis/methodGraph";

export type MethodGraphNode = MethodGraphRoot | MethodGraphGroup | MethodGraphItem | MethodGraphEmpty;

export class MethodGraphRoot {
  constructor(public readonly graph: MethodCallGraph) {}
}

export class MethodGraphGroup {
  constructor(public readonly label: "Callers" | "Callees", public readonly refs: MethodRef[]) {}
}

export class MethodGraphItem {
  constructor(public readonly ref: MethodRef) {}
}

export class MethodGraphEmpty {
  constructor(public readonly label: string) {}
}

export class MethodGraphTreeProvider implements vscode.TreeDataProvider<MethodGraphNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<MethodGraphNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private graph: MethodCallGraph | undefined;

  update(graph: MethodCallGraph | undefined): void {
    this.graph = graph;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: MethodGraphNode): vscode.TreeItem {
    if (element instanceof MethodGraphRoot) {
      return new vscode.TreeItem(element.graph.method, vscode.TreeItemCollapsibleState.Expanded);
    }

    if (element instanceof MethodGraphGroup) {
      return new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
    }

    if (element instanceof MethodGraphItem) {
      const item = new vscode.TreeItem(formatMethodRef(element.ref), vscode.TreeItemCollapsibleState.None);
      item.command = {
        command: "aosp.openFileAtLine",
        title: "Open",
        arguments: [element.ref.filePath, element.ref.line]
      };
      return item;
    }

    if (element instanceof MethodGraphEmpty) {
      return new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    }

    return new vscode.TreeItem("", vscode.TreeItemCollapsibleState.None);
  }

  getChildren(element?: MethodGraphNode): vscode.ProviderResult<MethodGraphNode[]> {
    if (!this.graph) {
      return [new MethodGraphEmpty("Run 'Show Method Call Graph' in a Java method")];
    }

    if (!element) {
      return [new MethodGraphRoot(this.graph)];
    }

    if (element instanceof MethodGraphRoot) {
      return [
        new MethodGraphGroup("Callers", element.graph.callers),
        new MethodGraphGroup("Callees", element.graph.callees)
      ];
    }

    if (element instanceof MethodGraphGroup) {
      if (element.refs.length === 0) {
        return [new MethodGraphEmpty("(none)")];
      }
      return element.refs.map((ref) => new MethodGraphItem(ref));
    }

    return [];
  }
}
