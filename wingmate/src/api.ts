import { execSync } from "child_process";
import puppeteer from "puppeteer-core";
import * as vscode from "vscode";
import { platform } from "os";
import { mkdirSync, readFile, readFileSync, readSync, writeFileSync } from "fs";
import { findNearestPackageJson, getOptions } from "./tool";
import { dirname, resolve, sep } from "path";
const LANGUAGES = ["typescriptreact", "typescript", "vue"];

interface SpiderDataType {
  method: string;
  url: string;
  desc: string;
  paramsType: string;
  paramsData: Record<string, any>;
  resType: string;
  resData: Record<string, any>;
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
        const { apiName, apiCode, paramsType, resultType } = createApiCode(
          pageData,
          url
        );
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
              arguments: [pageData, apiName, apiCode, paramsType, resultType],
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
      // 获取配置中的命令
      const { exePath } = await getOptions();
      const chromePath = exePath ? exePath : getChromePath();
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
        // 解析ts类型信息
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

  // const paramsType = paramsdataToTS(parseTableData(titleObj["请求参数"])?.[0]);
  // const resType = resDataToTs(parseTableData(titleObj["响应参数"]));
  //参数相关数据
  const paramsData = parseTableData(titleObj["请求参数"]);
  const paramsType = paramsdataToTS(paramsData?.[0]);
  // 返回值相关
  const resData = parseTableData(titleObj["响应参数"]);
  console.log("resData :>> ", resData);
  const resType = resDataToTs(resData);

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
    if (tbody.querySelectorAll("tr")?.[0]) {
      parsetrData(tbody.querySelectorAll("tr")[0], data);
    }

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
        let begin = `{\n`;
        data.children.forEach((paramItem: any) => {
          let itemType = javaToTs(paramItem["数据类型"]);

          //对于数组和对象 就再判断一层，第三层就不判断了，顶多判断两
          try {
            if (
              (itemType.includes("Array") || itemType.includes("Record")) &&
              paramItem.children.length > 0
            ) {
              let childbegin = `{\n`;
              paramItem.children.forEach((paramChild: any) => {
                const childItemType = javaToTs(paramChild["数据类型"]);
                childbegin += `  /**
     * ${paramChild["参数说明"]}
     */\n`;
                childbegin += `  ${paramChild["参数名称"]}${
                  paramChild["是否必须"] === "true" ? "" : "?"
                }: ${childItemType}\n`;
              });
              itemType = itemType.replace("any", childbegin + "}");
            }
          } catch (error) {
            itemType = javaToTs(paramItem["数据类型"]);
          }
          begin += `  /**
   * ${paramItem["参数说明"]}
   */\n`;
          begin += `  ${paramItem["参数名称"]}${
            paramItem["是否必须"] === "true" ? "" : "?"
          }: ${itemType}\n`;
        });
        return begin + "}" + (data["数据类型"].includes("array") ? "[]" : "");
      } else {
        data = data.pre as Record<string, any>;
        let begin = `{\n`;
        data.children.forEach((paramItem: any) => {
          let itemType = javaToTs(paramItem["数据类型"]);
          begin += `  /**
     * ${paramItem["参数说明"]}
     */\n`;
          begin += `  ${paramItem["参数名称"]}${
            paramItem["是否必须"] === "true" ? "" : "?"
          }: ${itemType}\n`;
        });
        return begin + "}";
      }
    } catch (error) {
      return "Record<string,any>";
    }
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
            let begin = `{\n`;
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
                    childbegin += `  /**
   * ${paramChild["参数说明"]}
   */\n`;
                    childbegin += `  ${paramChild["参数名称"]}: ${childItemType}\n`;
                  });
                  itemType = itemType.replace("any", childbegin + "}");
                }
              } catch (error) {
                itemType = javaToTs(dataItem["类型"]);
              }
              begin += `  /**
   * ${dataItem["参数说明"]}
   */\n`;
              begin += `  ${dataItem["参数名称"]}: ${itemType};\/\/ ${dataItem["参数说明"]}\n`;
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
  // 去除循环引用的json转换
  function jsonDelPre(obj: object) {
    return JSON.parse(
      JSON.stringify(obj, (key, value) => {
        if (key === "pre") {
          return "pre";
        } else {
          return value;
        }
      })
    );
  }
  return {
    method: urlAndMethod[0],
    url: urlAndMethod[1],
    desc,
    paramsType,
    resType,
    paramsData: jsonDelPre(paramsData),
    resData: jsonDelPre(resData),
  };
}
// 获取谷歌路径
function getChromePath() {
  try {
    if (platform() === "win32") {
      return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
      // return "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
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
    async (
      pageData: SpiderDataType,
      apiName: string,
      apiCode: string,
      paramsType: string,
      resultType: string
    ) => {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        // 获取当前文件路径
        const filePath = activeEditor.document.fileName;
        const pkgPath = await findNearestPackageJson(filePath);
        if (!pkgPath) {
          return;
        }
        const { apiFileMode } = await getOptions();
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
          let apiFile = "";
          let apiTypeFile = "";
          // api目录
          if (apiFileMode === "api") {
            apiFile =
              module !== "common"
                ? resolve(filePath.split("views")[0], `api/${module}.ts`)
                : resolve(dirname(pkgPath as string), `src/api/${module}.ts`);

            apiTypeFile =
              module !== "common"
                ? resolve(
                    filePath.split("views")[0],
                    `api/types/${module}.ts`
                  )
                : resolve(
                    dirname(pkgPath as string),
                    `src/api/types/${module}.ts`
                  );
          } else if (apiFileMode === "COM") {
            const activeEditor = vscode.window.activeTextEditor;
            const path = activeEditor?.document.fileName;

            if (path) {
              const basePath = dirname(path)
                .split(sep)
                .filter((item) => item !== "modules")
                .join(sep);
              apiFile = resolve(basePath, "api.ts");
              apiTypeFile = resolve(basePath, "types/api.ts");
              module = "api";
            }
          } else {
            apiFile = resolve(apiFileMode as string, "api.ts");
            apiTypeFile = resolve(apiFileMode as string, "types/api.ts");
            module = "api";
          }
          try {
            mkdirSync(dirname(apiFile), { recursive: true }); // 使用 recursive 选项自动创建中间目录
            mkdirSync(dirname(apiTypeFile), { recursive: true }); // 使用 recursive 选项自动创建中间目录
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
                `import actionRequest from '@/utils/request';
import * as T from './types/${module}'\n
                ` + apiCode;
              writeFileSync(apiFile, tsCode);
              return;
            }
            // 没有引入axios封装的方法就从默认路径引入
            if (!tsCode.includes("actionRequest")) {
              tsCode =
                `import actionRequest from '@/utils/request';\n
                import * as T from './types/${module}'\n
                ` + tsCode;
            }
            if (!tsCode.includes(apiName)) {
              tsCode += apiCode;
              writeFileSync(apiFile, tsCode);
            }
          });

          readFile(apiTypeFile, "utf-8", (err, typeCode = "") => {
            if (err) {
              console.log("error :>> ", err);
              typeCode += paramsType;
              typeCode += resultType;
              // 发生错误时处理
              writeFileSync(apiTypeFile, typeCode);
              return;
            }
            if (!typeCode.includes(apiName)) {
              typeCode += paramsType;
              typeCode += resultType;
              writeFileSync(apiTypeFile, typeCode);
            }
          });
        }
        // 创建并写入
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
  // 方法名
  const methodName = pageData.method.toLowerCase() + caml;
  // 参数名
  const paramsName = methodName + "ParamsType";
  // 返回值名
  const resultName = methodName + "ResultType";
  // 参数类型
  const paramsType = `\n/**
   * @description: ${pageData.desc}
   * @description: "参数类型"
   */
export type ${paramsName} = ${pageData.paramsType}\n `;
  // 返回值类型
  const resultType = `\n/**
   * @description: ${pageData.desc}
   * @description: "返回值类型"
   */
export type ${resultName} = ${pageData.resType}\n `;
  // 参数注释
  const paramsTypeDoc = paramsDoc(pageData.paramsData);
  const resultTypeDoc = resultDoc(pageData.resData);
  // 返回值注释
  const code = `
/**
 * @description: ${pageData.desc}
 * @description: ${pageData.method}请求
 * @doc {string} ${url}
${paramsTypeDoc}
${resultTypeDoc}
 */
export const ${methodName} = <P extends T.${paramsName}, R extends T.${resultName}>(data: P): Promise<R> => {
  return actionRequest({
    url: '${path}'${endParams ? ` + '/' + data.${endParams}` : ""},
    method: '${pageData.method.toLowerCase()}',
    ${pageData.method.toLowerCase() === "get" ? "params" : "data"}: data
  }) as unknown as Promise<R>
}

`;

  return {
    apiName: pageData.method.toLowerCase() + caml,
    apiCode: code,
    paramsType,
    resultType,
  };
}

