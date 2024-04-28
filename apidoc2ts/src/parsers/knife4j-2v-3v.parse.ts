/**
 *knife4j 2xxx版本和3xxx版本的解析器
 *
 */

import dedent from "dedent";
import { PageModule } from "../api";

/**参数文档信息 */
 interface ParamsDescItem {
  children: ParamsDescItem[];
  参数名称: string;
  参数说明: string;
  请求类型: string;
  是否必须: string;
  数据类型: string;
}
 interface ResultDescItem {
  children: ResultDescItem[];
  参数名称: String;
  参数说明: String;
  类型: String;
}
/**爬取到的数据 */
 interface SpiderDataType {
  /** 请求方法 小写*/
  method: string;
  /**请求path */
  url: string;
  /**请求的简介 */
  desc: string;
  /**参数的类型 */
  paramsType: string;
  /**参数数据 数据量为1 参数对象 只有一个对象 */
  paramsData: [ParamsDescItem];
  /**返回值类型 */
  resType: string;
  /**返回值数据 */
  resData: ResultDescItem[];
}

// 执行js代码 在页面中得到数据
export function parseAllPageData(): SpiderDataType {
  // 请求method和url地址的信息
  const urlAndMethodDOM = document.getElementsByClassName(
    "knife4j-api-summary"
  )[0];
  const method = urlAndMethodDOM.getElementsByClassName(
    "knife4j-api-summary-method"
  )[0] as HTMLElement;
  const path = urlAndMethodDOM.getElementsByClassName(
    "knife4j-api-summary-path"
  )[0] as HTMLElement;

  const urlAndMethod: string[] = [
    method.textContent?.trim() as string,
    path.textContent?.trim() as string,
  ];
  // 描述信息
  // @ts-ignore
  const desc =
    document.getElementsByClassName("api-body-desc")[0]?.textContent ||
    document
      .getElementsByClassName("knife4j-api-title")[0]
      ?.textContent?.trim()
      .split(" ")[0] ||
    "";
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
    const baseRes = `any`;
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
  console.log({
    method: urlAndMethod[0],
    url: urlAndMethod[1],
    desc,
    paramsType,
    resType,
    paramsData: jsonDelPre(paramsData),
    resData: jsonDelPre(resData),
  });

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

// 创建 api文件里面的内容
export function createApiCode(pageData: SpiderDataType, url: string) {
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
    .map((word:any) => {
      // 将每个单词的首字母大写
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join("");
  // 方法名
  const methodName = pageData.method.toLowerCase().replace("-", "") + caml;
  // 参数名
  const paramsName = methodName + "ParamsType";
  // 返回值名
  const resultName = methodName + "ResultType";
  // 参数类型
  const paramsType = dedent`\n/**
     * @description: ${pageData.desc}
     * @description: "参数类型"
     */
  export type ${paramsName} = ${pageData.paramsType}\n `;
  // 返回值类型
  const resultType = dedent`\n/**
     * @description: ${pageData.desc}
     * @description: "返回值类型"
     */
  export type ${resultName} = ${pageData.resType}\n `;
  // 参数注释
  const paramsTypeDoc = paramsDoc(pageData.paramsData);
  const resultTypeDoc = resultDoc(pageData.resData);
  // 返回值注释和函数
  const code = dedent`
  /**
   * @description: ${pageData.desc}
   * @description: ${pageData.method}请求
   * @doc {string} ${url}
  ${paramsTypeDoc}
  ${resultTypeDoc}
   */
  export const ${methodName} = <P extends T.${paramsName}, R extends T.${resultName}>(data: P): Promise<BaseResponse<R>> => {
    return actionRequest({
      url: '${path}'${endParams ? ` + '/' + data.${endParams}` : ""},
      method: '${pageData.method.toLowerCase()}',
      ${pageData.method.toLowerCase() === "get" ? "params" : "data"}: data
    }) as unknown as Promise<BaseResponse<R>>
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
    return dedent`
  * @param {Object} data - 参数对象`;
  }
  let begin = ``;
  try {
    if (paramsData?.[0]["请求类型"] === "body") {
      paramsData[0].children.forEach((paramItem: any) => {
        let itemType = javaToTs(paramItem["数据类型"]);
        begin += `\n * @param {${itemType}} data.${paramItem["参数名称"]} - ${paramItem["参数说明"]}`;
        //对于数组和对象 就再判断一层，第三层就不判断了，顶多判断两层
        if (
          (itemType.includes("Array") || itemType.includes("Record")) &&
          paramItem.children.length > 0
        ) {
          let childbegin = ``;
          paramItem.children.forEach((paramChild: any) => {
            const childItemType = javaToTs(paramChild["数据类型"]);
            childbegin += `\n * @param {${childItemType}} data.${paramItem["参数名称"]}.${paramChild["参数名称"]} - ${paramChild["参数说明"]}`;
          });
          begin += childbegin;
        }
      });
    } else {
      paramsData.forEach((paramItem: any) => {
        let itemType = javaToTs(paramItem["数据类型"]);
        begin += `\n * @param {${itemType}} data.${paramItem["参数名称"]} - ${paramItem["参数说明"]}`;
      });
    }
  } catch (error) {
    console.log("error :>> ", error);
    return dedent`
      * @param {Object} data - 参数对象`;
  }
  return ` * @param {Object} data - 参数对象 ${begin}`;
}
// 返回值注释
function resultDoc(resultData: Record<string, any>) {
  if (!resultDoc) {
    return dedent`
  * @returns {Object} result.data  返回值对象
  `;
  }
  let resTypeDoc = dedent`* @returns {Object} result.data  返回值对象`;
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
    return dedent`
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
