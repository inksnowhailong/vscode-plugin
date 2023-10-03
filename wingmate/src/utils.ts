import axios from "axios";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readFile,
  existsSync,
  writeFile,
} from "fs";
import * as Fuse from "fuse.js";
import { dirname, isAbsolute, resolve } from "path";
import * as vscode from "vscode";
import { findNearestPackageJson } from "./tool";
import * as ts from "typescript";
interface AsyncUtil {
  id: number;
  name: string;
  codeType: number;
  tags: string;
  souceCode: string;
  desc: string;
  title: string;
}
/** Supported language type */
const LANGUAGES = [
  "typescriptreact",
  "typescript",
  "javascript",
  "javascriptreact",
];
// 请求到的所有工具函数
const allUtils: AsyncUtil[] = [];
// 搜索相关内容
let fuse = null as any;
export default function () {
  // 执行初始化
  allUtils.length = 0;
  getAllUtils().then((data) => {
    allUtils.push(...data);
    // 创建 搜索功能
    fuse = new (Fuse as any)(allUtils, {
      keys: ["name", "title", "desc"],
    });
  });
  // 注册命令
  regCommand();
  //  一共代码补全来实现的查询功能  示例：@u use| 竖线来触发搜索 use是关键字，@u 是前置触发条件
  return vscode.languages.registerCompletionItemProvider(
    LANGUAGES, // 语言
    {
      provideCompletionItems(document, position, token) {
        const lineTextBeforeCursor = document
          .lineAt(position)
          .text.slice(0, position.character);
        const utIndex = lineTextBeforeCursor.indexOf("@u");
        if (!~utIndex) {
          return undefined;
        }
        // 竖线|位置
        const lineIndex = lineTextBeforeCursor.indexOf("|", utIndex);

        // 查询能够检索到的utils
        const keyWord = lineTextBeforeCursor.slice(utIndex + 3, lineIndex);
        // 设置一个替换代码的范围 因为需要把|和@ut给去掉  +5是因为 @u+一个空格+|一共五个位置
        const range = new vscode.Range(
          position.translate(0, -(keyWord.length + 4)),
          position
        );
        // 查询选项列表
        const filterData: {
          item: AsyncUtil;
          refIndex: number;
        }[] = fuse.search(keyWord);
        // 创建代码提示项
        const ls = filterData.map((data, index) => ({
          documentation: new vscode.MarkdownString().appendCodeblock(
            data.item.souceCode,
            "typescript"
          ),
          insertText: data.item.name,
          label: data.item.name + " " + data.item.title,
          detail: data.item.desc,
          filterText: "@u " + keyWord + "|",
          sortText: index + "",
          command: {
            command: "wingmate.util",
            title: "wingmate.util" + data.item.title,
            arguments: [data.item],
          },
          range,
        }));
        return ls;
      },
    },
    "|"
  );
}
// axios 请求获取utils
async function getAllUtils() {
  const res = await axios.get(
    "https://zingui-node.aihuoshi.net/zingui/utils/getAllUtils?codeType=1"
  );
  //   let code = "";
  let targetData: AsyncUtil[] = res.data?.data || [];

  //   targetData?.forEach((util: AsyncUtil) => (code += "\n" + util.souceCode));
  return targetData;
}

// 创建Utils文件
async function mkUtilsFile(util: AsyncUtil, path: string) {
  // 文件路径
  const utilsPath = resolve(normalizePath(path), `src/utils/${util.name}.ts`);
  // 创建中间目录（如果不存在）
  try {
    mkdirSync(dirname(utilsPath), { recursive: true }); // 使用 recursive 选项自动创建中间目录
  } catch (err: any) {
    if (err.code !== "EEXIST") {
      throw err;
    }
  }
  // 现在可以创建文件并写入内容
  writeFileSync(utilsPath, util.souceCode);
}

// 对绝对和相对路径进行判断
function normalizePath(
  inputPath: string,
  baseDirectory: string = process.cwd()
) {
  // 如果输入路径已经是绝对路径，则直接返回
  if (isAbsolute(inputPath)) {
    return inputPath;
  }

  // 否则，将输入路径解析为绝对路径，并以 baseDirectory 作为基础目录
  return resolve(baseDirectory, inputPath);
}

