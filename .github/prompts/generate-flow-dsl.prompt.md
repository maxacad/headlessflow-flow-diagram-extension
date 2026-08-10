---
mode: ask
description: "Generate XML-independent FLOW DSL templates or concrete flows"
model: GPT-5
---

Generate a FLOW DSL output (not XML) from the requirement below.

Requirement:
${input:requirement:Example: ProcessInventorySync | process | import feed, validate, branch on duplicate, upsert, error path}

Rules:
- Use the schema in .github/skills/intershop-pipeline-flow-generator/references/flow-dsl-spec.md.
- Reuse patterns from .github/skills/intershop-pipeline-flow-generator/assets/flow-dsl-templates.md.
- Output only YAML DSL.
- Keep IDs deterministic and readable.
