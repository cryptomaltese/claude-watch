const version = "0.2.0";

function main(): void {
  const cmd = process.argv[2] ?? "help";
  if (cmd === "version" || cmd === "--version" || cmd === "-v") {
    console.log(`claude-watch v${version}`);
  } else {
    console.log(`claude-watch v${version} — run 'claude-watch help' for usage`);
  }
}

main();
