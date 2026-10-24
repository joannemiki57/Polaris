# Cursor Anchor Paper

## Paper
- Title: Composer 2 Technical Report
- Link: https://arxiv.org/abs/2603.24477
- Domain: Agentic software engineering, evaluation, training systems
- Why it matters for this hackathon: It is a publication authored by Cursor Research and can be the story-opening reference for judges from Cursor.

## Condensed Abstract Insight
Composer 2 is presented as a domain-specialized coding model trained with continued pretraining plus large-scale RL in an environment that matches real Cursor tooling. The report introduces evaluation on harder, realistic software tasks (CursorBench) and reports major gains over prior Composer versions while staying competitive on public benchmarks.

## Problem The Paper Tries To Solve
- Public coding benchmarks are often misaligned with real developer workflows.
- Long-horizon agent behavior is hard to train if evaluation and environment fidelity are weak.
- Frontier quality needs to be balanced with cost and interactivity.

## Research Friction Exposed
- Realistic benchmark creation is expensive and continuous.
- Offline metrics can diverge from true user value.
- Agent reliability depends on environment fidelity, not just model scale.

## Startup Product Opportunity
## Concept
ResearchOps for Scientific Agents: a platform that creates realistic, domain-grounded evaluation suites for research agents (robotics, quantum simulation, lab automation), then links offline scoring to live task outcomes.

## MVP
- Ingest real researcher workflows (task traces, notebook logs, experiment scripts)
- Auto-build benchmark tasks and hidden test harnesses
- Evaluate model variants with realism-aligned scoring
- Show Pareto frontier: accuracy vs latency vs cost vs failure risk

## Why Judges May Like It
- Directly extends a known Cursor research direction (real-world evaluation fidelity).
- Demonstrates understanding of model quality beyond leaderboard chasing.
- Feels like a product, not just a model demo.

## Hackathon Demo Angle
- Show 3 agent variants solving the same research task corpus.
- Reveal that "best public benchmark score" is not always best in real workflow success.
- Use this as the opening narrative before branching into Physical AI and Quantum use cases.