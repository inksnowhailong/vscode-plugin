import * as vscode from "vscode";

/** Supported language type */
const LANGUAGES = [
  "typescriptreact",
  "typescript",
  "javascript",
  "javascriptreact",
];

export function activate(context: vscode.ExtensionContext) {
  /** Trigger a list of recommended characters */
  // const triggers = [' '];
  // const completionProvider = vscode.languages.registerCompletionItemProvider(LANGUAGES, {
  //     async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
  //         const completionItem: vscode.CompletionItem = {
  //             label: 'Hello VsCode',
  //         };
  //         return [completionItem];
  //     }
  // }, ...triggers);

  // context.subscriptions.push(completionProvider);
  // test2

  // 创建多个代码提示项
  const completionItems = [
    {
      label: "@ut:myItem",
      insertText: "myItem",
      detail: "This is item 1",
    },
    {
      label: "@ut:anotherItem",
      insertText: "anotherItem",
      detail: "This is item 2",
    },
    // 添加更多代码提示项
  ];

  // 注册代码补全提供者
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      LANGUAGES, // 语言
      {
        provideCompletionItems(document, position, token) {
          const lineTextBeforeCursor = document
            .lineAt(position)
            .text.slice(0, position.character);
		  if (!lineTextBeforeCursor.endsWith('@ut:')) {
			return undefined;
		}
            // 创建代码提示项
            const completionItem = new vscode.CompletionItem('useVmodel');
			completionItem.documentation=new vscode.MarkdownString(
				`## testTitle
				- 1
				- 2
				内容
				`
				  );
			completionItem.insertText="";
			  // 创建替换操作
			  const rangeToReplace = new vscode.Range(position.translate(0, -4), position); // 包括 '@ut:'
			  completionItem.additionalTextEdits = [
				  new vscode.TextEdit(rangeToReplace, 'fffunct')
			  ];

            return [completionItem];

        },
      },
      ":"
    )
  );
}
