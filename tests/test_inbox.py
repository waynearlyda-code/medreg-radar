"""用一份模拟的列表页检查“手动导入”能不能认出标题、日期和链接。运行：python3 -m unittest"""
import os
import shutil
import tempfile
import unittest

from medreg.source_inbox import read_inbox

HERE = os.path.dirname(__file__)


class InboxTest(unittest.TestCase):
    def test_list_page(self):
        tmp = tempfile.mkdtemp()
        try:
            shutil.copy(os.path.join(HERE, "sample_list.html"), tmp)
            items = read_inbox(tmp, log=lambda *a: None)
            got = {i["date"]: i for i in items}
            self.assertEqual(len(items), 3)
            self.assertIn("医用电子直线加速器", got["2026-10-20"]["title"])
            self.assertIn("X射线计算机体层摄影设备召回", got["2026-10-15"]["title"])  # 用 title 属性补全被截断的标题
            self.assertEqual(got["2026-10-09"]["url"], "https://www.nmpa.gov.cn/ylqx/ylqxggtg/20261009100303333.html")
            self.assertTrue(all(i["source"].startswith("国家药监局") for i in items))
            self.assertTrue(os.path.exists(os.path.join(tmp, "done", "sample_list.html")))
        finally:
            shutil.rmtree(tmp)


if __name__ == "__main__":
    unittest.main()
