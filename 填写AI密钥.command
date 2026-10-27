#!/bin/bash
# 双击运行：把你的 DeepSeek API key 存进 .secrets/deepseek_key.txt（这个文件永远不会上传）。
# 粘贴时屏幕上不会显示任何字符，这是正常的。
cd "$(dirname "$0")" || exit 1
mkdir -p .secrets
echo "请粘贴你的 DeepSeek API key（以 sk- 开头），然后按回车。"
echo "（粘贴时屏幕上不显示，是正常的。）"
read -r -s KEY
echo
if [[ "$KEY" != sk-* ]]; then
  echo "这看起来不像 DeepSeek 的 key（应该以 sk- 开头），没有保存。"
else
  printf "%s" "$KEY" > .secrets/deepseek_key.txt
  chmod 600 .secrets/deepseek_key.txt
  echo "已保存。下次运行雷达，新文件会自动带上 AI 解读。"
fi
unset KEY
echo "可以关掉这个窗口了。"
