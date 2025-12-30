# php use

一个功能强大的 Visual Studio Code 扩展，用于智能管理 PHP 文件中的 `use` 语句，帮助开发者保持代码的整洁和高效。

## ✨ 功能特性

- **删除未使用的导入**：自动检测并删除 PHP 文件中未使用的 `use` 语句
- **导入未声明的类**：通过快捷键手动为代码中使用但未导入的类添加 `use` 语句
- **展开命名空间**：将光标所在类的短类名展开为完整的命名空间路径
- **自动排序导入**：添加新导入后自动按字母顺序或自然顺序排序命名空间
- **支持多种 use 语句格式**：完美支持单个 use 语句和分组 use 语句
- **智能诊断**：实时检测并高亮显示未使用的导入
- **便捷操作方式**：提供快捷键、右键菜单和快速修复选项
- **个性化配置**：支持多种可自定义的设置选项
- **仅针对 PHP 文件**：安全可靠，避免意外修改其他类型的文件

## 📋 系统要求

- Visual Studio Code 1.100.0 或更高版本
- 无需外部依赖，开箱即用

## 🚀 使用方法

### 删除未使用的导入

1. 在 VSCode 中打开一个 PHP 文件
2. 使用以下任一方式触发操作：
   - 按下快捷键 `Ctrl+Shift+R` (Windows/Linux) 或 `Cmd+Shift+R` (Mac)
   - 在编辑器中右键点击，选择 "Remove Unused Imports"
   - 当检测到未使用的导入时，点击灯泡图标并选择 "Remove unused imports"
3. 扩展将自动删除所有未使用的 `use` 语句

### 导入未声明的类

1. 在 VSCode 中打开一个 PHP 文件
2. 将光标放在要导入的类名上
3. 使用快捷键 `Ctrl+Alt+I` (Windows/Linux) 或 `Cmd+Alt+I` (Mac)
4. 如果有多个匹配的类，选择你想要导入的类
5. 扩展将自动添加相应的 `use` 语句

### 展开命名空间

1. 在 VSCode 中打开一个 PHP 文件
2. 将光标放在要展开的类名上（该类必须有对应的 `use` 语句）
3. 使用快捷键 `Ctrl+Alt+E` (Windows/Linux) 或 `Cmd+Alt+E` (Mac)
4. 扩展将自动将该类的短类名替换为完整的命名空间路径

## 📝 示例

### 删除未使用的导入

**使用前：**
```php
<?php

use App\Models\User;
use App\Models\Post;
use App\Models\Comment;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class TestClass
{
    public function testMethod()
    {
        $user = new User();
        $data = DB::table('users')->get();
        
        return $user;
    }
}
```

**使用后：**
```php
<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;

class TestClass
{
    public function testMethod()
    {
        $user = new User();
        $data = DB::table('users')->get();
        
        return $user;
    }
}
```

### 导入未声明的类

**使用前：**
```php
<?php

class TestClass
{
    public function testMethod()
    {
        $user = new User(); // User 类未导入
        return $user;
    }
}
```

**使用后：**
```php
<?php

use App\Models\User;

class TestClass
{
    public function testMethod()
    {
        $user = new User();
        return $user;
    }
}
```

### 展开命名空间

**使用前：**
```php
<?php

use App\Models\User;
use App\Models\Post;

class TestClass
{
    public function testMethod()
    {
        $user = new User();
        $post = new Post();
        
        return [$user, $post];
    }
}
```

**使用后（将光标放在 User 上并按 Ctrl+Alt+E）：**
```php
<?php

use App\Models\User;
use App\Models\Post;

class TestClass
{
    public function testMethod()
    {
        $user = new \App\Models\User();
        $post = new Post();
        
        return [$user, $post];
    }
}
```

## ⚙️ 扩展设置

在 VSCode 的设置中，搜索 "php use" 可以找到以下配置选项：

| 设置项 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| `php-use.enableAutoDetect` | Boolean | true | 启用自动检测未使用的导入 |
| `php-use.showUnusedImportsDiagnostics` | Boolean | false | 显示未使用的导入诊断警告 |
| `php-use.diagnosticSeverity` | String | Information | 诊断的严重级别（Warning/Information/Hint） |
| `php-use.showNotifications` | Boolean | false | 当删除未使用的导入时显示通知消息 |
| `php-use.exclude` | Array | ["**/node_modules/**", "**/vendor/**"] | 排除搜索的文件和文件夹的 glob 模式 |
| `php-use.autoSortAfterImports` | Boolean | false | 添加新导入后自动按字母顺序排序命名空间导入 |
| `php-use.naturalSort` | Boolean | false | 使用自然顺序算法排序导入项（例如：Item 2 排在 Item 10 之前） |

### 排序功能说明

扩展支持两种排序方式：

1. **字母顺序排序**（默认）：按照字母顺序对命名空间进行排序
2. **自然顺序排序**：使用自然顺序算法，数字部分按数值大小排序

**使用方式：**
- 只勾选 `php-use.autoSortAfterImports`：自动排序（默认使用字母顺序排序）
- 同时勾选 `php-use.autoSortAfterImports` 和 `php-use.naturalSort`：使用自然顺序排序

**排序示例：**

字母顺序排序：
```php
use App\Models\Item10;
use App\Models\Item2;
use App\Models\Item3;
```

自然顺序排序：
```php
use App\Models\Item2;
use App\Models\Item3;
use App\Models\Item10;
```

## 🐛 已知问题

- 目前没有已知问题。如果您发现了任何问题，请在 [GitHub 仓库](https://github.com/icescrown/php-use/issues) 中提交。

## 📄 发布说明

### 0.0.2

- 新增自动排序导入功能，支持在添加新导入后自动排序命名空间
- 新增自然顺序排序选项，使用自然顺序算法对导入项进行排序
- 新增配置项 `php-use.autoSortAfterImports`：添加新导入后自动按字母顺序排序命名空间导入
- 新增配置项 `php-use.naturalSort`：使用自然顺序算法排序导入项（例如：Item 2 排在 Item 10 之前）
- 支持字母顺序排序和自然顺序排序两种排序方式
- 当同时启用自动排序和自然顺序排序时，采用自然顺序算法
- 排序始终使用完整类名，确保排序结果的一致性和可预测性

### 0.0.1

- 初始版本发布
- 支持单个 `use` 语句和分组 `use` 语句
- 实现删除未使用的导入功能
- 实现导入未声明的类功能
- 提供快捷键和右键菜单操作
- 支持智能诊断和快速修复
- 添加多种可自定义的设置选项

---

**如果您喜欢这个扩展，请在 VSCode 市场中给它评分！**

---