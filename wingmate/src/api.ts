import { execSync } from "child_process";
import puppeteer from "puppeteer-core";
import * as vscode from "vscode";
import { platform } from "os";
import { mkdirSync, readFile, readFileSync, readSync, writeFileSync } from "fs";
import { findNearestPackageJson } from "./tool";
import { dirname, resolve, sep } from "path";
const LANGUAGES = ["typescriptreact", "typescript", "vue"];

interface SpiderDataType {
  method: string;
  url: string;
  desc: string;
  paramsType: string;
  resType: string;
}

type PageModule =
  | "响应参数"
  | "响应状态"
  | "响应示例"
  | "接口描述"
  | "请求参数"
  | "请求示例";

export default function () {
  // 注册命令
  regCommand();
  return vscode.languages.registerCompletionItemProvider(
    LANGUAGES, // 语言
    {
      async provideCompletionItems(document, position, token) {
        const lineTextBeforeCursor = document
          .lineAt(position)
          .text.slice(0, position.character);
        const utIndex = lineTextBeforeCursor.indexOf("@api");
        if (!~utIndex || !lineTextBeforeCursor.includes("|")) {
          return undefined;
        }
        // 竖线|位置
        const lineIndex = lineTextBeforeCursor.indexOf("|", utIndex);

        // 提取关键参数
        const url = lineTextBeforeCursor.slice(utIndex + 5, lineIndex);
        const range = new vscode.Range(
          position.translate(0, -(url.length + 6)),
          position
        );
        // 爬虫爬取内容
        const pageData = await spiderHtmlData(url);
        // 创建代码提示项
        if (!pageData) {
          return [];
        }
        // 使用模板 生成接口代码
        const { apiName, apiCode } = createApiCode(pageData, url);
        console.log("apiCode :>> ", apiCode);
        return [
          {
            documentation: new vscode.MarkdownString().appendCodeblock(
              apiCode,
              "typescript"
            ),
            insertText: apiName,
            label: "生成api接口 " + apiName,
            detail: "生成api接口 " + apiName,
            filterText: "@api " + url + "|",
            command: {
              command: "wingmate.api",
              title: "wingmate.api",
              arguments: [pageData, apiName, apiCode],
            },
            range,
          },
        ];
      },
    },
    "|"
  );
}
// 链接网页 爬取内容
async function spiderHtmlData(
  url: string
): Promise<SpiderDataType | undefined> {
  if (!url.includes("http")) {
    return;
  }

  const progressOptions = {
    location: vscode.ProgressLocation.Notification,
    title: "爬取接口页面内容",
    cancellable: false,
  };
  // 搞一个promise拦截器 在爬取任务在进度内完成后 进行resolve
  const pageData: SpiderDataType = await new Promise((resolve) => {
    vscode.window.withProgress(progressOptions, async (progress) => {
      // 获取谷歌路径
      const chromePath = getChromePath();
      progress.report({ increment: 10, message: "开始爬取..." });
      try {
        progress.report({ increment: 20, message: "创建浏览器实例..." });
        const browser = await puppeteer.launch({
          executablePath: chromePath || "",
          // headless: false,
        });
        progress.report({ increment: 30, message: "进入页面..." });
        const page = await browser.newPage();
        await page.goto(url);
        progress.report({ increment: 70, message: "dom数据提取处理..." });
        await page.waitForSelector(".knife4j-api-summary");

        const pageData: SpiderDataType = await page.evaluate(parseAllPageData);
        progress.report({ increment: 100, message: "内容提取完成..." });
        browser.close();
        resolve(pageData);
      } catch (error) {
        console.log("error>>", error);
      }
    });
  });
  return pageData;
  // const progress = await createProgress();
}
// 执行js代码 在页面中得到数据
function parseAllPageData() {
  // 请求method和url地址的信息
  // @ts-ignore
  const urlAndMethod: string[] = document
    .getElementsByClassName("knife4j-api-summary")[0]
    ?.textContent?.trim()
    ?.split(" ");
  console.log("urlAndMethod :>> ", urlAndMethod);
  // 描述信息
  // @ts-ignore
  const desc =
    document.getElementsByClassName("api-body-desc")[0]?.textContent || "";
  // 所有表格和示例代码的DOM元素
  const titleObj: Record<PageModule, HTMLElement> = Array.from(
    document.getElementsByClassName("api-title")
  ).reduce((pre, cur) => {
    // 标题的下一个元素 就是表格或者代码示例
    pre[cur.textContent as PageModule] = cur.nextElementSibling as HTMLElement;
    return pre;
  }, {} as Record<PageModule, HTMLElement>);
  //参数相关数据
  const paramsType = paramsdataToTS(parseTableData(titleObj["请求参数"])?.[0]);
  const resType = resDataToTs(parseTableData(titleObj["响应参数"]));
  // 解析table数据函数 必须定义在这里 因为page.evaluate里面的作用域 引用不到当前文件内定义的东西
  function parseTableData(table: HTMLElement) {
    // 获取表格头部和数据行
    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");
    if (!thead || !tbody) {
      return;
    }

    // 获取表格的列数
    // const columnCount = thead.querySelectorAll("th").length;

    // 初始化一个空的JSON数组，用于存储表格数据
    const data: Record<string, any> = { children: [], pre: {} };
    // 每个tr都是一行,有可能出现嵌套情况
    function parsetrData(row: any, box: Record<string, any>) {
      const rowData: Record<string, any> = {
        children: [], //子
        pre: box, //父
      };

      row.querySelectorAll("td").forEach((cell: any, index: any) => {
        const columnName = (thead as HTMLTableSectionElement).querySelectorAll(
          "th"
        )[index].textContent;
        rowData[columnName as string] = cell.textContent;
      });
      box.children.push(rowData);
      // 查看这个tr的级别
      const level = row.classList[1].at(-1);
      //  查看下一个元素
      const nextDOM = row.nextElementSibling;
      if (nextDOM) {
        if (nextDOM.classList[1].at(-1) > level) {
          parsetrData(nextDOM, rowData);
        } else if (nextDOM.classList[1].at(-1) === level) {
          parsetrData(nextDOM, box);
        } else if (nextDOM.classList[1].at(-1) < level) {
          parsetrData(nextDOM, box.pre);
        }
      }
    }
    parsetrData(tbody.querySelectorAll("tr")[0], data);

    return data.children;
  }
  // parseTableData的数据 转换为Ts类型  对于请求参数的
  function paramsdataToTS(data: Record<string, any> | undefined) {
    if (!data) {
      return "Record<string,any>";
    }

    // 首先得到的表格解析后的数据 第一层  会包含整个请求参数的外层类型
    try {
      if (data["请求类型"] === "body") {
        let begin = "{\n";
        data.children.forEach((paramItem: any) => {
          let itemType = javaToTs(paramItem["数据类型"]);

          //对于数组和对象 就再判断一层，第三层就不判断了，顶多判断两
          try {
            if (
              (itemType.includes("Array") || itemType.includes("Record")) &&
              paramItem.children.length > 0
            ) {
              let childbegin = "{\n";
              paramItem.children.forEach((paramChild: any) => {
                const childItemType = javaToTs(paramChild["数据类型"]);
                childbegin += `${paramChild["参数名称"]}${
                  paramChild["是否必须"] === "true" ? "" : "?"
                }:${childItemType};\/\/ ${paramChild["参数说明"]}\n`;
              });
              itemType = itemType.replace("any", childbegin + "}");
            }
          } catch (error) {
            itemType = javaToTs(paramItem["数据类型"]);
          }

          begin += `${paramItem["参数名称"]}${
            paramItem["是否必须"] === "true" ? "" : "?"
          }:${itemType};\/\/ ${paramItem["参数说明"]}\n`;
        });
        return begin + "}"+( data["数据类型"].includes("array") ? "[]" : "");
      } else if (data["请求类型"] === "path") {
        return `{${data["参数名称"]}${data["是否必须"] === "true" ? "" : "?"}:${
          data["数据类型"]
        }}`;
      }
    } catch (error) {
      return "Record<string,any>";
    }
    return "Record<string,any>";
  }
  //parseTableData的数据 转换为Ts类型  对于响应参数的
  function resDataToTs(data: Record<string, any>[] | undefined) {
    const baseRes = `{code:number;data:any;error:boolean;message:string;success:boolean;}`;
    if (!data) {
      return baseRes;
    }
    try {
      let resTypeStr = "";
      data.find((item) => {
        if (item["参数名称"] === "data") {
          if (item.children.length > 0) {
            let begin = "{\n";
            item.children.forEach((dataItem: any) => {
              let itemType = javaToTs(dataItem["类型"]);
              //对于数组和对象 就再判断一层，第三层就不判断了，顶多判断两
              try {
                if (
                  (itemType.includes("Array") || itemType.includes("Record")) &&
                  dataItem.children.length > 0
                ) {
                  let childbegin = "{\n";
                  dataItem.children.forEach((paramChild: any) => {
                    const childItemType = javaToTs(paramChild["类型"]);
                    childbegin += `${paramChild["参数名称"]}:${childItemType};\/\/ ${paramChild["参数说明"]}\n`;
                  });
                  itemType = itemType.replace("any", childbegin + "}");
                }
              } catch (error) {
                itemType = javaToTs(dataItem["类型"]);
              }
              begin += `${dataItem["参数名称"]}:${itemType};\/\/ ${dataItem["参数说明"]}\n`;
            });

            resTypeStr =
              begin + "}" + (item["类型"].includes("array") ? "[]" : "");
          } else {
            resTypeStr = javaToTs(item["类型"]);
          }

          return true;
        }
      });
      return baseRes.replace("any", resTypeStr);
    } catch (error) {
      return baseRes;
    }
  }

  // java类型转ts
  function javaToTs(type: string) {
    if (type.includes("string")) {
      return "string";
    }
    if (type.includes("integer") || type.includes("number")) {
      return "number";
    }
    if (type.includes("object")) {
      return "Record<string,any>";
    }
    if (type.includes("array")) {
      return "Array<any>";
    }
    return "any";
  }
  return {
    method: urlAndMethod[0],
    url: urlAndMethod[1],
    desc,
    paramsType,
    resType,
  };
}
// 获取谷歌路径
function getChromePath() {
  try {
    if (platform() === "win32") {
      // For Windows
      const result = execSync(
        'reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe" /v Path'
      );

      let path = result.toString().split(/\s+/).slice(4).join(" ").trim();
      path = path.replace("REG_SZ ", "");
      path += "\\chrome.exe";
      return path;
    } else if (platform() === "darwin") {
      // For macOS
      // const result = execSync(
      //   `mdfind kMDItemFSName="Google Chrome.app"`
      // );
      // const paths = result.toString().split("\n").filter(Boolean);
      // if (paths.length > 0) {
      //   return paths[0];
      // }
      return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    }
  } catch (error: any) {
    console.error("Error:", error.message);
  }

  return null;
}

