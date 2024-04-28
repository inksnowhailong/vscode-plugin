## wingmate

- 一款vscode扩展
- 模糊搜索zingUI工具函数功能和爬取knife4j的java文档生成api请求函数的功能
- 用于前端提效，和与zingUI函数库进行更好的项目中衔接


### 爬虫 knife4j的java接口页面，生成接口代码、TS类型

ts或vue文件中，输入`@api xxx|`,即可触发接口爬取

- [@api ](/api ) (注意api后面有个空格)为前置触发条件，"xxx"为knife4j某接口的url地址，"|"为开始搜索
- 每次只能爬取一个接口，url地址是这个接口的浏览器地址栏中的url
- 生成会有三部分
   - 第一部分：`src/api/{执行@api命令的文件的所在目录名称+父目录名称}.ts ` 此文件保存接口函数
   - 第二部分：`src/api/types/{执行@api命令的文件的所在目录名称+父目录名称}.ts ` 此文件保存接口函数的参数和返回值TS类型
   - 第三部分：是输入命令位置 会变为生成的接口函数名称，如果你使用了一些自动import引入的其他插件，这会有用

> 注意：knife4j,文档 不能有账号密码登录，因为那样无法进行登录，就无法爬取，所以请和后端沟通好

### options
vscode的设置中设置，或者项目根目录中添加wingmate.config.json（这个权重更高）
- wingmate.exePath 谷歌浏览器或eage浏览器可执行文件地址 默认使用浏览器的默认安装地址
- wingmate.apiFileMode 设置api文件生成模式，默认api,生成在api目录，可选:COM，COM包模式，当前com包目录;自定义的绝对路径

