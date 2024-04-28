# 基于官方的node镜像
FROM node:18

# 设置工作目录
WORKDIR /webProject

# 将你的项目文件复制到Docker镜像中
COPY . .

# 安装项目依赖
RUN npm install

# 暴露端口，使得Docker容器可以访问
EXPOSE 3000

# 启动应用
CMD ["npm", "start"]
