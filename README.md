### 使用场景

UI 把项目切图单独放在 Figma 文件某个 node 下，可以理解成切图单独放一块，该脚本通过 file key 和 node id 匹配并解析内容后批量
下载到本地，图片以对应的 node 名称命名。目前默认解析为切图的 node 类型是["FRAME", "COMPONENT"]，可通过 figmaImgTypes 参数修改。

注意：由于存在即使是完全相同的 Node 节点,每次获取到的图片 url 也不同的限制，所以无法通过判断 url 来更新已下载的本地图片。
如果想重复下载或者更新图片，请删除自动生成的 metadata.json 文件。

### 从 figma 获取 token

[token 如何获取？](https://www.figma.com/developers/api#access-tokens)

### 安装

```bash
npm install fig-save -D

```

### 使用

```js
import { saveImgs } from 'fig-save';
// 或者
import saveImgs from 'fig-save';

// https://www.figma.com/file/:key/:title?node-id=:id
saveImgs(key, id, options);
```

### Options

|     名字      |          默认          |              描述              |
| :-----------: | :--------------------: | :----------------------------: |
|     scale     |           1            |       在 0.01 到 4 之间        |
|    format     |          png           |     jpg, png, svg, or pdf      |
|    saveDir    | process.cwd()下的 imgs |          图片保存目录          |
|  concurrency  |           5            |          并发下载数量          |
| figmaImgTypes | ["FRAME", "COMPONENT"] | Figma 节点转图片下载的类型范围 |

[其他图片参数，详见官方文档](https://www.figma.com/developers/api#get-images-endpoint)
