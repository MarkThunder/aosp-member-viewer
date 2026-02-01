import * as vscode from "vscode";

export interface ConcurrencyWarning {
  range: vscode.Range;
  message: string;
}

const BINDER_CALL_REGEX = /(transact\s*\(|linkToDeath\s*\(|asBinder\s*\(|queryLocalInterface\s*\()/;
const HANDLER_CALL_REGEX = /\b(post|postDelayed|sendMessage|sendMessageAtTime)\s*\(/;

function findSynchronizedBlocks(text: string): { start: number; end: number; line: number }[] {
  const blocks: { start: number; end: number; line: number }[] = [];
  const syncRegex = /\bsynchronized\b/g;
  let match: RegExpExecArray | null;
  while ((match = syncRegex.exec(text))) {
    const startIndex = match.index;
    const braceIndex = text.indexOf("{", match.index);
    if (braceIndex === -1) {
      continue;
    }
    let depth = 1;
    for (let i = braceIndex + 1; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          const line = text.slice(0, startIndex).split("\n").length;
          blocks.push({ start: braceIndex + 1, end: i, line });
          break;
        }
      }
    }
  }
  return blocks;
}

export function analyzeConcurrencyWarnings(document: vscode.TextDocument): ConcurrencyWarning[] {
  const text = document.getText();
  const warnings: ConcurrencyWarning[] = [];
  const blocks = findSynchronizedBlocks(text);

  for (const block of blocks) {
    const blockText = text.slice(block.start, block.end);
    if (BINDER_CALL_REGEX.test(blockText)) {
      const range = new vscode.Range(block.line - 1, 0, block.line - 1, 0);
      warnings.push({
        range,
        message: "Binder call inside synchronized block may block other threads."
      });
    }
    if (HANDLER_CALL_REGEX.test(blockText)) {
      const range = new vscode.Range(block.line - 1, 0, block.line - 1, 0);
      warnings.push({
        range,
        message: "Handler post/send inside synchronized block can cause lock inversion."
      });
    }
    if (/\bsynchronized\b/.test(blockText)) {
      const range = new vscode.Range(block.line - 1, 0, block.line - 1, 0);
      warnings.push({
        range,
        message: "Nested synchronized blocks detected."
      });
    }
  }

  return warnings;
}
