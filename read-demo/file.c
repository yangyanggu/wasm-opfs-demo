#include <stdio.h>
#include <stdlib.h>

int read_file(const char *file){
    FILE *fp,*fpbuff;
    if (!(fpbuff=fopen(file,"r"))) {
        printf("read file fail:%s\n",file);
        return 0;
    }
    fseek(fpbuff, 0, SEEK_END);
    long length = ftell(fpbuff);
    fseek(fpbuff, 0, SEEK_SET);
    char *conf_data = (char*)malloc(length);
    fread(conf_data, 1, length, fpbuff);
    fp = fmemopen(conf_data, length , "r");
    if (!fp) {
        free(conf_data);
        return 0;
    }
    char buff[1024];
    while (fgets(buff,1024,fp)) {
        printf("line str : %s\n",buff);
    }
    fclose(fpbuff);
    fclose(fp);
    free(conf_data);
    printf("read file end : %s\n",file);
    return 1;
}