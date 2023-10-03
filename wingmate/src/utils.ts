import axios from "axios";
import { mkdirSync, writeFileSync } from "fs";
import * as Fuse from "fuse.js";
import type FuseType from "fuse.js";
import { dirname, isAbsolute, resolve } from "path";
import * as vscode from "vscode";

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
  /*
       const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        const filePath = activeEditor.document.fileName;
        const pkgPath = await findNearestPackageJson(filePath);
    */
  //  一共代码补全来实现的查询功能  示例：@u use| 竖线来触发搜索 use是关键字，@u 是前置触发条件
  return vscode.languages.registerCompletionItemProvider(
    LANGUAGES, // 语言
    {
      provideCompletionItems(document, position, token) {
        const lineTextBeforeCursor = document
          .lineAt(position)
          .text.slice(0, position.character);
        const utIndex= lineTextBeforeCursor.indexOf("@u");
        if (!~utIndex) {
          return undefined;
        }
        // 竖线|位置
        const lineIndex = lineTextBeforeCursor.indexOf("|",utIndex);

        // 查询能够检索到的utils
        const keyWord = lineTextBeforeCursor.slice(
          utIndex+3,lineIndex
        );
          // 设置一个替换代码的范围 因为需要把|和@ut给去掉  +5是因为 @u+一个空格+|一共五个位置
          const range = new vscode.Range(position.translate(0, -(keyWord.length+4)), position);
        // 查询选项列表
        const filterData: {
          item: AsyncUtil;
          refIndex: number;
        }[] = fuse.search(keyWord);
        // 创建代码提示项
        const ls = filterData.map((data,index) => ({
          documentation: new vscode.MarkdownString().appendCodeblock(
            data.item.souceCode,
            "typescript"
          ),
          insertText: data.item.name,
          label: data.item.name + " " + data.item.title,
          detail: data.item.desc,
          filterText: "@u "+keyWord+'|',
          sortText:index+'',
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
function mkUtilsFile(tsMessage: string, path: string) {
  // 有传入的路径，就在传入的路径进行创建，否则使用默认路径
  const utilsPath = path
    ? resolve(normalizePath(path), "zingUtils.ts")
    : resolve(process.cwd(), "src/utils/zingUtils.ts");

  // 创建中间目录（如果不存在）
  try {
    mkdirSync(dirname(utilsPath), { recursive: true }); // 使用 recursive 选项自动创建中间目录
  } catch (err: any) {
    if (err.code !== "EEXIST") {
      throw err;
    }
  }

  // 现在可以创建文件并写入内容
  writeFileSync(utilsPath, tsMessage);
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
function regCommand(){
  vscode.commands.registerCommand('wingmate.util', (utilName) => {
    // 在这里执行你的操作
    vscode.window.showInformationMessage('My Command Executed!');
  });
}
