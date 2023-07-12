
# packagerun README

这是一个用于读取**package.json**并允许你快速执行其中 scripts 中内容的工具。同时你也可以配置一些自定义的命令，用于快速执行。为了少写烦人的 npm run xxx 而生

> Tip 通常来说，它是个前端项目或者 node 项目才会使用的插件,也许日后会取消对 package.json 的监测和限制。如果你有这种需求，可以到 github 上给我提个需求，也欢迎点 😁start，让它扩展更多功能
> [👉 去 github 点 star](https://github.com/inksnowhailong/vscode-plugin)

# 用法😏

 1. 右键你的 package.json，菜单将出现 packagerun,点击它
 2. 在打开了项目中某个文件的情况下，windows:ctrl+alt+x,mac:ctrl+cmd+x,使用你的小拇指，大拇指和食指操作，它会自动寻找最近的 package.json
 3. vscode 设置中，可以配置自定义的命令配置：


# 配置⚙️
#### 在vscode的setting文件中配置，这会在多个项目共享
```javascript
 "packagerun.commandOptions": [
    {
      "label":"打开xxx",
      "script":"node xxx.js",
      //可以指定执行目录，否则执行目录将是你触发快捷键的位置,
      // 若指定为关键字package 则在最近的package.josn所在目录执行
      "path":"D:/xxxx/"
    }
  ],
```

#### 又或者，你希望以项目为单位，在package.json同级创建 packagerun.config.json

```javascript
 {
  // 用于配置各种命令
  "commandOptions": [
    {
      "label": "安装包",
      "script": "npm i",
      "path": "package"
    }
  ]
}

```

# 警告❗
<font color="red">命令的label 即为唯一判断标识，请保持唯一性。</font>

---------------------------------


# packagerun README

This is a tool that reads **package.json** and allows you to quickly execute the contents of the scripts in it. At the same time, you can also configure some custom commands for quick execution. Born to write less annoying npm run xxx

> Tip Generally speaking, it is a plug-in that is only used by front-end projects or node projects, and the monitoring and restrictions on package.json may be canceled in the future. If you have such a need, you can submit a request to me on github, and you are welcome to click 😁start to let it expand more functions
> [👉 Go to github and click star](https://github.com/inksnowhailong/vscode-plugin)

# Usage 😏

  1. Right-click your package.json, the menu will appear packagerun, click it
  2. When a file in the project is opened, windows: ctrl+alt+x, mac: ctrl+cmd+x, use your little finger, thumb and index finger to operate, it will automatically find the nearest package.json
  3. In vscode settings, you can configure custom command configuration:


# configuration ⚙️
#### Configure in the setting file of vscode, which will be shared in multiple projects
```javascript
  "packagerun.commandOptions": [
     {
       "label": "Open xxx",
       "script": "node xxx.js",
       //You can specify the execution directory, otherwise the execution directory will be the location where you trigger the shortcut key,
       // If specified as the keyword package, it will be executed in the directory where the nearest package.josn is located
       "path":"D:/xxxx/"
     }
   ],
```

#### Or, you want to create packagerun.config.json at the same level as package.json on a project basis

```javascript
  {
   // Used to configure various commands
   "commandOptions": [
     {
       "label": "Installation package",
       "script": "npm i",
       "path": "package"
     }
   ]
}

```

# WARNING❗
The label of the <font color="red"> command is the unique identification, please keep it unique. </font>
