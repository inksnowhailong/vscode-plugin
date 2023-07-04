// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "packagerun" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand("run.dev", async (Uri:any) => {
    const packageJsonPath =Uri.fsPath
    // 获取指定文件的目录的package.json 位置
      // vscode.workspace.getWorkspaceFolder() + "/package.json";
    const packageJsonContent = require(packageJsonPath)
    console.log("packageJsonContent :>> ", packageJsonContent);
    const scripts = packageJsonContent.scripts;
    const scriptNames = Object.keys(scripts);
    console.log("scriptNames :>> ", scriptNames);
    const selectedScript = await vscode.window.showQuickPick(scriptNames, {
      placeHolder: "选择要执行的 npm 脚本",
    });

    if (selectedScript) {
      vscode.window.showInformationMessage(`执行脚本: ${selectedScript}`);
      // 执行选中的脚本
      await vscode.commands.executeCommand("npm.runScript", selectedScript);
    }
  });
  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
