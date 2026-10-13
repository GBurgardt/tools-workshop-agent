import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const comparison = args.includes("tool-design-comparison");
const commandArgs = comparison
  ? ["test/tool-design-comparison.js", ...args.filter((arg) => arg !== "tool-design-comparison")]
  : [
      "--test",
      "test/server.test.js",
      "test/tools.test.js",
      "test/tool-designs.test.js",
      "test/agent.test.js",
    ];

const result = spawnSync(process.execPath, commandArgs, { stdio: "inherit" });
process.exit(result.status ?? 1);
