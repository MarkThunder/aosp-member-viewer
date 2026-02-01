export type JavaAccess = "public" | "private" | "protected" | "package";

export type JavaMemberKind = "field" | "method";

export interface JavaMember {
  name: string;
  kind: JavaMemberKind;
  access: JavaAccess;
  signature: string;
  startOffset: number;
}

export interface JavaClassInfo {
  className: string;
  members: JavaMember[];
}
