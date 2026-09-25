// Jesun.Code VS Code extension: one command, run the current .jc file.
// Uses the `jesun` binary when it is on PATH, else falls back to the
// interpreter next to this extension (editors/vscode -> repo root).
const vscode = require("vscode");
const path = require("path");
const { execSync } = require("child_process");

function jesunBinary() {
  try {
    execSync("jesun --version", { stdio: "ignore" });
    return "jesun";
  } catch (_) {
    return null;
  }
}

function activate(context) {
  const run = vscode.commands.registerCommand("jesun-code.runFile", () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "jesun-code") {
      vscode.window.showWarningMessage("Open a Jesun.Code (.jc) file first.");
      return;
    }
    const file = editor.document.fileName;
    editor.document.save().then(() => {
      const term = vscode.window.createTerminal("Jesun.Code");
      term.show();
      const q = (f) => `"${f.replace(/"/g, '\\"')}"`;
      const bin = jesunBinary();
      const cmd = bin
        ? `${bin} ${q(file)}`
        : `python ${q(path.join(__dirname, "..", "..", "jesun.py"))} ${q(file)}`;
      term.sendText(cmd);
    });
  });
  context.subscriptions.push(run);
}

function deactivate() {}

module.exports = { activate, deactivate };
