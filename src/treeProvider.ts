import * as path from "path";
import * as vscode from "vscode";
import { JavaClassInfo, JavaMember } from "./model";

export type JavaTreeNode = JavaRootNode | JavaGroupNode | JavaMemberNode | JavaEmptyNode;

export class JavaRootNode {
  constructor(public readonly info: JavaClassInfo) {}
}

export class JavaGroupNode {
  constructor(public readonly label: string, public readonly members: JavaMember[]) {}
}

export class JavaMemberNode {
  constructor(public readonly member: JavaMember) {}
}

export class JavaEmptyNode {
  constructor(public readonly label: string) {}
}

export class JavaMemberTreeProvider implements vscode.TreeDataProvider<JavaTreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<JavaTreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private currentInfo: JavaClassInfo | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  update(info: JavaClassInfo | undefined): void {
    this.currentInfo = info;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: JavaTreeNode): vscode.TreeItem {
    if (element instanceof JavaRootNode) {
      const item = new vscode.TreeItem(element.info.className, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = "javaRoot";
      return item;
    }

    if (element instanceof JavaGroupNode) {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = element.label.toLowerCase();
      return item;
    }

    if (element instanceof JavaEmptyNode) {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.contextValue = "empty";
      return item;
    }

    const member = element.member;
    const item = new vscode.TreeItem(member.signature, vscode.TreeItemCollapsibleState.None);
    item.description = `${member.kind} · ${member.access}`;
    item.tooltip = member.signature;
    item.iconPath = this.getIconForMember(member);
    item.command = {
      command: "javaMemberView.revealMember",
      title: "Reveal Member",
      arguments: [member]
    };
    return item;
  }

  getChildren(element?: JavaTreeNode): vscode.ProviderResult<JavaTreeNode[]> {
    if (!this.currentInfo) {
      return [new JavaEmptyNode("Open a Java file to see members")];
    }

    if (!element) {
      return [new JavaRootNode(this.currentInfo)];
    }

    if (element instanceof JavaRootNode) {
      const fields = element.info.members.filter((member) => member.kind === "field");
      const methods = element.info.members.filter((member) => member.kind === "method");
      return [new JavaGroupNode("Fields", fields), new JavaGroupNode("Methods", methods)];
    }

    if (element instanceof JavaGroupNode) {
      return element.members.map((member) => new JavaMemberNode(member));
    }

    return [];
  }

  private getIconForMember(member: JavaMember): { light: string; dark: string } {
    const access = member.access === "protected" ? "protected" : member.access === "package" ? "public" : member.access;
    const kind = member.kind;
    const suffix = `${access}-${kind}`;
    const iconName = `${suffix}.svg`;

    const light = this.context.asAbsolutePath(path.join("media", iconName));
    const dark = light;
    return { light, dark };
  }
}
