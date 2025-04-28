#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <errno.h>
#include <sys/stat.h>
#include <string.h>
#include <emscripten.h>

const char charset[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
                           "abcdefghijklmnopqrstuvwxyz"
                           "0123456789";

// 生成随机字符串函数
char* generate_random_string(int length) {
    // 字符池：大小写字母 + 数字（共62个字符）
    const int charset_size = sizeof(charset) - 1; // 计算字符集长度（不包括终止符）

    // 分配内存（字符串长度 + 1个终止符）
    char* str = (char*)malloc(length + 1);
    if (!str) return NULL;  // 内存分配检查

    // 生成随机字符
    for (int i = 0; i < length; i++) {
        int key = rand() % charset_size;
        str[i] = charset[key];
    }
    str[length] = '\0';  // 添加字符串终止符
    return str;
}

// 递归创建目录（类似 mkdir -p）
int mkdir_p(const char *path, mode_t mode) {
    char tmp[1024];
    char *p = NULL;
    size_t len;

    strncpy(tmp, path, sizeof(tmp));
    tmp[sizeof(tmp) - 1] = '\0';
    len = strlen(tmp);

    // 去除末尾的 '/'
    if (tmp[len - 1] == '/') {
        tmp[len - 1] = '\0';
        len--;
    }

    // 逐级创建目录
    for (p = tmp + 1; *p; p++) {
        if (*p == '/') {
            *p = '\0';
            if (mkdir(tmp, mode) != 0 && errno != EEXIST) {
                return -1;
            }
            *p = '/';
        }
    }
    
    // 创建最后一级目录
    if (mkdir(tmp, mode) != 0 && errno != EEXIST) {
        return -1;
    }
    
    return 0;
}
EMSCRIPTEN_KEEPALIVE
void sleep_for_seconds(){
    emscripten_sleep(50);
    printf("C 成功休眠 50 ms \n");
}
EMSCRIPTEN_KEEPALIVE
int write_to_file() {
    srand(time(NULL));  // 初始化随机数种子（基于当前时间）
    if (mkdir_p("/tmp/111", 0755) != 0) {
        fprintf(stderr, "创建目录失败 \n");
    }
    int length = 1024;  // 定义字符串长度
    char *filename = "/tmp/111/test.txt";
    // 打开文件，使用写入模式（覆盖原有内容）
    FILE *file = fopen(filename, "w+");
    printf("已打开文件 %s \n", filename);
    sleep_for_seconds();
    if (file == NULL) {
        printf("文件打开失败 \n"); // 输出错误信息
        return -1; // 返回错误代码
    }
    int i=0;
    while (i< 2)
    {
        char* random_str = generate_random_string(length);
        // 尝试写入数据
        if (fputs(random_str, file) == EOF) {
            fclose(file); // 关闭文件前仍需清理资源
            printf("写入文件失败 \n");
            return -1;
        }
        free(random_str);
        random_str = NULL;
        i = i+1;
        printf("已写入第 %d 块数据 \n", i);
    }

    // 关闭文件并检查是否成功
    if (fclose(file) != 0) {
        printf("关闭文件失败 \n");
        return -1;
    }
    printf("关闭文件成功 \n");
    return 1; // 成功返回0
}
