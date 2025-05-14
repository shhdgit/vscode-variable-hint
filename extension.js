const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

let variableTree = {};
let watcher = null;

function loadVariables(workspacePath) {
  const filePath = path.join(workspacePath, "variables.json");
  try {
    const content = fs.readFileSync(filePath, "utf8");
    variableTree = JSON.parse(content);
    console.log("Variables loaded (tree):", variableTree);
  } catch (err) {
    console.warn("Failed to load variables.json:", err.message);
    variableTree = {};
  }
}

function getSubKeysByPath(obj, path) {
  if (!path) return Object.keys(obj);

  const keys = path.split(".");
  let current = obj;

  for (let key of keys) {
    if (!current || typeof current !== "object") return [];
    current = current[key];
  }

  if (typeof current !== "object" || current === null) return [];
  return Object.keys(current);
}

function getValueByPath(obj, path) {
  const keys = path.split(".");
  let current = obj;

  for (let key of keys) {
    if (!current || typeof current !== "object") return undefined;
    current = current[key];
  }

  return current;
}

function activate(context) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return;
  const workspacePath = workspaceFolders[0].uri.fsPath;

  loadVariables(workspacePath);

  const saveListener = vscode.workspace.onDidSaveTextDocument((doc) => {
    const fileName = path.basename(doc.fileName);
    if (fileName === "variables.json") {
      loadVariables(workspacePath);
    }
  });

  const provider = vscode.languages.registerCompletionItemProvider(
    ["plaintext", "markdown"],
    {
      provideCompletionItems(document, position) {
        const line = document.lineAt(position).text;
        const prefix = line.substring(0, position.character);

        const match = prefix.match(/\{\{\{\s*\.(.*?)$/);
        if (!match) return undefined;

        const partialPath = match[1].trim(); // e.g. "user.na" or "user."
        const pathParts = partialPath.split(".");
        const isDotEnded = partialPath.endsWith(".");

        const pathPrefix = isDotEnded
          ? partialPath.slice(0, -1) // e.g. "user." → "user"
          : pathParts.slice(0, -1).join("."); // e.g. "user.na" → "user"

        const lastPart = isDotEnded ? "" : pathParts[pathParts.length - 1];

        const candidates = getSubKeysByPath(variableTree, pathPrefix);
        return candidates
          .filter((key) => key.startsWith(lastPart))
          .map((key) => {
            const insertText = isDotEnded ? key : key.slice(lastPart.length);
            const item = new vscode.CompletionItem(
              key,
              vscode.CompletionItemKind.Variable
            );
            item.insertText = insertText;

            const fullPath = [...pathPrefix.split("."), key]
              .filter(Boolean)
              .join(".");
            const value = getValueByPath(variableTree, fullPath);
            item.detail = `Value: ${JSON.stringify(value)}`;

            return item;
          });
      },
    },
    "."
  );

  const hoverProvider = vscode.languages.registerHoverProvider(
    ["plaintext", "markdown"],
    {
      provideHover(document, position) {
        const range = document.getWordRangeAtPosition(
          position,
          /\{\{\{\s*\.(.*?)\s*\}\}\}/
        );
        if (!range) return;

        const word = document.getText(range); // e.g. {{ .user.name }}
        const match = word.match(/\{\{\{\s*\.(.*?)\s*\}\}\}/);
        if (!match) return;

        const variablePath = match[1]; // e.g. user.name
        const value = getValueByPath(variableTree, variablePath);

        if (value === undefined) return;

        const markdown = new vscode.MarkdownString();
        markdown.appendCodeblock(
          `Path: ${variablePath}\nValue: ${JSON.stringify(value, null, 2)}`,
          "json"
        );
        return new vscode.Hover(markdown, range);
      },
    }
  );

  context.subscriptions.push(provider, watcher, saveListener, hoverProvider);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
