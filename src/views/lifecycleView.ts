import * as vscode from "vscode";
import { LifecycleTimeline } from "../model";
import { formatTimelineLabel } from "../analysis/lifecycle";

export type LifecycleNode = LifecycleRoot | LifecycleFileNode | LifecycleEntryNode | LifecycleEmptyNode;

export class LifecycleRoot {
  constructor(public readonly timelines: LifecycleTimeline[]) {}
}

export class LifecycleFileNode {
  constructor(public readonly timeline: LifecycleTimeline) {}
}

export class LifecycleEntryNode {
  constructor(public readonly name: string, public readonly line: number) {}
}

export class LifecycleEmptyNode {
  constructor(public readonly label: string) {}
}

export class LifecycleTreeProvider implements vscode.TreeDataProvider<LifecycleNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<LifecycleNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private timelines: LifecycleTimeline[] = [];

  update(timelines: LifecycleTimeline[]): void {
    this.timelines = timelines;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: LifecycleNode): vscode.TreeItem {
    if (element instanceof LifecycleRoot) {
      return new vscode.TreeItem("Framework Lifecycle", vscode.TreeItemCollapsibleState.Expanded);
    }

    if (element instanceof LifecycleFileNode) {
      return new vscode.TreeItem(formatTimelineLabel(element.timeline), vscode.TreeItemCollapsibleState.Expanded);
    }

    if (element instanceof LifecycleEntryNode) {
      const item = new vscode.TreeItem(`${element.name}`, vscode.TreeItemCollapsibleState.None);
      item.description = `line ${element.line}`;
      item.command = {
        command: "aosp.revealLine",
        title: "Reveal",
        arguments: [element.line]
      };
      return item;
    }

    if (element instanceof LifecycleEmptyNode) {
      return new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    }

    return new vscode.TreeItem("", vscode.TreeItemCollapsibleState.None);
  }

  getChildren(element?: LifecycleNode): vscode.ProviderResult<LifecycleNode[]> {
    if (!element) {
      return [new LifecycleRoot(this.timelines)];
    }

    if (element instanceof LifecycleRoot) {
      if (element.timelines.length === 0) {
        return [new LifecycleEmptyNode("No lifecycle files found")];
      }
      return element.timelines.map((timeline) => new LifecycleFileNode(timeline));
    }

    if (element instanceof LifecycleFileNode) {
      if (element.timeline.entries.length === 0) {
        return [new LifecycleEmptyNode("No lifecycle methods found")];
      }
      return element.timeline.entries.map((entry) => new LifecycleEntryNode(entry.name, entry.line));
    }

    return [];
  }
}
