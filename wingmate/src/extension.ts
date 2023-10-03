import * as vscode from "vscode";
import util from "./utils";
export function activate(context: vscode.ExtensionContext) {
  // util 引入系统
  context.subscriptions.push(util());
}
