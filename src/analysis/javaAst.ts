import { parse } from "java-parser";
import {
  JavaClassSummary,
  JavaFieldSummary,
  JavaMethodSummary,
  JavaVisibility,
  JavaMethodDecl,
  JavaMethodInvocation,
  SystemServiceSummary
} from "../model";

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

const ACCESS_KEYWORDS = ["public", "private", "protected"] as const;
const STATIC_KEYWORD = "static";

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

function getAccess(tokens: CstToken[]): JavaVisibility {
  for (const token of tokens) {
    const image = token.image;
    if (image === "public" || image === "private" || image === "protected") {
      return image;
    }
  }

  return "package";
}

function hasStatic(tokens: CstToken[]): boolean {
  return tokens.some((token) => token.image === STATIC_KEYWORD);
}

function buildLineIndex(source: string): number[] {
  const lineStarts: number[] = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source.charCodeAt(i) === 10) {
      lineStarts.push(i + 1);
    }
  }
  return lineStarts;
}

function offsetToLine(offset: number, lineStarts: number[]): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) {
      if (mid === lineStarts.length - 1 || lineStarts[mid + 1] > offset) {
        return mid + 1;
      }
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return 1;
}

function getNodeRange(node: CstNode): { start: number; end: number } | undefined {
  const tokens: CstToken[] = [];
  collectTokens(node, tokens);
  if (tokens.length === 0) {
    return undefined;
  }
  const sorted = tokens.sort((a, b) => a.startOffset - b.startOffset);
  const start = sorted[0].startOffset;
  const last = sorted[sorted.length - 1];
  const end = (last.endOffset ?? last.startOffset) + 1;
  return { start, end };
}

function findMethodBodyRange(methodNode: CstNode): { start: number; end: number } | undefined {
  const bodyNode = findFirstNode(methodNode, "methodBody");
  if (!bodyNode) {
    return undefined;
  }
  return getNodeRange(bodyNode);
}

function extractPackageName(root: CstNode, source: string): string {
  const pkgNode = findFirstNode(root, "packageDeclaration");
  if (!pkgNode) {
    return "";
  }
  const tokens: CstToken[] = [];
  collectTokens(pkgNode, tokens);
  const text = tokensToText(tokens, source);
  return text.replace(/^package\s+/, "").replace(/;\s*$/, "").trim();
}

function extractClassNames(root: CstNode): string[] {
  const classNodes: CstNode[] = [];
  findAllNodes(root, "normalClassDeclaration", classNodes);
  const names: string[] = [];
  for (const classNode of classNodes) {
    const declaratorNode = findFirstNode(classNode, "classDeclarator");
    if (!declaratorNode) {
      continue;
    }
    const tokens: CstToken[] = [];
    collectTokens(declaratorNode, tokens);
    const nameToken = tokens.find((token) => token.image && token.image !== "class");
    if (nameToken?.image) {
      names.push(nameToken.image);
    }
  }
  return names;
}

function extractFieldMembers(fieldNode: CstNode, source: string, lineStarts: number[]): JavaFieldSummary[] {
  const tokens: CstToken[] = [];
  collectTokens(fieldNode, tokens);

  const visibility = getAccess(tokens);
  const isStatic = hasStatic(tokens);

  const typeNode =
    findFirstNode(fieldNode, "unannType") ??
    findFirstNode(fieldNode, "typeType") ??
    findFirstNode(fieldNode, "type");
  const typeTokens: CstToken[] = [];
  if (typeNode) {
    collectTokens(typeNode, typeTokens);
  }
  const typeText = tokensToText(typeTokens, source);

  const declaratorIds: CstNode[] = [];
  findAllNodes(fieldNode, "variableDeclaratorId", declaratorIds);

  const fields: JavaFieldSummary[] = [];
  for (const declaratorId of declaratorIds) {
    const idTokens: CstToken[] = [];
    collectTokens(declaratorId, idTokens);
    const nameToken = idTokens.find((token) => token.image);
    const name = nameToken?.image;
    if (!name || nameToken?.startOffset === undefined) {
      continue;
    }

    fields.push({
      name,
      type: typeText,
      visibility,
      isStatic,
      startLine: offsetToLine(nameToken.startOffset, lineStarts)
    });
  }

  return fields;
}

function countParameters(methodDeclarator: CstNode): number {
  const paramNodes: CstNode[] = [];
  findAllNodes(methodDeclarator, "formalParameter", paramNodes);
  const lastParamNodes: CstNode[] = [];
  findAllNodes(methodDeclarator, "lastFormalParameter", lastParamNodes);
  const receiverNodes: CstNode[] = [];
  findAllNodes(methodDeclarator, "receiverParameter", receiverNodes);
  return paramNodes.length + lastParamNodes.length + receiverNodes.length;
}

