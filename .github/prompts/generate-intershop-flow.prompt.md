---
mode: ask
description: "Generate an Intershop-style DPipeline XML flow from requirements"
model: GPT-5
---

Generate a new Intershop-style pipeline XML based on the requirements below.

Requirements:
${input:requirements:Example: ProcessInventorySync | process | read feed, validate, upsert, error branch}

Rules:
- Follow the conventions in .github/skills/intershop-pipeline-flow-generator/SKILL.md.
- Apply connector conventions from .github/skills/intershop-pipeline-flow-generator/references/pipeline-patterns.md.
- Return one complete XML file body.
- Keep output strictly XML unless I explicitly ask for explanation.
