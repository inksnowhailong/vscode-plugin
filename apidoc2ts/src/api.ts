import puppeteer from "puppeteer-core";
import * as vscode from "vscode";
import { platform } from "os";
import { mkdirSync, readFile, writeFileSync } from "fs";
import { findNearestPackageJson, getOptions } from "./tool";
import { dirname, resolve, sep } from "path";
import dedent from "dedent";
const LANGUAGES = ["typescriptreact", "typescript", "vue"];
/** 开启这个后 页面会弹出浏览器实例，且不会自动关闭 用于测试 */
const debugOpen = false;
/**生成接口文件所需内容,这些会被写入文件 */
export type FileContentType = {
  /** api的函数名称 */
  apiName: string;
  /**请求函数的代码本身 */
  apiCode: string;
  /** 参数类型 */
  paramsType: string;
  /** 返回值类型 */
  resultType: string;
};

export type PageModule =
  | "响应参数"
  | "响应状态"
  | "响应示例"
  | "接口描述"
  | "请求参数"
  | "请求示例";

/**
 * @description: 解析接口文档，生成接口代码
 * @param {*} parser 文档解析函数
 * @param {function} createApiCode 文档解析函数解析后，生成接口代码和ts代码的函数，参数必须要为parser的返回值和文档的浏览器url，返回值必须为FileContentType
 * @return {*}
 */
export default function <ParserResult>(
  parser: () => ParserResult,
  createApiCode: (pageData: ParserResult, url: string) => FileContentType
) {

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
        const pageData = await spiderHtmlData(url,parser);
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
              command: "apidoc2ts.api",
              title: "apidoc2ts.api",
              arguments: [apiName, apiCode, paramsType, resultType],
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
  async function spiderHtmlData<ParserResult>(
    url: string,
    parser: () => ParserResult
  ): Promise<ParserResult | undefined> {
    if (!url.includes("http")) {
      return;
    }

    const progressOptions = {
      location: vscode.ProgressLocation.Notification,
      title: "爬取接口页面内容",
      cancellable: false,
    };
    // 搞一个promise拦截器 在爬取任务在进度内完成后 进行resolve
    const pageData: ParserResult = await new Promise((resolve) => {
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
            headless: !debugOpen,
          });
          progress.report({ increment: 30, message: "进入页面..." });
          const page = await browser.newPage();
          await page.goto(url);
          progress.report({ increment: 70, message: "dom数据提取处理..." });
          await page.waitForSelector(".knife4j-api-summary");
          // 解析ts类型信息
          const pageData: ParserResult = await page.evaluate(parser);

          progress.report({ increment: 100, message: "内容提取完成..." });
          /**自动关闭浏览器实例 */
          !debugOpen && browser.close();

          resolve(pageData);
        } catch (error) {
          console.log("error>>", error);
        }
      });
    });
    return pageData;
    // const progress = await createProgress();
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
    "apidoc2ts.api",
    async (
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
        if (filePath.includes("src")) {
          //从当前目录 解析出来 目录的一层一层结构，并反转，让最后一个目录在前面
          const targetUrlList = dirname(filePath).split(sep).reverse();
          const srcIndex = targetUrlList.slice().reverse().indexOf("src");
          let module = "";
          // 如果是src一级目录下，就用src作为ts名称，否则就是所在目录和父级的目录名称组合起来
          if (srcIndex === 0) {
            module = "src";
          } else if (
            targetUrlList.includes("views") &&
            targetUrlList[0] !== "views"
          ) {
            // 有views  则以views 下的第一层作为模块，再加上父级目录，本级目录
            const viewsIndex = targetUrlList.indexOf("views");
            module =
              // views下一级目录名称
              targetUrlList[viewsIndex - 1] +
              "_" +
              targetUrlList
                .slice(0, srcIndex)
                .slice(0, 2) // 截取当前文件所在目录，和父级目录
                .filter(
                  (item) =>
                    item !== targetUrlList[viewsIndex - 1] && item !== "views"
                ) //如果一级目录重复，就过滤掉
                .reverse()
                .join("_");
          } else {
            module = targetUrlList
              .slice(0, srcIndex)
              .slice(0, 2)
              .reverse()
              .join("_");
          }
          createApifileAndWrite(module);
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
            apiFile = resolve(
              dirname(pkgPath as string),
              `src/api/${module}.ts`
            );

            apiTypeFile = resolve(
              dirname(pkgPath as string),
              `src/api/types/${module}.ts`
            );
          } else if (apiFileMode === "inline") {
            // 当前执行命令所在文件的文件夹下
            const activeEditor = vscode.window.activeTextEditor;
            const path = activeEditor?.document.fileName;

            if (path) {
              const basePath = dirname(path);
              module = "api";
              apiFile = resolve(
                dirname(basePath as string),
                `/api/${module}.ts`
              );

              apiTypeFile = resolve(
                dirname(basePath as string),
                `/api/types/${module}.ts`
              );
            }
          } else {
            //自定义路径
            apiFile = resolve(
              dirname(apiFileMode as string),
              `/api/${module}.ts`
            );

            apiTypeFile = resolve(
              dirname(apiFileMode as string),
              `/api/types/${module}.ts`
            );
          }
          try {
            mkdirSync(dirname(apiFile), { recursive: true }); // 使用 recursive 选项自动创建中间目录
            mkdirSync(dirname(apiTypeFile), { recursive: true }); // 使用 recursive 选项自动创建中间目录
          } catch (err: any) {
            if (err.code !== "EEXIST") {
              throw err;
            }
          }

          readFile(apiFile, "utf-8", async (err, tsCode) => {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            const { BaseResponse, requestMethodContent } = await getOptions();
            const tsCodeBase = dedent` ${requestMethodContent}\n
import * as T from './types/${module}'\n
${BaseResponse}
            `;
            if (err) {
              console.log("error :>> ", err);

              // 发生错误时处理
              const tsCode = tsCodeBase + apiCode;
              writeFileSync(apiFile, tsCode);
              return;
            }
            // 没有引入axios封装的方法就从默认路径引入
            if (!tsCode.includes("actionRequest")) {
              tsCode = tsCodeBase + tsCode;
            }
            if (!new RegExp(`\\b${apiName}\\b`).test(tsCode)) {
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
            if (!new RegExp(`\\b${apiName}\\b`).test(typeCode)) {
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
// @api https://ucenter-baseline-api.aihuoshi.net/doc.html#/default/[demo%E8%A1%A8%E7%BB%93%E6%9E%84]%E6%A8%A1%E5%9D%97/listDemoTableUsingPOST
