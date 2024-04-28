import path = require("path");
import { dirname, resolve } from "path";
import * as vscode from "vscode";
/**
 * @description: 找到最近的package.json
 * @param {string} filePath
 * @return {*}
 */
export async function findNearestPackageJson(
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

export async function getOptions() {
  const baseOption = {
    apiFileMode: "api",
    exePath: "",
  };
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {
    return baseOption;
  }
  const filePath = activeEditor.document.fileName;
  const pkgPath = await findNearestPackageJson(filePath);
  if (!pkgPath) {
    return baseOption;
  }

  let extensionConfig = vscode.workspace.getConfiguration("wingmate");
   baseOption.apiFileMode = extensionConfig.get<string>("apiFileMode") as string;
   baseOption.exePath = extensionConfig.get<string>("exePath") as string;

  try {
    //读取项目单独配置文件中的内容
    const configJSON = await import(
      resolve(dirname(pkgPath), "wingmate.config.json")
    );
    // console.log('configJSON :>> ', configJSON);
    if (configJSON.apiFileMode) {
      baseOption.apiFileMode = configJSON.apiFileMode;
    }
    if (configJSON.exePath) {
      baseOption.exePath = configJSON.exePath;
    }
  } catch (error) {
    console.log('error :>> ', error);
  }
  return baseOption;
}
