from pathlib import Path
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = ROOT / ".github" / "workflows" / "ordering.yml"


class WorkflowPolicyTest(unittest.TestCase):
    def test_main_push_deploys_only_after_verification(self):
        self.assertTrue(WORKFLOW.is_file(), f"missing workflow: {WORKFLOW}")
        workflow = yaml.load(WORKFLOW.read_text(), Loader=yaml.BaseLoader)
        self.assertIn("main", workflow["on"]["push"]["branches"])
        jobs = workflow["jobs"]
        self.assertIn("verify", jobs)
        self.assertIn("publish", jobs)
        self.assertIn("deploy", jobs)
        self.assertIn("verify", jobs["publish"]["needs"])
        self.assertIn("publish", jobs["deploy"]["needs"])
        self.assertIn("refs/heads/main", jobs["deploy"]["if"])
        self.assertIn("packages: write", WORKFLOW.read_text())
        self.assertIn("${{ github.sha }}", WORKFLOW.read_text())

    def test_verify_job_runs_database_and_miniapp_checks(self):
        self.assertTrue(WORKFLOW.is_file(), f"missing workflow: {WORKFLOW}")
        workflow = yaml.load(WORKFLOW.read_text(), Loader=yaml.BaseLoader)
        verify = workflow["jobs"]["verify"]
        self.assertIn("mysql", verify["services"])
        commands = "\n".join(step.get("run", "") for step in verify["steps"])
        self.assertIn("prisma:migrate", commands)
        self.assertIn("pnpm run verify:server", commands)
        self.assertIn("pnpm run verify:miniapp", commands)


if __name__ == "__main__":
    unittest.main()
