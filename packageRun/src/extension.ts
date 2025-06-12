import * as vscode from "vscode";
import path from "path";
import * as fs from "fs";

// ==================== 类型定义 ====================
/**
 * 命令配置类型
 */
type command = {
  label: string;
  script: string;
  path?: string;
  type: "package" | "local";
};

/**
 * 缓存项类型
 */
interface CacheItem {
  timestamp: number;
  data: any;
}

// ==================== 全局变量 ====================
let outputChannel: vscode.OutputChannel;
const cache = new Map<string, CacheItem>();
const CACHE_DURATION = 10000; // 缓存有效期10秒

// ==================== 缓存管理 ====================
/**
 * 获取缓存数据
 * @param key 缓存键
 * @returns 缓存数据或null
 */
function getCache<T>(key: string): T | null {
  const item = cache.get(key);
  if (!item) return null;

  if (Date.now() - item.timestamp > CACHE_DURATION) {
    cache.delete(key);
    return null;
  }

  return item.data as T;
}

/**
 * 设置缓存数据
 * @param key 缓存键
 * @param data 要缓存的数据
 */
function setCache<T>(key: string, data: T): void {
  cache.set(key, {
    timestamp: Date.now(),
    data
  });
}

// ==================== 文件操作 ====================
/**
 * 找到最近的package.json文件
 * @param filePath 当前文件路径
 * @returns package.json的路径或undefined
 */
async function findNearestPackageJson(filePath: string): Promise<string | undefined> {
  const cacheKey = `nearest_pkg_${filePath}`;
  const cached = getCache<string>(cacheKey);
  if (cached) return cached;

  // 创建状态栏项
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  statusBarItem.text = "$(search) 正在搜索 package.json...";
  statusBarItem.show();

  try {
    const currentDir = path.dirname(filePath);
    const packageJsonFiles = await vscode.workspace.findFiles(
      "**/package.json",
      "**/node_modules/**"
    );

    let nearestPackageJson: string | undefined;
    let nearestDistance = 9999;

    for (const packageJsonFile of packageJsonFiles) {
      const packageJsonPath = packageJsonFile.fsPath;
      const distance = path.relative(currentDir, packageJsonPath).split(path.sep).length;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPackageJson = packageJsonPath;
      }
    }

    if (nearestPackageJson) {
      setCache(cacheKey, nearestPackageJson);
      statusBarItem.dispose(); // 找到就直接关闭提示
    } else {
      statusBarItem.text = "$(error) 未找到 package.json";
      setTimeout(() => statusBarItem.dispose(), 2000);
    }

    return nearestPackageJson;
  } catch (error) {
    statusBarItem.dispose();
    return undefined;
  }
}

// ==================== 脚本管理 ====================
/**
 * 获取所有可用的脚本列表
 * @param packageJsonPath package.json文件路径
 * @returns 脚本列表对象
 */
async function getAllScriptsList(packageJsonPath: string) {
  const cacheKey = `scripts_list_${packageJsonPath}`;
  const cached = getCache<Record<string, command>>(cacheKey);
  if (cached) return cached;

  outputChannel.appendLine(`正在读取 package.json: ${packageJsonPath}`);
  const scriptsList: Record<string, command> = {};

  try {
    const packageJsonContent = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    outputChannel.appendLine(`成功读取 package.json，包含 ${Object.keys(packageJsonContent.scripts || {}).length} 个脚本`);

    // 并行处理所有配置源
    await Promise.all([
      processPackageJsonScripts(packageJsonContent.scripts || {}, scriptsList),
      processExtensionConfig(scriptsList),
      processProjectConfig(packageJsonPath, scriptsList)
    ]);

    setCache(cacheKey, scriptsList);
    return scriptsList;
  } catch (error) {
    outputChannel.appendLine(`读取 package.json 失败: ${error}`);
    vscode.window.showErrorMessage(`读取 package.json 失败: ${error}`);
    return scriptsList;
  }
}

/**
 * 处理package.json中的脚本
 */
async function processPackageJsonScripts(scripts: Record<string, string>, scriptsList: Record<string, command>) {
  Object.keys(scripts).forEach((key) => {
    scriptsList["npm run " + key] = {
      label: "npm run " + key,
      script: " npm run " + key,
      type: "package",
    };
  });
}

/**
 * 处理扩展配置
 */
