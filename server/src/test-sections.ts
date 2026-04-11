/**
 * Test case: Extract section headings from a review paper and convert to graph nodes.
 *
 * Target paper: "A review of applications in federated learning"
 *   DOI: 10.1016/j.cie.2020.106854
 *   OpenAlex: W3086809868
 *
 * Run: npx tsx src/test-sections.ts [--live]
 *   --live  attempts the Semantic Scholar snippet API (needs S2 API key in env)
 */

import { fetchPaperSections, sectionsToGraphNodes, type PaperSection } from "./semanticScholar.js";

// ── Known sections for this paper (from manual inspection) ──────────────
// These are the actual subsection headings that would make great keywords,
// compared to OpenAlex's generic tags ("Computer science", "Engineering").

const KNOWN_SECTIONS: PaperSection[] = [
  { name: "Overview of Federate Learning", snippetCount: 4 },
  { name: "Characteristics of FL", snippetCount: 3 },
  { name: "Non-IID", snippetCount: 2 },
  { name: "Decentralized Technology", snippetCount: 2 },
  { name: "Equality of Status for Each Node", snippetCount: 1 },
  { name: "Mainstream Open-Source Frameworks", snippetCount: 2 },
  { name: "Categories of Federated Learning", snippetCount: 3 },
  { name: "Horizontal Federated Learning", snippetCount: 2 },
  { name: "Vertical Federated Learning", snippetCount: 2 },
  { name: "Federated Transfer Learning", snippetCount: 1 },
  { name: "Challenges and Improvement", snippetCount: 3 },
  { name: "Optimization", snippetCount: 2 },
  { name: "Security Analysis", snippetCount: 2 },
  { name: "Privacy Risk", snippetCount: 1 },
  { name: "Application for Mobile Devices", snippetCount: 2 },
  { name: "Frontier Achievements and Future Work", snippetCount: 2 },
];

const PAPER_NODE_ID = "paper_W3086809868";
const PAPER_TITLE = "A review of applications in federated learning";

async function runLive() {
  console.log("🔍 Fetching sections from Semantic Scholar snippet API...\n");
  const apiKey = process.env.S2_API_KEY;
  if (!apiKey) {
    console.warn("  ⚠ No S2_API_KEY set — will likely be rate-limited.\n");
  }
  try {
    const sections = await fetchPaperSections(PAPER_TITLE, undefined, apiKey);
    console.log(`  Found ${sections.length} sections:\n`);
    for (const s of sections) {
      console.log(`    [${s.snippetCount}] ${s.name}`);
    }
    return sections;
  } catch (e) {
    console.error(`  ✗ API error: ${(e as Error).message}`);
    console.log("  Falling back to hardcoded sections.\n");
    return null;
  }
}

async function main() {
  const useLive = process.argv.includes("--live");

  let sections: PaperSection[];

  if (useLive) {
    const live = await runLive();
    sections = live ?? KNOWN_SECTIONS;
  } else {
    sections = KNOWN_SECTIONS;
  }

  console.log("━".repeat(60));
  console.log(`Paper: "${PAPER_TITLE}"`);
  console.log(`Node ID: ${PAPER_NODE_ID}`);
  console.log(`Sections: ${sections.length}`);
  console.log("━".repeat(60));

  // Convert sections to graph nodes
  const { nodes, edges } = sectionsToGraphNodes(sections, PAPER_NODE_ID);

  console.log("\n## Generated Keyword Nodes\n");
  for (const node of nodes) {
    console.log(`- **${node.label}** (\`${node.kind}\`, id: \`${node.id}\`)`);
    console.log(`  - ${node.summary}`);
  }

  console.log("\n## Generated Edges\n");
  for (const edge of edges) {
    console.log(`- \`${edge.source}\` —${edge.kind}→ \`${edge.target}\``);
  }

  // Show comparison with OpenAlex keywords for the same paper
  console.log("\n" + "━".repeat(60));
  console.log("## Comparison: Section Headings vs OpenAlex Keywords\n");
  console.log("OpenAlex keywords for this paper:");
  const oaKeywords = [
    "Process (computing) — 56%",
    "Computer science — 45%",
    "Engineering — 41%",
    "Engineering management — 40%",
    "Data science — 38%",
    "Management science — 35%",
  ];
  for (const kw of oaKeywords) {
    console.log(`  ✗ ${kw}`);
  }

  console.log("\nSection-derived keywords:");
  for (const s of sections.slice(0, 6)) {
    console.log(`  ✓ ${s.name}`);
  }

  console.log(
    "\n→ Section headings capture the paper's actual conceptual structure",
  );
  console.log(
    "  while OpenAlex keywords are discipline-level labels.\n",
  );
}

main().catch(console.error);
