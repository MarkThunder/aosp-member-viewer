export type JavaVisibility = "public" | "private" | "protected" | "package";

export interface JavaFieldSummary {
  name: string;
  type: string;
  visibility: JavaVisibility;
  isStatic: boolean;
  startLine: number;
}

export interface JavaMethodSummary {
  name: string;
  paramsCount: number;
  visibility: JavaVisibility;
  isStatic: boolean;
  startLine: number;
}

export interface JavaClassSummary {
  className: string;
  packageName: string;
  fields: JavaFieldSummary[];
  methods: JavaMethodSummary[];
  innerClasses: string[];
}

export interface JavaMethodDecl extends JavaMethodSummary {
  signature: string;
  startOffset: number;
  endOffset: number;
  bodyStartOffset?: number;
  bodyEndOffset?: number;
}

export interface JavaMethodInvocation {
  name: string;
  argsCount: number;
  startOffset: number;
  line: number;
}

export interface MethodRef {
  className: string;
  methodName: string;
  filePath: string;
  line: number;
}

export interface MethodCallGraph {
  method: string;
  callers: MethodRef[];
  callees: MethodRef[];
}

export interface SystemServiceSummary {
  serviceClass: string;
  onStartLine?: number;
  onBootPhases: number[];
  binderServices: {
    name: string;
    line: number;
  }[];
}

export interface LifecycleTimeline {
  filePath: string;
  className: string;
  entries: {
    name: string;
    line: number;
  }[];
}
