import { execSync } from "child_process";
import puppeteer from "puppeteer-core";
import * as vscode from "vscode";
import { platform } from "os";
import { mkdirSync, readFile, readFileSync, readSync, writeFileSync } from "fs";
import { findNearestPackageJson } from "./tool";
import { dirname, resolve, sep } from "path";
const LANGUAGES = ["typescriptreact", "typescript", "vue"];

interface spiderDataType {
  method: string;
  url: string;
  desc: string;
}
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
        if (!~utIndex||!lineTextBeforeCursor.includes("|")) {
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
        const { apiName, apiCode } = createApiCode(pageData,url);
        console.log('apiCode :>> ', apiCode);
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
async function spiderHtmlData(url: string) {
  if (!url.includes("http")) {
    return;
  }
  const progress = await createProgress();

  const chromePath = getChromePath();
  progress.report({ increment: 10, message: "开始爬取..." });
  try {
    const browser = await puppeteer.launch({
      executablePath: chromePath || "",
    });
    const page = await browser.newPage();
    progress.report({ increment: 10, message: "创建页面..." });
    console.log("startgo :>> ", url);
    await page.goto(url);
    progress.report({ increment: 40, message: "进入页面..." });
    await page.waitForSelector(".knife4j-api-summary");
    progress.report({ increment:10, message: "dom加载完成..." });
    const pageData: spiderDataType = await page.evaluate(parseAllPageData);
    progress.report({ increment:30, message: "内容提取完成..." });
    browser.close();
    return pageData;
  } catch (error) {
    console.log("error>>", error);
  }
}
// 执行js代码 在页面中得到数据
function parseAllPageData() {
  // 请求method和url地址的信息
   // @ts-ignore
  const urlAndMethod = document
    .getElementsByClassName("knife4j-api-summary")[0]
    ?.innerText?.split("\n");
  // 描述信息
  // @ts-ignore
  const desc = document.getElementsByClassName("api-body-desc")[0]?.innerText;
  // // 表格
  // const tables = document.getElementsByClassName("ant-table-content");
  // //参数相关数据
  // const paramsData = parseTableData(tables[0]);
  // const resultData = parseTableData(tables[2]);
  // 解析table数据函数 必须定义在这里 因为page.evaluate里面的作用域 引用不到当前文件内定义的东西
  function parseTableData(table: any) {
    // 获取表格头部和数据行
    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");

    // 获取表格的列数
    // const columnCount = thead.querySelectorAll("th").length;

    // 初始化一个空的JSON数组，用于存储表格数据
    const data: Record<string, string>[] = [];
    // 每个tr都是一行,有可能出现嵌套情况
    function parsetrData(row: any, box: any[], prebox?: any[]) {
      const rowData: Record<string, string | any[]> = { children: [] };
      row.querySelectorAll("td").forEach((cell: any, index: any) => {
        const columnName = thead.querySelectorAll("th")[index].textContent;
        rowData[columnName] = cell.textContent;
      });

      box.push(rowData);
      // 查看这个tr的级别
      const level = row.classList[1].at(-1);
      //  查看下一个元素
      const nextDOM = row.nextElementSibling;
      if (nextDOM) {
        // 如果下个元素 返回了true  说明 下个元素的下个元素 等级变小了
        let isSmall = false;
        //  有下个元素,且其级别大于自己,就将其作为子项
        if (nextDOM.classList[1].at(-1) > level) {
          isSmall = parsetrData(nextDOM, rowData.children as any[], box);
        } else if (nextDOM.classList[1].at(-1) === level) {
          isSmall = parsetrData(nextDOM, box);
        } else if (nextDOM.classList[1].at(-1) < level) {
          return true;
        }
        // 对比 下个元素的下个元素 和自己等级 如果和自己等级一样,就执行相同操作,否则继续向上
        if (isSmall) {
          const nextnextDOM = nextDOM.nextElementSibling;
          if (nextnextDOM && nextnextDOM.classList[1].at(-1) === level) {
            isSmall = parsetrData(nextnextDOM, box);
          } else if (nextnextDOM && nextnextDOM.classList[1].at(-1) < level) {
            return true;
          }
        }
      }
      return false;
    }
    parsetrData(tbody.querySelectorAll("tr")[0], data);
    return data;
  }

  return {
    method: urlAndMethod[0],
    url: urlAndMethod[1],
    desc,
    // paramsData,
    // resultData,
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
      return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
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
    async (pageData: spiderDataType, apiName: string, apiCode: string) => {
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
function createApiCode(pageData: spiderDataType,url:string) {
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
 * @param {T} data
 * @type {T} ${pageData.method}
 * @doc {string} ${url}
 * @return {*}
 */
export const ${
  pageData.method.toLowerCase() + caml
} = (data: Record<string,any>): Promise<any> => {
  return actionRequest({
    url: '${path}'${endParams ? `+'/'+data.${endParams}` : ""},
    method: '${pageData.method.toLowerCase()}',
    ${pageData.method.toLowerCase()==='get'?'params':'data'}: data
  })
}
`;
  console.log('code :>> ', code);
  return {
    apiName: pageData.method.toLowerCase() + caml,
    apiCode: code,
  };
}

async function createProgress() {
  // 创建进度条，指定任务总步数
  const progressOptions = {
    location: vscode.ProgressLocation.Notification,
    title: "爬取接口页面内容",
    cancellable: false,
  };
  let progress = null;
  await vscode.window.withProgress(progressOptions, async (p) => {
    progress = p;
  });

  // vscode.window.showInformationMessage("任务已完成！");
  return progress as unknown as vscode.Progress<{
    message?: string | undefined;
    increment?: number | undefined;
  }>;
}
