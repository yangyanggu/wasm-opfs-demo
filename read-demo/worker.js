var Module = {
    onRuntimeInitialized: function () {
      this.print("wasm初始化成功");
      self.postMessage({
        type: "init",
      });
      console.log("Module: ", Module);
      console.log("FS: ", FS);
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
  
  const extendFSMethod = (FS) => {
    const WORKERFS = FS.filesystems.WORKERFS;
    if (WORKERFS) {
      WORKERFS.mount = function (mount) {
        WORKERFS.reader ??= new FileReaderSync();
        const root = WORKERFS.createNode(null, "/", WORKERFS.DIR_MODE, 0);
        const createdParents = {};
        function ensureParent(path) {
          const parts = path.split("/");
          let parent = root;
          for (let i = 0; i < parts.length - 1; i++) {
            const curr = parts.slice(0, i + 1).join("/");
            createdParents[curr] ||= WORKERFS.createNode(
              parent,
              parts[i],
              WORKERFS.DIR_MODE,
              0
            );
            parent = createdParents[curr];
          }
          return parent;
        }
        function base(path) {
          const parts = path.split("/");
          return parts[parts.length - 1];
        }
        Array.prototype.forEach.call(mount.opts["files"] || [], function (file) {
          WORKERFS.createNode(
            ensureParent(file.name),
            base(file.name),
            WORKERFS.FILE_MODE,
            0,
            file,
            file.lastModifiedDate
          );
        });
        (mount.opts["blobs"] || []).forEach((obj) => {
          WORKERFS.createNode(
            ensureParent(obj["name"]),
            base(obj["name"]),
            WORKERFS.FILE_MODE,
            0,
            obj["data"]
          );
        });
        (mount.opts["accessHandles"] || []).forEach((obj) => {
          WORKERFS.createNode(
            ensureParent(obj["name"]),
            base(obj["name"]),
            WORKERFS.FILE_MODE,
            0,
            obj["handle"]
          );
        });
        (mount.opts["packages"] || []).forEach((pack) => {
          pack["metadata"].files.forEach((file) => {
            const name = file.filename.substr(1);
            WORKERFS.createNode(
              ensureParent(name),
              base(name),
              WORKERFS.FILE_MODE,
              0,
              pack["blob"].slice(file.start, file.end)
            );
          });
        });
        return root;
      };
      WORKERFS.createNode = function (parent, name, mode, dev, contents, mtime) {
        const node = FS.createNode(parent, name, mode);
        node.mode = mode;
        node.node_ops = WORKERFS.node_ops;
        node.stream_ops = WORKERFS.stream_ops;
        node.timestamp = (mtime || new Date()).getTime();
        if (mode === WORKERFS.FILE_MODE) {
          if (contents instanceof FileSystemSyncAccessHandle) {
            node.size = contents.getSize();
          } else {
            node.size = contents?.size || 0;
          }
          node.contents = contents;
        } else {
          node.size = 4096;
          node.contents = {};
        }
        if (parent) {
          parent.contents[name] = node;
        }
        return node;
      };
      WORKERFS.stream_ops.read = function (
        stream,
        buffer,
        offset,
        length,
        position
      ) {
        console.log("文件名称：", stream.node.name);
        if (position >= stream.node.size) return 0;
        if (stream.node.contents instanceof FileSystemSyncAccessHandle) {
          const size = stream.node.size;
          let byteSize = length;
          if (position + length > size) {
            byteSize = size - position;
          }
          console.log("文件总大小：", size);
          console.log("本次读取大小：", byteSize);
          const unit8Array = new Uint8Array(byteSize);
          stream.node.contents.read(unit8Array, {
            at: position,
          });
          buffer.set(unit8Array, offset);
          return unit8Array.length;
        } else {
          const chunk = stream.node.contents.slice(position, position + length);
          const ab = WORKERFS.reader.readAsArrayBuffer(chunk);
          buffer.set(new Uint8Array(ab), offset);
          return chunk.size;
        }
      };
    }
  };
  extendFSMethod(FS);
  
  self.onmessage = async ({ data }) => {
    const type = data.type;
    if (type === "copy") {
      await copyFileToOPFS(data.file);
    } else if (type === "fileList") {
      await getFileList();
    } else if (type === "clearAll") {
      await clearAllFile();
    } else if (type === "read") {
      await readFile(data.data);
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
  
  const readFile = async (filename) => {
    Module.print("\n ----------------------------------------------- \n");
    Module.print("准备读取文件：", filename);
    const root = await navigator.storage.getDirectory();
    try {
      const dir = "/tmp/" + new Date().getTime();
      FS.mkdir(dir);
      const file = await root.getFileHandle(filename);
      const handle = await file.createSyncAccessHandle();
      const size = (handle.getSize() / 1024 / 1024).toFixed(2);
      Module.print("文件大小：", size, "M");
      FS.mount(
        FS.filesystems.WORKERFS,
        {
          accessHandles: [
            {
              name: filename,
              handle,
            },
          ],
        },
        dir
      );
      const path = dir + "/" + filename;
      const textEncoder = new TextEncoder();
      const configByte = textEncoder.encode(path);
      const configByteLength = configByte.length;
      const configPointer = Module._malloc(configByteLength);
      Module.HEAPU8.set(configByte, configPointer);
      Module.HEAPU8[configPointer + configByteLength] = 0;
      let startTime = new Date().getTime();
      Module._read_file(configPointer);
      let endTime = new Date().getTime();
      Module.print(
        "读取文件总共耗时：",
        ((endTime - startTime) / 1000).toFixed(3),
        "秒"
      );
      Module._free(configPointer);
      handle.close();
    } catch (e) {
      if (e.name === "NotFoundError") {
        Module.print("OPFS缓存中不存在该文件，", filename);
      }
    }
  };
  