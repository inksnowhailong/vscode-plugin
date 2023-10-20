import * as vscode from "vscode";
import util from "./utils";
import api from "./api";
export function activate(context: vscode.ExtensionContext) {
  // util 引入系统
  context.subscriptions.push(util());
  // api解析
  context.subscriptions.push(api());
  // performTaskWithProgress();
}

async function performTaskWithProgress() {
  // 定义进度条的配置选项
  const progressOptions = {
    location: vscode.ProgressLocation.Notification,
    title: "执行任务中...",
    cancellable: true, // 允许用户取消任务
  };

  // 使用 withProgress 方法创建进度条
  await vscode.window.withProgress(progressOptions, async (progress) => {
    // 模拟一个耗时操作
    for (let i = 0; i <= 100; i++) {
      // 报告进度（increment 表示进度的增量，message 是可选的描述信息）
      progress.report({ increment: 1, message: `进度: ${i}%` });

      // 模拟一个耗时操作
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 任务完成后报告成功
    vscode.window.showInformationMessage("任务完成");
  });
}
