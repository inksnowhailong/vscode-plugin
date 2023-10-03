import * as vscode from "vscode";
import path from "path";
// let contextRef: vscode.ExtensionContext = {} as any
export function activate(context: vscode.ExtensionContext) {
  // 右键package.json
  let disposable = vscode.commands.registerCommand(
    "packagerun.commands",
    async (Uri: any) => {
      const packageJsonPath = Uri.fsPath;
      await showScriptList(packageJsonPath);
    }
  );
  // 使用快捷键
  let disposable2 = vscode.commands.registerCommand(
    "packagerun.key",
    async () => {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        const filePath = activeEditor.document.fileName;
        const pkgPath = await findNearestPackageJson(filePath);
        if (pkgPath) {
          showScriptList(pkgPath, filePath);
        } else {
          vscode.window.showInformationMessage(
            "未找到附近的package.json文件,请手动右键它，并执行packageRun"
          );
        }
      } else {
        vscode.window.showInformationMessage("没有打开的文件");
      }
    }
  );
  context.subscriptions.push(disposable);
  context.subscriptions.push(disposable2);
}

type command = {
  label: string;
  script: string;
  path?: string;
  type: "package" | "local";
};

/**
 * @description: 展示指定package全部的脚本列表
 * @param {string} packageJsonPath json路径
 * @return {*}
 */
async function showScriptList(packageJsonPath: string, filePath = "") {
  // 执行路径
  // let runPath = filePath || packageJsonPath;

  // 获取所有选项
  const scriptsList = await getAllScriptsList(packageJsonPath);

  // 选中的脚本
  const selectedScript = await vscode.window.showQuickPick(
    Object.keys(scriptsList),
    {
      placeHolder: "选择要执行的脚本",
    }
  );
  if (selectedScript) {
    // 执行选中的脚本
    const targetScriptObj = scriptsList[selectedScript];

    let targetPath = "";
    // 没有path或者path为package 就在package.json位置执行 否则就在指定位置执行
    if(!targetScriptObj.path||targetScriptObj.path==='package'){
      targetPath = path.dirname(packageJsonPath);
    }else{
      targetPath = targetScriptObj.path;
    }
    // 打开终端，执行指定命令
    runTargetScript(targetScriptObj.script, targetScriptObj.label, targetPath);
    vscode.window.showInformationMessage(`执行脚本: ${targetScriptObj.script}`);
  }
}

/**
 * @description: 获取不同位置的命令配置
 * @param {string} packageJsonPath package.josn位置
 * @return {*}
 */
async function getAllScriptsList(packageJsonPath: string) {
  // 获取指定文件的目录的package.json 位置
  const scriptsList: {
    [key: string]: command;
  } = {};

  // 读取package.json文件
  const packageJsonContent = await import(packageJsonPath);
  const scripts = packageJsonContent.scripts;
  Object.keys(scripts).forEach((key) => {
    scriptsList["npm run " + key] = {
      label: "npm run " + key,
      script: " npm run " + key,
      type: "package",
    };
  });

  // 获取配置中的命令
  const extensionConfig = vscode.workspace.getConfiguration("packagerun");
  const configOption = extensionConfig.get<Array<any>>("commandOptions");
  configOption?.forEach((item: command) => {
    item.type = "local";
    scriptsList[item.label] = item;
  });
  //读取项目单独配置文件中的内容
  try {
    const configJSON = await import(
      path.resolve(path.dirname(packageJsonPath), "packagerun.config.json")
    );

    configJSON?.commandOptions?.forEach((item: command) => {
      item.type = "local";
      scriptsList[item.label] = item;
    });
  } catch (error) {

  }

  return scriptsList;
}

/**
 * @description: 执行指定脚本
 * @param {string} script 脚本
 * @param {string} label 名称
 * @param {string} workspaceFolderPath 工作目录
 * @return {*}
 */
export function runTargetScript(
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
async function findNearestPackageJson(
  filePath: string
): Promise<string | undefined> {
  const currentDir = path.dirname(filePath);
  const packageJsonFiles = await vscode.workspace.findFiles(
    "**/package.json",
    "**/node_modules/**"
  );

  let nearestPackageJson: string | undefined;
  let nearestDistance = 9999;

  for (const packageJsonFile of packageJsonFiles) {
    const packageJsonPath = packageJsonFile.fsPath;
    // 根据/分割长度
    const distance = path
      .relative(currentDir, packageJsonPath)
      .split(path.sep).length;
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