// 注册一个命令， 创建api文件和函数
function regCommand() {
  vscode.commands.registerCommand(
    "wingmate.api",
    async (pageData: SpiderDataType, apiName: string, apiCode: string) => {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        const filePath = activeEditor.document.fileName;
        const pkgPath = await findNearestPackageJson(filePath);
        if (!pkgPath) {
          return;
        }
        if (filePath.includes("views")) {
          const targetUrl = filePath.split("views")[1].split(sep);
          // 大于2，正面是views下的某个目录里面的文件， 如果不大于2，文件就在views下面
          if (targetUrl.length > 2) {
            const targetModule = targetUrl[1];
            createApifileAndWrite(targetModule);
          } else {
            createApifileAndWrite("common");
          }
        } else {
          createApifileAndWrite("common");
        }
        // 创建并写入api信息
        function createApifileAndWrite(module: string) {
          // 创建中间目录（如果不存在）
          const apiFile =
            module !== "common"
              ? resolve(filePath.split("views")[0], `api/${module}.ts`)
              : resolve(dirname(pkgPath as string), `src/api/${module}.ts`);
          try {
            mkdirSync(dirname(apiFile), { recursive: true }); // 使用 recursive 选项自动创建中间目录
          } catch (err: any) {
            if (err.code !== "EEXIST") {
              throw err;
            }
          }

          // 读取 vite 文件内容
          readFile(apiFile, "utf-8", (err, tsCode) => {
            if (err) {
              console.log("error :>> ", err);
              // 发生错误时处理
              const tsCode =
                `import actionRequest from '@/utils/request';\n` + apiCode;
              writeFileSync(apiFile, tsCode);
              return;
            }
            // 没有引入axios封装的方法就从默认路径引入
            if (!tsCode.includes("actionRequest")) {
              tsCode =
                `import actionRequest from '@/utils/request';\n` + tsCode;
            }
            if (!tsCode.includes(apiName)) {
              tsCode += apiCode;
              writeFileSync(apiFile, tsCode);
            }
          });
        }
      }
    }
  );
}
// 创建 api文件里面的内容
function createApiCode(pageData: SpiderDataType, url: string) {
  // 使用正则表达式匹配 /a/{xxx} 部分  这种特殊的路径中参数处理
  const regex = /(.*)\/\{(\w+)\}/;
  const match = pageData.url.match(regex);
  let path = pageData.url;
  let endParams = "";
  if (match) {
    path = match[1];
    endParams = match[2];
  }

  // 大驼峰格式的命名
  const caml = path
    .split("/")
    .map((word) => {
      // 将每个单词的首字母大写
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join("");

  const code = `
/**
 * @description: ${pageData.desc}
 * @param {P} data
 * @type {T} ${pageData.method}
 * @doc {string} ${url}
 * @return {R}
 */
export const ${pageData.method.toLowerCase() + caml} =     <P extends ${
    pageData.paramsType
  },R extends Promise<${pageData.resType}>>(data:P):R => {
  return actionRequest({
    url: '${path}'${endParams ? `+'/'+data.${endParams}` : ""},
    method: '${pageData.method.toLowerCase()}',
    ${pageData.method.toLowerCase() === "get" ? "params" : "data"}: data
  }) as unknown as R
}

`;
  return {
    apiName: pageData.method.toLowerCase() + caml,
    apiCode: code,
  };
}
