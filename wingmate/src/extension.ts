import * as vscode from "vscode";
import util from "./utils";
import api from "./api";
export function activate(context: vscode.ExtensionContext) {
  // util 引入系统
  context.subscriptions.push(util());
  // api解析
  context.subscriptions.push(api());
}
