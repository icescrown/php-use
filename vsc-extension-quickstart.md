# 欢迎使用您的 VS Code 扩展

## 文件夹中的内容

* 此文件夹包含您扩展所需的所有文件。
* `package.json` - 这是清单文件，您可以在其中声明扩展和命令。
  * 示例插件注册一个命令并定义其标题和命令名称。VS Code 可以使用此信息在命令面板中显示该命令，此时还不需要加载插件。
* `src/extension.ts` - 这是您将提供命令实现的主文件。
  * 该文件导出一个 `activate` 函数，该函数在第一次激活扩展时（在此例中是通过执行命令）被调用。在 `activate` 函数内部，我们调用 `registerCommand`。
  * 我们将包含命令实现的函数作为第二个参数传递给 `registerCommand`。

## 设置

* 安装推荐的扩展（amodio.tsl-problem-matcher、ms-vscode.extension-test-runner 和 dbaeumer.vscode-eslint）


## 立即启动并运行

* 按 `F5` 打开一个新窗口并加载您的扩展。
* 从命令面板（按 `Ctrl+Shift+P` 或 Mac 上的 `Cmd+Shift+P`）运行您的命令，输入 `Hello World`。
* 在 `src/extension.ts` 中的代码内设置断点以调试您的扩展。
* 在调试控制台中查找扩展的输出。

## 进行更改

* 在 `src/extension.ts` 中更改代码后，可以从调试工具栏重新启动扩展。
* 您还可以重新加载（`Ctrl+R` 或 Mac 上的 `Cmd+R`）VS Code 窗口以加载更改。


## 探索 API

* 打开 `node_modules/@types/vscode/index.d.ts` 文件时，您可以查看完整的 API 集合。

## 运行测试

* 安装 [扩展测试运行器](https://marketplace.visualstudio.com/items?itemName=ms-vscode.extension-test-runner)
* 通过 **任务：运行任务** 命令运行 "watch" 任务。确保该任务正在运行，否则可能无法发现测试。
* 从活动栏打开测试视图，点击 "Run Test" 按钮，或使用快捷键 `Ctrl/Cmd + ; A`
* 在测试结果视图中查看测试结果的输出。
* 修改 `src/test/extension.test.ts` 或在 `test` 文件夹内创建新的测试文件。
  * 提供的测试运行器只会考虑与名称模式 `**.test.ts` 匹配的文件。
  * 您可以在 `test` 文件夹内创建子文件夹，以任何方式组织您的测试。

## 进一步发展

* 通过 [打包您的扩展](https://code.visualstudio.com/api/working-with-extensions/bundling-extension) 减少扩展大小并提高启动时间。
* 在 VS Code 扩展市场 [发布您的扩展](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)。
* 通过设置 [持续集成](https://code.visualstudio.com/api/working-with-extensions/continuous-integration) 实现构建自动化。
