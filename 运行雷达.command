#!/bin/bash
# 双击运行：抓取最新文件、读取 inbox/ 里保存的网页、生成报告和网页，最后打开网页。
cd "$(dirname "$0")" || exit 1
echo "MedReg Radar 正在运行，大约需要半分钟……"
echo
python3 radar.py
STATUS=$?
if [ $STATUS -eq 0 ]; then
  MSG=$(python3 -c "import json;d=json.load(open('data/last_run.json'));print('新增 %d 条，其中影像设备 %d 条' % (d['new'], d['new_imaging']))")
  osascript -e "display notification \"$MSG\" with title \"MedReg Radar\"" >/dev/null 2>&1
  open docs/index.html
fi
echo
echo "可以关掉这个窗口了。"
