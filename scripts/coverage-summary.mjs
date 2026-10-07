// Prints the coverage totals from `npm test` as a Markdown table, so CI can put
// them on the job summary page instead of only in the uploaded report.
import { readFile } from "node:fs/promises";

const summary = JSON.parse(await readFile("build/coverage/coverage-summary.json", "utf8"));
const rows = ["lines", "statements", "functions", "branches"].map((metric) => {
  const { covered, total, pct } = summary.total[metric];
  return `| ${metric} | ${pct}% | ${covered} / ${total} |`;
});

console.log(["## Coverage", "", "| Metric | Covered | Count |", "| --- | --- | --- |", ...rows].join("\n"));
