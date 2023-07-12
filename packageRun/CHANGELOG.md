
# 更新日志

所有重要的更改、新功能和修复都将在此记录。

## [1.0.6] - 2023-7-6

### 新功能
可在项目级别 加入配置文件 "packagerun.config.json"
示例配置：

```javascript
{
   // 用于配置各种命令
   "commandOptions": [
     {
       "label": "Installation package",
       "script": "npm i",
       "path": "package"
     }
   ]
}
```
### 改进
	readme 里面加入了英文部分

## [1.0.7] - 2023-7-12
### 改进
	快捷键从shift+r变更为了

|windows|mac  |
|--|--|
| ctrl+alt+x |ctrl+cmd+x  |

主要是因为shift+r总是输出R,所以决定进行修改，但是好多快捷键被占用了，就好不容易找到个单手按起来还算方便的键位
