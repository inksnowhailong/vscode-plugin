# packagerun README

这是一个用于读取**package.json**并允许你快速执行其中scripts 中内容的工具。同时你也可以配置一些自定义的命令，用于快速执行。为了少写烦人的npm run xxx 而生
> Tip 通常来说，它是个前端项目或者node项目才会使用的插件,也许日后会取消对package.json的监测和限制。如果你有这种需求，可以到github上给我提个需求，也欢迎点😁start，让它扩展更多功能
# 用法
1、右键你的package.json，菜单将出现packagerun,点击它
2、在打开了某个文件的情况下，shift+R，它会自动寻找最近的package.json
3、vscode设置中，可以配置自定义的命令配置：


```javascript
 "packagerun.commandOptions": [
    {
      "label":"打开xxx",
      "script":"node xxx.js",
      "path":"D:/xxxx/"  //可以指定执行目录，否则执行目录将是你使用shift+R的位置,若指定为关键字package 则在最近的package.josn所在目录执行
    }
  ],
```
