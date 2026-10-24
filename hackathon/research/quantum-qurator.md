# Quantum Brief: Qurator

## Paper
- Title: Qurator: Scheduling Hybrid Quantum-Classical Workflows Across Heterogeneous Cloud Providers
- Link: https://arxiv.org/abs/2604.05505
- Domain: Quantum workflow orchestration, scheduling, cloud systems

## Condensed Abstract Insight
Qurator addresses the queue-time vs fidelity tradeoff in cloud quantum execution. It models hybrid workloads as dynamic DAGs with quantum-specific constraints (entanglement dependencies, no-cloning, synchronization, circuit cutting/merging), and estimates fidelity via a normalized success score across provider calibration data. In simulation with real queue traces, it reports major queue-time reductions while keeping fidelity loss bounded by user target.

## Problem The Paper Tries To Solve
- Quantum jobs wait too long on shared cloud hardware.
- Multi-provider calibration metrics are incompatible.
- Classical schedulers do not handle quantum semantics well.

## Research Friction Exposed
- Real-time provider status is noisy and non-standardized.
- Fidelity prediction is fragile under drifting calibrations.
- Hybrid workflows need orchestration beyond simple job queues.

## Startup Product Opportunity
## Concept
Multi-Cloud Quantum Scheduler as a Service.

## MVP
- Unified provider abstraction and calibration normalization
- Policy engine: optimize for latency, fidelity, or cost
- Workflow graph planner with quantum constraints
- Observability dashboard with what-if rerouting

## Why It Is Hackathon-Friendly
- Immediate business value for quantum teams using cloud backends.
- Clear demo metric: lower wall-clock with controlled fidelity impact.