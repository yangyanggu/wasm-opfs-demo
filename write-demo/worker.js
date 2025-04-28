var Module = {
    onRuntimeInitialized: function () {
      this.print("wasm初始化成功");
      self.postMessage({
        type: "init",
      });
      console.log("Module: ", Module);
      console.log("FS: ", FS);
    },
    testWrite: async function () {
      this.print(
        "---------------------------testWrite---------------------------------------"
      );
      this.print("");
      this.print("准备写入文件");
      const startTime = new Date().getTime();
      console.time("测试写入耗时: ");
      const result = await Module.ccall("write_to_file", "number", [], [], {
        async: true,
      });
      console.log("result: ", result);
      this.print("写入文件结束");
      const endTime = new Date().getTime();
      this.print("测试写入耗时: ", endTime - startTime, "ms");
    },
    print: (function () {
      return (...args) => {
        var text = args.join(" ");
        // These replacements are necessary if you render to raw HTML
        //text = text.replace(/&/g, "&amp;");
        //text = text.replace(/</g, "&lt;");
        //text = text.replace(/>/g, "&gt;");
        //text = text.replace('\n', '<br>', 'g');
        console.log(text);
        self.postMessage({
          type: "print",
          data: text,
        });
      };
    })(),
  };
  
  importScripts("./file.js");
  importScripts("./extend.js");
  
  Module.print("worker线程初始化成功");
  
  self.onmessage = function (res) {
    console.log("worker 接受的数据:", res);
    const data = res.data;
    if (data.type === "write") {
      try {
        Module.testWrite().then();
      } catch (e) {
        console.log("test write error: ", e);
      }
    } else if (data.type === "readTest") {
      readTestFile().then();
    } else if (data.type === "clearAll") {
      clearAllFile().then();
    }
    console.log("data: ", data);
  };
  
  /**
   * 获取缓存文件的根目录
   * @param rootDir 默认目录名称
   * @returns
   */
  const getRootDir = async () => {
    const root = await navigator.storage.getDirectory();
    return root;
  };
  
  const readTestFile = async () => {
    const root = await getRootDir();
    const tmp = await root.getDirectoryHandle("tmp");
    const dir = await tmp.getDirectoryHandle("111");
    const fileHandle = await dir.getFileHandle("test.txt");
    const accessHandle = await fileHandle.createSyncAccessHandle();
    let size = accessHandle.getSize();
    const dataView = new DataView(new ArrayBuffer(size));
    // 将整个文件读入数据视图
    accessHandle.read(dataView, { at: 0 });
    const textDecoder = new TextDecoder();
    const decodeStr = textDecoder.decode(dataView);
    console.log("文件内容：" + decodeStr);
    Module.print("test.txt文件内容: \n");
    Module.print(decodeStr);
    Module.print(" ------------------------------------------");
    accessHandle.close();
  };
  const clearAllFile = async () => {
    const root = await navigator.storage.getDirectory();
    for await (const key of root.keys()) {
      root.removeEntry(key, {
        recursive: true,
      });
    }
    Module.print("文件清空成功！");
  };
  