// 从数据解析 参数的注释
function paramsDoc(paramsData: Record<string, any>) {
  if (!paramsData) {
    return `
* @param {Object} data - 参数对象`;
  }
  let begin = ``;
  try {
    if (paramsData?.[0]["请求类型"] === "body") {
      paramsData[0].children.forEach((paramItem: any) => {
        let itemType = javaToTs(paramItem["数据类型"]);
        begin += `\n* @param {${itemType}} data.${paramItem["参数名称"]} - ${paramItem["参数说明"]}`;
        //对于数组和对象 就再判断一层，第三层就不判断了，顶多判断两层
        if (
          (itemType.includes("Array") || itemType.includes("Record")) &&
          paramItem.children.length > 0
        ) {
          let childbegin = ``;
          paramItem.children.forEach((paramChild: any) => {
            const childItemType = javaToTs(paramChild["数据类型"]);
            childbegin += `\n* @param {${childItemType}} data.${paramItem["参数名称"]}.${paramChild["参数名称"]} - ${paramChild["参数说明"]}`;
          });
          begin += childbegin;
        }
      });
    } else {
      paramsData.forEach((paramItem: any) => {
        let itemType = javaToTs(paramItem["数据类型"]);
        begin += `\n* @param {${itemType}} data.${paramItem["参数名称"]} - ${paramItem["参数说明"]}`;
      });
    }
  } catch (error) {
    console.log("error :>> ", error);
    return `
    * @param {Object} data - 参数对象`;
  }
  return `* @param {Object} data - 参数对象 ${begin}`;
}
// 返回值注释
function resultDoc(resultData: Record<string, any>) {
  if (!resultDoc) {
    return `
* @returns {Object} result.data  返回值对象
`;
  }
  let resTypeDoc = `* @returns {Object} result.data  返回值对象`;
  try {
    resultData.find((item: Record<string, any>) => {
      if (item["参数名称"] === "data") {
        if (item.children.length > 0) {
          item.children.forEach((dataItem: any) => {
            let itemType = javaToTs(dataItem["类型"]);
            resTypeDoc += `\n* @property {${itemType}} result.data.${dataItem["参数名称"]} - ${dataItem["参数说明"]}`;
            //对于数组和对象 就再判断一层，第三层就不判断了，顶多判断两层
            if (
              (itemType.includes("Array") || itemType.includes("Record")) &&
              dataItem.children.length > 0
            ) {
              let childbegin = ``;
              dataItem.children.forEach((paramChild: any) => {
                const childItemType = javaToTs(paramChild["类型"]);
                childbegin += `\n* @property {${childItemType}} result.data.${dataItem["参数名称"]}.${paramChild["参数名称"]} - ${paramChild["参数说明"]}`;
              });
              resTypeDoc += childbegin;
            }
          });
        }

        return true;
      }
    });
  } catch (error) {
    console.log("error :>> ", error);
    return `
  * @returns {Object} result.data  返回值对象
  `;
  }
  return resTypeDoc;
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
