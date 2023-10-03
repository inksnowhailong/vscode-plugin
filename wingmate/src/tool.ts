import path = require("path");
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
