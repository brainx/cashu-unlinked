import { spawnSync } from "node:child_process";

// Software checks use the saved recordings. Capture remains an explicit, separate command.
const npmCLI = process.env.npm_execpath;
for (const args of [
  ["test"],
  ["run", "typecheck"],
  ["run", "demo"],
  ["run", "test:browser"],
]) {
  const result = spawnSync(
    npmCLI ? process.execPath : "npm",
    npmCLI ? [npmCLI, ...args] : args,
    {
      cwd: new URL("..", import.meta.url),
      stdio: "inherit",
      timeout: 180_000,
    },
  );
  if (result.error || result.status !== 0) {
    console.error(`Verification stopped at npm ${args.join(" ")}.`);
    process.exit(result.status ?? 1);
  }
}