function extractMethodMembers(methodNode: CstNode, source: string, lineStarts: number[]): JavaMethodDecl[] {
  const tokens: CstToken[] = [];
  collectTokens(methodNode, tokens);

  const visibility = getAccess(tokens);
  const isStatic = hasStatic(tokens);

  const declaratorNode = findFirstNode(methodNode, "methodDeclarator");
  if (!declaratorNode) {
    return [];
  }

  const declaratorTokens: CstToken[] = [];
  collectTokens(declaratorNode, declaratorTokens);

  const sorted = declaratorTokens.sort((a, b) => a.startOffset - b.startOffset);
  const nameToken = sorted.find((token) => token.image && token.image !== "(");
  const name = nameToken?.image ?? "<method>";

  const paramsCount = countParameters(declaratorNode);

  const resultNode = findFirstNode(methodNode, "result");
  const resultTokens: CstToken[] = [];
  if (resultNode) {
    collectTokens(resultNode, resultTokens);
  }
  const resultText = tokensToText(resultTokens, source);

  const signature = resultText ? `${resultText} ${name}(${paramsCount})` : `${name}(${paramsCount})`;
  const range = getNodeRange(methodNode);
  const bodyRange = findMethodBodyRange(methodNode);
  const startOffset = nameToken?.startOffset ?? range?.start ?? 0;
  const endOffset = range?.end ?? startOffset;

  return [
    {
      name,
      paramsCount,
      visibility,
      isStatic,
      signature,
      startOffset,
      endOffset,
      bodyStartOffset: bodyRange?.start,
      bodyEndOffset: bodyRange?.end,
      startLine: offsetToLine(startOffset, lineStarts)
    }
  ];
}

function isIdentifier(image: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(image);
}

function extractInvocationName(tokens: CstToken[]): CstToken | undefined {
  const sorted = tokens.sort((a, b) => a.startOffset - b.startOffset);
  const openIndex = sorted.findIndex((token) => token.image === "(");
  if (openIndex <= 0) {
    return undefined;
  }
  for (let i = openIndex - 1; i >= 0; i -= 1) {
    const token = sorted[i];
    if (isIdentifier(token.image)) {
      return token;
    }
  }
  return undefined;
}

function countArgumentsFromText(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  let depthParen = 0;
  let depthAngle = 0;
  let depthBracket = 0;
  let count = 1;
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch === "(") {
      depthParen += 1;
    } else if (ch === ")") {
      depthParen = Math.max(0, depthParen - 1);
    } else if (ch === "<") {
      depthAngle += 1;
    } else if (ch === ">") {
      depthAngle = Math.max(0, depthAngle - 1);
    } else if (ch === "[") {
      depthBracket += 1;
    } else if (ch === "]") {
      depthBracket = Math.max(0, depthBracket - 1);
    } else if (ch === "," && depthParen === 0 && depthAngle === 0 && depthBracket === 0) {
      count += 1;
    }
  }
  return count;
}

function extractInvocationArgsText(tokens: CstToken[], source: string): string {
  const sorted = tokens.sort((a, b) => a.startOffset - b.startOffset);
  const openIndex = sorted.findIndex((token) => token.image === "(");
  if (openIndex === -1) {
    return "";
  }
  let closeIndex = -1;
  for (let i = sorted.length - 1; i > openIndex; i -= 1) {
    if (sorted[i].image === ")") {
      closeIndex = i;
      break;
    }
  }
  if (closeIndex === -1) {
    return "";
  }
  const start = sorted[openIndex].startOffset + 1;
  const end = sorted[closeIndex].startOffset;
  return source.slice(start, end);
}

function isCallKeyword(name: string): boolean {
  return [
    "if",
    "for",
    "while",
    "switch",
    "catch",
    "synchronized",
    "new",
    "return",
    "throw",
    "try",
    "else",
    "do",
    "case",
    "super",
    "this",
    "assert"
  ].includes(name);
}