// 将源代码中的import语句进行处理和融合
function patchImport(sourceCode: string) {
  const importStatements = sourceCode.match(/import .*? from ['"](.+?)['"]/g);
  // 创建一个 Map，用于存储每个库的 import 语句
  const libraryImports = new Map<string, Set<string>>();

  // 遍历所有匹配的 import 语句
  if (importStatements) {
    importStatements.forEach((importStatement) => {
      // 提取库名称或路径和导入的内容
      const match = importStatement.match(/import (.*?) from ['"](.+?)['"]/);
      if (match && match[1] && match[2]) {
        sourceCode = sourceCode.replace(match[0], "");
        const library = match[2];
        const importContent = match[1].trim();
        // 将 import 语句添加到库的数组中
        if (!libraryImports.has(library)) {
          libraryImports.set(library, new Set());
        }
        libraryImports.get(library)?.add(importContent);
      }
    });
  }
  // 创建一个新的源代码字符串，合并相同库的 import 语句
  let mergedSourceCode = sourceCode;
  libraryImports.forEach((importStatements, library) => {
    if (importStatements.size > 0) {
      let destructuring = "";
      // 循环 Set 对 import{xxx} from 'xxx' 和 import xxx from 'xxx' 进行区分
      importStatements.forEach((itemStatements) => {
        if (itemStatements.includes("{") || itemStatements.includes("}")) {
          destructuring =
            destructuring + itemStatements.replace(/{|}/g, "").trim() + ",";
        } else {
          // 使用默认导出（Default Import）方式的 单起一行 加入字符串中
          mergedSourceCode =
            `import ${itemStatements} from '${library}'\n` + mergedSourceCode;
        }
      });

      // 解构引用的内容也加进来
      if (destructuring) {
        destructuring = [
          ...new Set(destructuring.replace(/\s/g, "").split(",")),
        ].join(",");

        mergedSourceCode =
          `import {${destructuring}} from '${library}'\n` + mergedSourceCode;
      }
    }
  });
  // 对此文件 关闭eslint监测
  mergedSourceCode = `/* eslint-disable */\n` + mergedSourceCode;
  return mergedSourceCode;
}
// 注册一共命令，当选择了某个utils代码补全函数时候，触发去修改 vite.config里面的zingUtilsInstall
function regCommand() {
  vscode.commands.registerCommand("wingmate.util", async (util: AsyncUtil) => {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const filePath = activeEditor.document.fileName;
      const pkgPath = await findNearestPackageJson(filePath);
      if (!pkgPath) {
        return;
      }
      // vite路径
      const vitePath = resolve(dirname(pkgPath), "vite.config.ts");

      // 读取 vite 文件内容
      readFile(vitePath, "utf-8", (err, configCode) => {
        if (err) {
          // 发生错误时处理
          // 没有使用的时候的处理
          mkUtilsFile(util, dirname(pkgPath));
          // createImportCode(activeEditor, dirname(pkgPath), util.name);
          return;
        }
        // 使用正则表达式匹配 import xxx from 'zingutilsinstall'语句
        const importRegex = /import\s+(.*?)\s+from\s+['"]zingutilsinstall['"]/;
        const match = importRegex.exec(configCode);
        // 有使用zingutilsinstall这个插件 match[1] 是因为 zingutilsinstall变量的impor命名未必是什么
        if (match && match[1]) {
          // 有使用zingutilsinstall这个插件 的处理
          // 使用正则表达式匹配函数调用
          const regex = new RegExp(
            `(${(match as unknown as string)[1]})\\s*\\(\\s*({[^}]+})\\s*\\)`
          );
          // 匹配 zingutilsinstall 的调用
          const methodMatch = regex.exec(configCode);

          if (methodMatch) {
            const argumentsString = methodMatch[2];
            // 如果参数是一个JSON对象，你可以将其解析成JavaScript对象
            try {
              // 获取到 zingutilsinstall插件的配置
              const zingutilsinstallConfig = eval(`(${argumentsString})`);
              // 如果有include ，就加入util
              if (!zingutilsinstallConfig.include?.includes(util.name)) {
                zingutilsinstallConfig.include?.push(util.name);
              }
              // 如果有exclude，就删除里面的util
              if (zingutilsinstallConfig.exclude?.includes(util.name)) {
                zingutilsinstallConfig.exclude.splice(
                  zingutilsinstallConfig.exclude.indexOf(util.name),
                  1
                );
              }
              // 将旧的config 修改掉
              const newFileContent = configCode.replace(
                argumentsString,
                JSON.stringify(zingutilsinstallConfig)
              );
              //写回文件
              writeFileSync(vitePath, newFileContent, "utf8");
              // createImportCode(activeEditor, dirname(pkgPath), util.name);
            } catch (error) {
              console.error("Error parsing :", error);
            }
          }
        } else {
          // 没有使用的时候的处理
          mkUtilsFile(util, dirname(pkgPath));
          // createImportCode(activeEditor, dirname(pkgPath), util.name);
        }
      });
    }
  });
}
// 加入import 语句
function createImportCode(
  activeEditor: vscode.TextEditor,
  path: string,
  utilName: string
) {

  // 获取当前编辑器的文档 URI
  const uri = activeEditor.document.uri;
  // 从 URI 中获取文件扩展名
  const fileExtension = uri.fsPath.split(".").pop();
  console.log('object :>> ', uri,fileExtension);
  // uri
  const utilsPath = resolve(normalizePath(path), `src/utils/${utilName}.ts`);
  const codeToInsert = `imort {${utilName}} from '@/utils/${utilName}.ts';\n`;
  if (["ts", "tsx"].includes(fileExtension as string)) {

    // 读取文件内容
    readFile(utilsPath, "utf8", (err, data) => {
      if (err) {
        console.error(`读取文件时出错：${err}`);
        return;
      }

      // 在文件内容的开头插入代码
      const newData = codeToInsert + data;

      // 写入文件
      writeFile(utilsPath, newData, "utf8", (err) => {
        if (err) {
          console.error(`写入文件时出错：${err}`);
          return;
        }

        console.log("代码已成功插入到文件开头！");
      });
    });
  }else if(['vue'].includes(fileExtension as string)){
  }
}
