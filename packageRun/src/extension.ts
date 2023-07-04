import * as vscode from "vscode";
import path from "path";
import { packageDirectorySync } from "pkg-dir";
// let contextRef: vscode.ExtensionContext = {} as any
export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand(
    "packagerun.commands",
    async (Uri: any) => {
      const packageJsonPath = Uri.fsPath;
      // console.log('packageJsonPath :>> ', packageJsonPath);
      await showScriptList(packageJsonPath);
    }
  );
  let disposable2 = vscode.commands.registerCommand(
    "packagerun.key",
    async () => {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        const filePath = activeEditor.document.fileName;
       const pkgPath = await findNearestPackageJson(filePath)
       if(pkgPath){
        await showScriptList(pkgPath,filePath);
       }else{
        vscode.window.showInformationMessage("未找到附近的package.json文件,请手动右键它，并执行packageRun");
       }
      } else {
        vscode.window.showInformationMessage("没有打开的文件");
      }
    }
  );
  context.subscriptions.push(disposable);
  context.subscriptions.push(disposable2);
}

/**
 * @description: 展示指定package全部的脚本列表
 * @param {string} packageJsonPath json路径
 * @return {*}
 */
async function showScriptList(packageJsonPath: string,filePath='') {
  // 获取指定文件的目录的package.json 位置
  const scriptsList: {
    [key: string]: {
      label: string;
      scirpt: string;
      type: "package" | "local";
    };
  } = {};
  // 执行路径
  let runPath = filePath||packageJsonPath
  // 读取package.json文件
  const packageJsonContent = require(packageJsonPath);
  const scripts = packageJsonContent.scripts;
  Object.keys(scripts).forEach((key) => {
    scriptsList["npm run " + key] = {
      label: "npm run " + key,
      scirpt: "npm run " + key,
      type: "package",
    };
  });
  // 选中的脚本
  const selectedScript = await vscode.window.showQuickPick(
    Object.keys(scriptsList),
    {
      placeHolder: "选择要执行的脚本,执行目录为："+  path.dirname(runPath),
    }
  );

  if (selectedScript) {
    vscode.window.showInformationMessage(`执行脚本: ${selectedScript}`);
    // 执行选中的脚本
    const targetScriptObj = scriptsList[selectedScript];

    runTargetScript(
      targetScriptObj.scirpt,
      targetScriptObj.label,
      path.dirname(runPath)
    );
  }
}

/**
 * @description: 执行指定脚本
 * @param {string} script 脚本
 * @param {string} label 名称
 * @param {string} workspaceFolderPath 工作目录
 * @return {*}
 */
function runTargetScript(
  script: string,
  label: string,
  workspaceFolderPath: string
) {
  // 创建一个新的终端实例
  const terminal = vscode.window.createTerminal({
    name: label,
    cwd: workspaceFolderPath,
  });
  terminal.sendText(script);

  // 可选：激活终端面板
  terminal.show();
}

/**
 * @description: 找到最近的package.json
 * @param {string} filePath
 * @return {*}
 */
async function findNearestPackageJson(filePath: string): Promise<string | undefined> {
  const currentDir = path.dirname(filePath);
  const packageJsonFiles = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**');

  let nearestPackageJson: string | undefined;
  let nearestDistance = 9999;

  for (const packageJsonFile of packageJsonFiles) {
    const packageJsonPath = packageJsonFile.fsPath;
    // 根据/分割长度
    const distance = path.relative(currentDir, packageJsonPath).split(path.sep).length;
    // 计算最近的
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestPackageJson = packageJsonPath;
    }
  }

  return nearestPackageJson;
}

export function deactivate() {
  // contextRef = null
}