async function processExtensionConfig(scriptsList: Record<string, command>) {
  const extensionConfig = vscode.workspace.getConfiguration("packagerun");
  const configOption = extensionConfig.get<Array<any>>("commandOptions");
  configOption?.forEach((item: command) => {
    item.type = "local";
    scriptsList[item.label] = item;
  });
}

/**
 * 处理项目配置文件
 */
async function processProjectConfig(packageJsonPath: string, scriptsList: Record<string, command>) {
  try {
    const configPath = path.resolve(path.dirname(packageJsonPath), "packagerun.config.json");
    if (fs.existsSync(configPath)) {
      const configJSON = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      configJSON?.commandOptions?.forEach((item: command) => {
        item.type = "local";
        scriptsList[item.label] = item;
      });
    }
  } catch (error) {
    // 配置文件不存在或解析失败时静默处理
  }
}

/**
 * 展示脚本列表并执行选中的脚本
 * @param packageJsonPath package.json文件路径
 * @param filePath 当前文件路径
 */
async function showScriptList(packageJsonPath: string, filePath = "") {
  const scriptsList = await getAllScriptsList(packageJsonPath);

  const selectedScript = await vscode.window.showQuickPick(
    Object.keys(scriptsList),
    {
      placeHolder: "选择要执行的脚本",
    }
  );

  if (selectedScript) {
    const targetScriptObj = scriptsList[selectedScript];
    const targetPath = !targetScriptObj.path || targetScriptObj.path === "package"
      ? path.dirname(packageJsonPath)
      : targetScriptObj.path;

    runTargetScript(targetScriptObj.script, targetScriptObj.label, targetPath);
    vscode.window.showInformationMessage(`执行脚本: ${targetScriptObj.script}`);
  }
}

/**
 * 执行目标脚本
 * @param script 要执行的脚本
 * @param label 脚本标签
 * @param workspaceFolderPath 工作目录
 */
function runTargetScript(script: string, label: string, workspaceFolderPath: string) {
  const terminal = vscode.window.createTerminal({
    name: label,
    cwd: workspaceFolderPath,
  });
  terminal.sendText(script);
  terminal.show();
}

// ==================== 扩展激活 ====================
export function activate(context: vscode.ExtensionContext) {
  // 创建输出通道
  outputChannel = vscode.window.createOutputChannel("PackageRun");
  outputChannel.appendLine("PackageRun 扩展已激活");

  // 注册右键菜单命令
  context.subscriptions.push(
    vscode.commands.registerCommand("packagerun.commands", async (Uri: any) => {
      await showScriptList(Uri.fsPath);
    })
  );

  // 注册快捷键命令
  context.subscriptions.push(
    vscode.commands.registerCommand("packagerun.key", async () => {
      const activeEditor = vscode.window.activeTextEditor;

      if (activeEditor) {
        // 处理活动编辑器的情况
        const filePath = activeEditor.document.fileName;
        const pkgPath = await findNearestPackageJson(filePath);
        if (pkgPath) {
          showScriptList(pkgPath, filePath);
        } else {
          vscode.window.showInformationMessage(
            "未找到附近的package.json文件,请手动右键它，并执行packageRun"
          );
        }
      } else if (vscode.workspace.workspaceFolders?.length) {
        // 处理工作区的情况
        await handleWorkspaceFolders();
      } else {
        vscode.window.showInformationMessage("请打开一个项目或文件，将自动找到package.json文件");
      }
    })
  );
}

/**
 * 处理工作区文件夹
 */
async function handleWorkspaceFolders() {
  if (!vscode.workspace.workspaceFolders) {
    return;
  }

  const spaceOptions = vscode.workspace.workspaceFolders.reduce((pre, cur) => {
    pre[cur.name] = cur.uri.fsPath;
    return pre;
  }, {} as Record<string, string>);

  const selectedScript = vscode.workspace.workspaceFolders.length > 1
    ? await vscode.window.showQuickPick(Object.keys(spaceOptions), {
        placeHolder: "选择要执行命令的项目",
      })
    : Object.keys(spaceOptions)[0];

  if (!selectedScript) return;

  const pkgPath = await findNearestPackageJson(spaceOptions[selectedScript]);
  if (pkgPath) {
    showScriptList(pkgPath);
  } else {
    vscode.window.showInformationMessage(
      "未找到附近的package.json文件,请手动右键它，并执行packageRun"
    );
  }
}

export function deactivate() {
  outputChannel.appendLine("PackageRun 扩展已停用");
  outputChannel.dispose();
}
