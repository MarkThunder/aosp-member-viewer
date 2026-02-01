import { parse } from "java-parser";
import { JavaClassInfo, JavaMember, JavaAccess } from "./model";

interface CstNode {
  name: string;
  children: Record<string, CstElement[]>;
}

interface CstToken {
  image: string;
  startOffset: number;
  endOffset?: number;
}

type CstElement = CstNode | CstToken;

const ACCESS_KEYWORDS = ["public", "private", "protected"];

function isCstNode(value: CstElement): value is CstNode {
  return (value as CstNode).children !== undefined;
}

function isToken(value: CstElement): value is CstToken {
  return (value as CstToken).image !== undefined;
}

function collectTokens(node: CstNode, out: CstToken[]): void {
  for (const key of Object.keys(node.children)) {
    const elements = node.children[key] ?? [];
    for (const element of elements) {
      if (isToken(element)) {
        out.push(element);
      } else if (isCstNode(element)) {
        collectTokens(element, out);
      }
    }
  }
}

function findFirstNode(node: CstNode, name: string): CstNode | undefined {
  if (node.name === name) {
    return node;
  }

  for (const key of Object.keys(node.children)) {
    const elements = node.children[key] ?? [];
    for (const element of elements) {
      if (isCstNode(element)) {
        const found = findFirstNode(element, name);
        if (found) {
          return found;
        }
      }
    }
  }

  return undefined;
}

function findAllNodes(node: CstNode, name: string, out: CstNode[]): void {
  if (node.name === name) {
    out.push(node);
  }

  for (const key of Object.keys(node.children)) {
    const elements = node.children[key] ?? [];
    for (const element of elements) {
      if (isCstNode(element)) {
        findAllNodes(element, name, out);
      }
    }
  }
}

function tokensToText(tokens: CstToken[], source: string): string {
  if (tokens.length === 0) {
    return "";
  }

  const sorted = [...tokens].sort((a, b) => a.startOffset - b.startOffset);
  const start = sorted[0].startOffset;
  const end = (sorted[sorted.length - 1].endOffset ?? sorted[sorted.length - 1].startOffset) + 1;
  return source.slice(start, end).trim();
}

function getAccess(tokens: CstToken[]): JavaAccess {
  for (const token of tokens) {
    const image = token.image;
    if (ACCESS_KEYWORDS.includes(image)) {
      return image as JavaAccess;
    }
  }

  return "package";
}

function extractClassName(root: CstNode): string | undefined {
  const classNode = findFirstNode(root, "normalClassDeclaration");
  if (!classNode) {
    return undefined;
  }

  const identifierNode = findFirstNode(classNode, "classDeclarator");
  if (!identifierNode) {
    return undefined;
  }

  const tokens: CstToken[] = [];
  collectTokens(identifierNode, tokens);
  const nameToken = tokens.find((token) => token.image && token.image !== "class");
  return nameToken?.image;
}

function extractFieldMembers(fieldNode: CstNode, source: string): JavaMember[] {
  const tokens: CstToken[] = [];
  collectTokens(fieldNode, tokens);

  const access = getAccess(tokens);

  const typeNode = findFirstNode(fieldNode, "unannType") ?? findFirstNode(fieldNode, "typeType") ?? findFirstNode(fieldNode, "type");
  const typeTokens: CstToken[] = [];
  if (typeNode) {
    collectTokens(typeNode, typeTokens);
  }
  const typeText = tokensToText(typeTokens, source);

  const declaratorIds: CstNode[] = [];
  findAllNodes(fieldNode, "variableDeclaratorId", declaratorIds);

  const members: JavaMember[] = [];
  for (const declaratorId of declaratorIds) {
    const idTokens: CstToken[] = [];
    collectTokens(declaratorId, idTokens);
    const nameToken = idTokens.find((token) => token.image);
    const name = nameToken?.image;
    if (!name || nameToken?.startOffset === undefined) {
      continue;
    }

    const signature = typeText ? `${typeText} ${name}` : name;
    members.push({
      name,
      kind: "field",
      access,
      signature,
      startOffset: nameToken.startOffset
    });
  }

  return members;
}

function extractMethodMembers(methodNode: CstNode, source: string): JavaMember[] {
  const tokens: CstToken[] = [];
  collectTokens(methodNode, tokens);

  const access = getAccess(tokens);

  const declaratorNode = findFirstNode(methodNode, "methodDeclarator");
  if (!declaratorNode) {
    return [];
  }

  const declaratorTokens: CstToken[] = [];
  collectTokens(declaratorNode, declaratorTokens);
  const nameToken = declaratorTokens.find((token) => token.image);
  const name = nameToken?.image ?? "<method>";

  const paramListNode = findFirstNode(declaratorNode, "formalParameterList") ?? findFirstNode(declaratorNode, "formalParameter");
  const paramTokens: CstToken[] = [];
  if (paramListNode) {
    collectTokens(paramListNode, paramTokens);
  }
  const paramText = tokensToText(paramTokens, source);

  const resultNode = findFirstNode(methodNode, "result");
  const resultTokens: CstToken[] = [];
  if (resultNode) {
    collectTokens(resultNode, resultTokens);
  }
  const resultText = tokensToText(resultTokens, source);

  const signature = resultText ? `${resultText} ${name}(${paramText})` : `${name}(${paramText})`;
  return [
    {
      name,
      kind: "method",
      access,
      signature,
      startOffset: nameToken?.startOffset ?? 0
    }
  ];
}

function walk(root: CstNode, source: string, members: JavaMember[]): void {
  if (root.name === "fieldDeclaration") {
    members.push(...extractFieldMembers(root, source));
    return;
  }

  if (root.name === "methodDeclaration") {
    members.push(...extractMethodMembers(root, source));
    return;
  }

  if (root.name === "constructorDeclaration") {
    return;
  }

  for (const key of Object.keys(root.children)) {
    const elements = root.children[key] ?? [];
    for (const element of elements) {
      if (isCstNode(element)) {
        walk(element, source, members);
      }
    }
  }
}

export function parseJavaMembers(source: string, fallbackClassName: string): JavaClassInfo {
  try {
    const cst = parse(source) as unknown as CstNode;
    const members: JavaMember[] = [];
    walk(cst, source, members);

    const className = extractClassName(cst) ?? fallbackClassName;
    return {
      className,
      members
    };
  } catch {
    return {
      className: fallbackClassName,
      members: []
    };
  }
}
