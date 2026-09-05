# 🎬 Visual Novel Studio｜Galgame 可视化制作工坊

> 无需编程，就能在网页上创作属于你的恋爱冒险游戏（Galgame / 视觉小说）。

Visual Novel Studio 把剧情变成一张看得见、拖得动的流程图：创建场景、连接分支、设置选项、埋下数值（Flag），再为每个角色设计专属路线与多结局。内置浏览器播放器支持快进、后退、历史记录、自动播放与本地存档/读档；「演示模式」可以直接在游戏画面中拖动角色立绘、替换背景，并实时调整文本框、角色名牌和选项区等 UI。作品既可备份为 JSON、导出为独立 HTML，也可直接生成一个原生 Windows `.exe` 应用。

🌐 **在线使用**：https://visual-novel-studio.onrender.com  
📦 **源码仓库**：https://github.com/alynlox-ui/visual-novel_studio

## 核心特性

- 🗺 **可视化节点编辑**：场景、分支与结局一目了然，支持拖拽节点、弧形连线、端口连线、搜索和自动布局
- 🔀 **分支与结局判定**：选项分支、条件自动分支与 Flag 数值系统
- ▶ **内置浏览器播放器**：快进（已读/全部）、后退、历史、自动播放、本地存档与读档
- 🎭 **人物与演出系统**：角色库、立绘、表情、动作、关键帧、图层与场景角色编排
- 🎨 **演示模式与 UI 定制**：直接调整背景、角色、文本框、角色名牌、选项区、字体、间距和过渡动画
- 💾 **本地创作数据**：草稿自动保存到浏览器本地，支持撤销/重做、版本快照、JSON 导入/导出
- 🎥 **媒体支持**：场景背景图、CG 视频、BGM、配音和素材库
- 🤖 **AI 辅助**：分别配置图像、视频和文本生成 API；API Key 仅保存在浏览器本地
- 🌐 **多语言与本地统计**：语言包管理、试玩统计、项目体检和批量修改
- 🪟 **原生 Windows 应用导出**：直接下载单个 `.exe`；不使用 Electron，不携带 Chromium/WebView，不需要旁置 `game.html`，双击即可运行

## 导出格式

### 原生 Windows 应用（推荐）

点击顶部 **📁 项目功能 → 🪟 导出 Windows 应用**，浏览器会下载一个以作品名命名的 `.exe` 文件。

- 这是单一 PE 应用文件，不是 ZIP，也不是 Electron 外壳
- 项目 JSON 会直接嵌入 EXE 尾部，下载后无需解压或搭配网页文件
- 原生播放器使用 WinForms + GDI+ 绘制窗口、背景、人物、对话和选项
- 支持对话推进、选项分支、Flag 条件、多结局、后退、快速保存/读取和 F11 全屏
- `data:` 格式的背景与人物位图会随项目写入 EXE
- `http://` / `https://` 外链素材仍需要联网；当前原生播放器不播放视频、BGM 与配音
- 导出应用只加载内嵌 `data:` 或网络 `http(s)` 素材，不读取您电脑上的任意本地文件
- Windows 11 通常已具备所需的 .NET Framework 运行环境

### 独立可玩 HTML

**🎮 导出可玩 HTML** 仍作为单独的网页导出选项保留；它与原生 Windows 应用导出互不混淆。

## 本地运行

1. 安装 Node.js 16+
2. 在项目目录执行：
   ```bash
   npm start
   ```
3. 浏览器打开：`http://localhost:10000`

## 原生播放器开发与构建

项目内的原生播放器源码位于 `native-player/`。Windows 环境可直接执行：

```bash
npm run build:native-player
```

或双击运行：

```text
native-player\build.cmd
```

构建脚本使用 Windows 自带的 .NET Framework C# 编译器，输出：

```text
native-player\dist\visual-novel-native.exe
```

服务器的 `/api/export-game` 会把当前项目 JSON 嵌入这个 PE 模板后返回单个 `.exe`。

## 部署到 Render

### 方法一：Blueprint 一键部署

1. 把项目上传到 GitHub 仓库
2. 打开 https://render.com 并登录
3. 点击 **New +** → **Blueprint**
4. 连接 GitHub 仓库，Render 会读取 `render.yaml`
5. 等待部署完成

### 方法二：手动创建 Web Service

- Runtime / Environment：**Node**
- Build Command：`npm install`
- Start Command：`node server.js`
- Instance Type：**Free**

Render Web Service 休眠后首次访问可能需要冷启动。浏览器草稿保存在 localStorage；原生 EXE 导出由 Node 服务端将项目数据嵌入 Windows 播放器模板后实时生成。
