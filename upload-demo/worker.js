var Module = {
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
  
  self.onmessage = async ({ data }) => {
    const type = data.type;
    if (type === "copy") {
      await copyFileToOPFS(data.file);
    } else if (type === "fileList") {
      await getFileList();
    } else if (type === "clearAll") {
      await clearAllFile();
    }
  };
  
  const copyFileToOPFS = async (file) => {
    Module.print("准备上传文件：", file.name);
    const fileReader = new FileReaderSync();
    const filename = file.name;
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(filename, {
      create: true,
    });
    const accessHandle = await fileHandle.createSyncAccessHandle();
    let times = 0;
    let index = 0;
    const length = 1024 * 1024 * 50;
    let flag = true;
    const fileSize = file.size;
    while (flag) {
      times++;
      if (times > 1000) {
        flag = false;
        break;
      }
      if (index >= fileSize) {
        flag = false;
        break;
      }
      const start = index;
      let end = index + length;
      if (end > fileSize) {
        end = fileSize;
      }
      const content = file.slice(start, end);
      let arrayBuffer = fileReader.readAsArrayBuffer(content);
      accessHandle.write(arrayBuffer, {
        at: start,
      });
      accessHandle.flush();
      arrayBuffer = null;
      index = end;
      Module.print("文件已上传：", ((index / fileSize) * 100).toFixed(2), "%");
    }
    accessHandle.close();
    Module.print("文件上传成功: " + file.name);
  };
  
  const getFileList = async () => {
    const root = await navigator.storage.getDirectory();
    const fileList = [];
    for await (const key of root.keys()) {
      fileList.push(key);
    }
    Module.print("文件列表为：\r\n" + JSON.stringify(fileList, null, 2));
    self.postMessage({
      type: "fileList_return",
      data: fileList,
    });
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
  
  