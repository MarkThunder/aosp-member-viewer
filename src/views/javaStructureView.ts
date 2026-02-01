import * as path from "path";
import * as vscode from "vscode";
import { JavaClassSummary, JavaFieldSummary, JavaMethodSummary, JavaVisibility } from "../model";

export type JavaStructureNode =
  | JavaStructureRoot
  | JavaAccessGroup
  | JavaMemberKindGroup
  | JavaMemberNode
  | JavaInnerClassesGroup
  | JavaInnerClassNode
  | JavaEmptyNode;

export class JavaStructureRoot {
  constructor(public readonly summary: JavaClassSummary) {}
}

export class JavaAccessGroup {
  constructor(public readonly visibility: JavaVisibility, public readonly fields: JavaFieldSummary[], public readonly methods: JavaMethodSummary[]) {}
}

export class JavaMemberKindGroup {
  constructor(public readonly label: "Fields" | "Methods", public readonly members: (JavaFieldSummary | JavaMethodSummary)[]) {}
}

export class JavaMemberNode {
  constructor(public readonly member: JavaFieldSummary | JavaMethodSummary, public readonly kind: "field" | "method") {}
}

export class JavaInnerClassesGroup {
  constructor(public readonly classes: string[]) {}
}

export class JavaInnerClassNode {
  constructor(public readonly name: string) {}
}

export class JavaEmptyNode {
  constructor(public readonly label: string) {}
}

const ACCESS_ORDER: JavaVisibility[] = ["public", "protected", "private", "package"];

export class JavaStructureTreeProvider implements vscode.TreeDataProvider<JavaStructureNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<JavaStructureNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private summary: JavaClassSummary | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  update(summary: JavaClassSummary | undefined): void {
    this.summary = summary;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: JavaStructureNode): vscode.TreeItem {
    if (element instanceof JavaStructureRoot) {
      const label = element.summary.packageName
        ? `${element.summary.packageName}.${element.summary.className}`
        : element.summary.className;
      return new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
    }

    if (element instanceof JavaAccessGroup) {
      const label = element.visibility === "package" ? "Package" : capitalize(element.visibility);
      return new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
    }

    if (element instanceof JavaMemberKindGroup) {
      return new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
    }

    if (element instanceof JavaInnerClassesGroup) {
      return new vscode.TreeItem("Inner Classes", vscode.TreeItemCollapsibleState.Expanded);
    }

    if (element instanceof JavaInnerClassNode) {
      return new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.None);
    }

    if (element instanceof JavaEmptyNode) {
      return new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    }

    const member = element.member;
    const item = new vscode.TreeItem(
      element.kind === "field" ? `${member.name}: ${(member as JavaFieldSummary).type || ""}`.trim() : member.name,
      vscode.TreeItemCollapsibleState.None
    );
    item.description = `${element.kind} · ${member.visibility} · line ${member.startLine}`;
    item.tooltip = `${member.name} (${member.startLine})`;
    item.iconPath = this.getIconForMember(member.visibility, element.kind);
    item.command = {
      command: "aosp.revealLine",
      title: "Reveal",
      arguments: [member.startLine]
    };
    return item;
  }

  getChildren(element?: JavaStructureNode): vscode.ProviderResult<JavaStructureNode[]> {
    if (!this.summary) {
      return [new JavaEmptyNode("Open a Java file to see structure")];
    }

    if (!element) {
      return [new JavaStructureRoot(this.summary)];
    }

    if (element instanceof JavaStructureRoot) {
      const groups = ACCESS_ORDER.map((visibility) => {
        const fields = this.summary?.fields.filter((field) => field.visibility === visibility) ?? [];
        const methods = this.summary?.methods.filter((method) => method.visibility === visibility) ?? [];
        return new JavaAccessGroup(visibility, fields, methods);
      });
      return [...groups, new JavaInnerClassesGroup(this.summary.innerClasses)];
    }

    if (element instanceof JavaAccessGroup) {
      return [
        new JavaMemberKindGroup("Fields", element.fields),
        new JavaMemberKindGroup("Methods", element.methods)
      ];
    }

    if (element instanceof JavaMemberKindGroup) {
      if (element.members.length === 0) {
        return [new JavaEmptyNode("(none)")];
      }
      return element.members.map((member) =>
        new JavaMemberNode(member, element.label === "Fields" ? "field" : "method")
      );
    }

    if (element instanceof JavaInnerClassesGroup) {
      if (element.classes.length === 0) {
        return [new JavaEmptyNode("(none)")];
      }
      return element.classes.map((name) => new JavaInnerClassNode(name));
    }

    return [];
  }

  private getIconForMember(visibility: JavaVisibility, kind: "field" | "method"): { light: string; dark: string } {
    const access = visibility === "package" ? "public" : visibility === "protected" ? "protected" : visibility;
    const iconName = `${access}-${kind}.svg`;
    const light = this.context.asAbsolutePath(path.join("media", iconName));
    return { light, dark: light };
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
