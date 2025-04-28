const getFileHandleByPath = async (path) => {
    const array = path.split("/");
    let dirHandle = await navigator.storage.getDirectory();
    for (let i = 0; i < array.length - 1; i++) {
      const dirPath = array[i];
      if (dirPath !== "") {
        dirHandle = await dirHandle.getDirectoryHandle(dirPath, {
          create: true,
        });
      }
    }
    const file = await dirHandle.getFileHandle(array[array.length - 1], {
      create: true,
    });
    return file.createSyncAccessHandle();
  };
  
  FS.mknod = (path, mode, dev) => {
    var lookup = FS.lookupPath(path, { parent: true });
    var parent = lookup.node;
    var name = PATH.basename(path);
    if (!name || name === "." || name === "..") {
      throw new FS.ErrnoError(28);
    }
    var errCode = FS.mayCreate(parent, name);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.mknod) {
      throw new FS.ErrnoError(63);
    }
    if (path === "/tmp") {
      const node = WORKERFS.node_ops.mknod(parent, name, mode, dev);
      return node;
    }
    return parent.node_ops.mknod(parent, name, mode, dev);
  };
  if (WORKERFS) {
    WORKERFS.node_ops.mknod = (parent, name, mode, dev) => {
      const node = WORKERFS.createNode(parent, name, mode, dev);
      return node;
    };
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
    WORKERFS.createNode = (parent, name, mode, dev, contents, mtime) => {
      var node = FS.createNode(parent, name, mode);
      node.mode = mode;
      node.node_ops = WORKERFS.node_ops;
      node.stream_ops = WORKERFS.stream_ops;
      node.timestamp = (mtime || new Date()).getTime();
      assert(WORKERFS.FILE_MODE !== WORKERFS.DIR_MODE);
      if (mode === WORKERFS.FILE_MODE) {
        if (contents instanceof FileSystemSyncAccessHandle) {
          node.size = contents.getSize();
        } else {
          node.size = contents?.size || 0;
        }
        node.contents = contents;
      } else if (FS.isFile(mode)) {
        node.size = 0;
        node.contents = null;
      } else {
        node.size = 4096;
        node.contents = {};
      }
      if (parent) {
        parent.contents[name] = node;
      }
      return node;
    };
    WORKERFS.stream_ops.open = (stream) => {
      if (stream.node.contents) {
        return;
      }
      console.log("open: ", stream);
      stream.node.promise = new Promise((resolve, reject) => {
        const startTime = new Date().getTime();
        getFileHandleByPath(stream.path)
          .then((handle) => {
            stream.node.contents = handle;
            const endTime = new Date().getTime();
            Module.print("获取文件读写句柄耗时：", endTime - startTime, "ms");
            stream.node.promise = undefined;
            resolve();
          })
          .catch((e) => {
            Module.print("获取文件句柄失败：", e);
            reject(e);
          });
      }).then();
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
    WORKERFS.stream_ops.write = (stream, buffer, offset, length, position) => {
      // console.log(
      //   "WORKERFS 准备写入数据：",
      //   stream,
      //   buffer,
      //   offset,
      //   length,
      //   position
      // );
      if (stream.node.contents) {
        if (stream.node.bufferCache) {
          let l = 0;
          stream.node.bufferCache.forEach((b) => {
            stream.node.contents.write(b, {
              at: l,
            });
            l += b.length;
          });
          stream.node.bufferCache = null;
        }
        stream.node.contents.write(buffer.slice(offset, offset + length), {
          at: position,
        });
      } else {
        if (!stream.node.bufferCache) {
          stream.node.bufferCache = [];
        }
        stream.node.bufferCache.push(buffer.slice(offset, offset + length));
      }
      return length;
    };
    WORKERFS.stream_ops.close = (stream) => {
      if (stream.node.contents) {
        Module.print("文件content存在，直接关闭文件句柄");
        stream.node.contents.flush();
        stream.node.contents.close();
        stream.node.contents = null;
      } else if (stream.node.promise) {
        stream.node.promise
          .then(() => {
            if (stream.node.bufferCache) {
              let l = 0;
              stream.node.bufferCache.forEach((b) => {
                stream.node.contents.write(b, {
                  at: l,
                });
                l += b.length;
              });
              stream.node.bufferCache = null;
            }
            stream.node.contents.flush();
            stream.node.contents.close();
            stream.node.contents = null;
            stream.node.promise = null;
            console.log("关闭文件前写入数据成功！！！！");
          })
          .catch(() => {
            console.error("文件写入缓存失败");
            stream.node.contents = null;
            stream.node.promise = null;
            stream.node.bufferCache = null;
          });
      } else {
        console.error("关闭文件失败");
      }
    };
    FS.rmdir("/tmp");
    FS.mkdir("/tmp");
  }
  