function findMatchingParen(text: string, openIndex: number): number {
  let depth = 0;
  let inString: "\"" | "'" | null = null;
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\" && i + 1 < text.length) {
        i += 1;
        continue;
      }
      if (ch === inString) {
        inString = null;
      }
      continue;
    }
    if (ch === "\"" || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function scanInvocationsInText(text: string, baseOffset: number, lineStarts: number[]): JavaMethodInvocation[] {
  const invocations: JavaMethodInvocation[] = [];
  const regex = /\b([A-Za-z_$][\w$]*)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const name = match[1];
    if (isCallKeyword(name)) {
      continue;
    }
    const openParenIndex = match.index + match[0].lastIndexOf("(");
    const closeParenIndex = findMatchingParen(text, openParenIndex);
    if (closeParenIndex === -1) {
      continue;
    }
    const argsText = text.slice(openParenIndex + 1, closeParenIndex);
    const argsCount = countArgumentsFromText(argsText);
    const startOffset = baseOffset + match.index;
    invocations.push({
      name,
      argsCount,
      startOffset,
      line: offsetToLine(startOffset, lineStarts)
    });
  }
  return invocations;
}

function extractMethodInvocations(methods: JavaMethodDecl[], source: string, lineStarts: number[]): JavaMethodInvocation[] {
  const invocations: JavaMethodInvocation[] = [];
  for (const method of methods) {
    if (method.bodyStartOffset === undefined || method.bodyEndOffset === undefined) {
      continue;
    }
    const bodyText = source.slice(method.bodyStartOffset, method.bodyEndOffset);
    invocations.push(...scanInvocationsInText(bodyText, method.bodyStartOffset, lineStarts));
  }
  return invocations;
}

function extractSystemServiceSummary(
  className: string,
  classNode: CstNode | undefined,
  methods: JavaMethodDecl[],
  invocations: JavaMethodInvocation[],
  source: string
): SystemServiceSummary | undefined {
  if (!classNode) {
    return undefined;
  }
  const tokens: CstToken[] = [];
  collectTokens(classNode, tokens);
  const header = tokensToText(tokens, source);
  if (!/extends\s+SystemService/.test(header)) {
    return undefined;
  }

  const onStart = methods.find((method) => method.name === "onStart");
  const onBootPhases = methods
    .filter((method) => method.name === "onBootPhase")
    .map((method) => method.startLine);

  const binderServices = invocations
    .filter((invocation) => invocation.name === "publishBinderService" || invocation.name === "addService")
    .map((invocation) => {
      const lineText = source.split("\n")[invocation.line - 1] ?? "";
      const match = lineText.match(/\"([^\"]+)\"/);
      return {
        name: match ? match[1] : "<unknown>",
        line: invocation.line
      };
    });

  return {
    serviceClass: className,
    onStartLine: onStart?.startLine,
    onBootPhases,
    binderServices
  };
}

export interface JavaFileAnalysis {
  summary: JavaClassSummary;
  methodDecls: JavaMethodDecl[];
  methodInvocations: JavaMethodInvocation[];
  systemService?: SystemServiceSummary;
}

export function analyzeJavaSource(source: string, fallbackClassName: string): JavaFileAnalysis {
  const lineStarts = buildLineIndex(source);
  const cst = parse(source) as unknown as CstNode;

  const fields: JavaFieldSummary[] = [];
  const methods: JavaMethodDecl[] = [];

  const fieldNodes: CstNode[] = [];
  findAllNodes(cst, "fieldDeclaration", fieldNodes);
  for (const fieldNode of fieldNodes) {
    fields.push(...extractFieldMembers(fieldNode, source, lineStarts));
  }

  const methodNodes: CstNode[] = [];
  findAllNodes(cst, "methodDeclaration", methodNodes);
  for (const methodNode of methodNodes) {
    methods.push(...extractMethodMembers(methodNode, source, lineStarts));
  }

  const classNames = extractClassNames(cst);
  const className = classNames[0] ?? fallbackClassName;
  const innerClasses = classNames.slice(1);

  const packageName = extractPackageName(cst, source);
  const invocations = extractMethodInvocations(methods, source, lineStarts);

  const classNode = findFirstNode(cst, "normalClassDeclaration");
  const systemService = extractSystemServiceSummary(className, classNode, methods, invocations, source);

  const summary: JavaClassSummary = {
    className,
    packageName,
    fields,
    methods: methods.map<JavaMethodSummary>((method) => ({
      name: method.name,
      paramsCount: method.paramsCount,
      visibility: method.visibility,
      isStatic: method.isStatic,
      startLine: method.startLine
    })),
    innerClasses
  };

  return {
    summary,
    methodDecls: methods,
    methodInvocations: invocations,
    systemService
  };
}

export function buildMethodSummary(method: JavaMethodDecl): JavaMethodSummary {
  return {
    name: method.name,
    paramsCount: method.paramsCount,
    visibility: method.visibility,
    isStatic: method.isStatic,
    startLine: method.startLine
  };
}
