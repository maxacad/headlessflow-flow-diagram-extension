import fs from "node:fs";
import path from "node:path";

const inputDir = path.resolve(".github/clean");
const outputDir = path.resolve(".github/flow-dsl-clean");

function readTag(block, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
  const m = block.match(re);
  return m ? m[1].trim() : undefined;
}

function decodeXml(text) {
  if (!text) return text;
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function toYamlScalar(v) {
  if (v === undefined || v === null) return "null";
  const s = String(v);
  if (s === "true" || s === "false") return s;
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;
  return JSON.stringify(s);
}

function collectPairs(block, outerTag, keyTag, valueTag) {
  const out = [];
  const re = new RegExp(`<${outerTag}[^>]*>([\\s\\S]*?)<\\/${outerTag}>`, "g");
  let m;
  while ((m = re.exec(block)) !== null) {
    const part = m[1];
    const key = readTag(part, keyTag);
    const value = readTag(part, valueTag);
    if (key !== undefined) {
      out.push({ key: decodeXml(key), value: decodeXml(value ?? "") });
    }
  }
  return out;
}

function nodeTypeToDsl(fullType) {
  const short = fullType.split(".").pop() || fullType;
  const map = {
    DCallNode: "call",
    DPipeletNode: "pipelet",
    DDecisionNode: "decision",
    DLoopNode: "loop",
    DJoinNode: "join",
    DJumpNode: "jump",
    DEndNode: "end",
    DInteractionNode: "interaction",
    DInteractionContinueNode: "interaction_continue",
    DTextNode: "text",
    DStopNode: "stop",
  };
  return { short, type: map[short] || "custom" };
}

function parseNodes(xml) {
  const entries = [];
  const steps = [];
  const nodeRe = /<DNode\s+dbo\.type="([^"]+)"\s+id="([^"]+)"\s*>[\s\S]*?<\/DNode>/g;
  let m;
  while ((m = nodeRe.exec(xml)) !== null) {
    const fullType = m[1];
    const id = m[2];
    const block = m[0];
    const { short, type } = nodeTypeToDsl(fullType);

    if (short === "DStartNode") {
      const params = [];
      const spRe = /<DStartParameter[^>]*>([\s\S]*?)<\/DStartParameter>/g;
      let sp;
      while ((sp = spRe.exec(block)) !== null) {
        const p = sp[1];
        params.push({
          key: decodeXml(readTag(p, "key") || "Input"),
          type: decodeXml(readTag(p, "type") || "java.lang.String"),
          required: (readTag(p, "required") || "false").toLowerCase() === "true",
        });
      }

      entries.push({
        id,
        name: decodeXml(readTag(block, "name") || id),
        mode: decodeXml(readTag(block, "callMode") || "private"),
        strict: (readTag(block, "strict") || "false").toLowerCase() === "true",
        inputs: params,
      });
      continue;
    }

    const step = { id, type };
    if (type === "custom") step.sourceType = short;

    const startNameRef = readTag(block, "startNameRef");
    const pipeletName = readTag(block, "pipeletName");
    const condition = readTag(block, "conditionKey");

    if (type === "call" && startNameRef) step.ref = decodeXml(startNameRef);
    if (type === "jump" && startNameRef) step.ref = decodeXml(startNameRef);
    if (type === "pipelet" && pipeletName) step.ref = decodeXml(pipeletName);
    if (type === "decision" && condition) step.condition = decodeXml(condition);
    if (type === "end") {
      const strict = readTag(block, "strict");
      if (strict) step.strict = strict.toLowerCase() === "true";

      const outputs = [];
      const rvRe = /<DReturnValue[^>]*>([\s\S]*?)<\/DReturnValue>/g;
      let rv;
      while ((rv = rvRe.exec(block)) !== null) {
        const part = rv[1];
        outputs.push({
          key: decodeXml(readTag(part, "key") || "Output"),
          type: decodeXml(readTag(part, "type") || "java.lang.String"),
          guaranteed: (readTag(part, "guaranteed") || "false").toLowerCase() === "true",
        });
      }
      if (outputs.length > 0) step.outputs = outputs;
    }

    if (type === "pipelet" || type === "call") {
      const bindings = collectPairs(block, "DDictionaryKeyBinding", "key", "alias");
      if (bindings.length > 0) {
        step.bindings = {};
        for (const b of bindings) step.bindings[b.key] = b.value;
      }
    }

    if (type === "pipelet") {
      const configs = collectPairs(block, "DPipeletConfigProperty", "key", "value");
      if (configs.length > 0) {
        step.config = {};
        for (const c of configs) step.config[c.key] = c.value;
      }
    }

    steps.push(step);
  }

  return { entries, steps };
}

function parseLinks(xml) {
  const links = [];
  const trRe = /<DTransition\s+dbo\.type="[^"]+"\s+id="([^"]+)"\s*>[\s\S]*?<\/DTransition>/g;
  let m;
  while ((m = trRe.exec(xml)) !== null) {
    const block = m[0];
    const from = readTag(block, "fromId");
    const via = readTag(block, "fromConnector");
    const to = readTag(block, "toId");
    const into = readTag(block, "toConnector");
    if (!from || !to) continue;
    links.push({
      from: decodeXml(from),
      via: decodeXml(via || "next"),
      to: decodeXml(to),
      into: decodeXml(into || "in"),
    });
  }
  return links;
}

function toYaml(flow) {
  const lines = [];
  lines.push(`flow: ${toYamlScalar(flow.flow)}`);
  lines.push(`kind: ${toYamlScalar(flow.kind)}`);
  lines.push("");

  lines.push("entries:");
  if (flow.entries.length === 0) {
    lines.push("  []");
  } else {
    for (const e of flow.entries) {
      lines.push(`  - id: ${toYamlScalar(e.id)}`);
      lines.push(`    name: ${toYamlScalar(e.name)}`);
      lines.push(`    mode: ${toYamlScalar(e.mode)}`);
      lines.push(`    strict: ${toYamlScalar(e.strict)}`);
      lines.push("    inputs:");
      if (!e.inputs || e.inputs.length === 0) {
        lines.push("      []");
      } else {
        for (const i of e.inputs) {
          lines.push(`      - key: ${toYamlScalar(i.key)}`);
          lines.push(`        type: ${toYamlScalar(i.type)}`);
          lines.push(`        required: ${toYamlScalar(i.required)}`);
        }
      }
    }
  }

  lines.push("");
  lines.push("steps:");
  if (flow.steps.length === 0) {
    lines.push("  []");
  } else {
    for (const s of flow.steps) {
      lines.push(`  - id: ${toYamlScalar(s.id)}`);
      lines.push(`    type: ${toYamlScalar(s.type)}`);
      if (s.sourceType) lines.push(`    sourceType: ${toYamlScalar(s.sourceType)}`);
      if (s.ref !== undefined) lines.push(`    ref: ${toYamlScalar(s.ref)}`);
      if (s.condition !== undefined) lines.push(`    condition: ${toYamlScalar(s.condition)}`);
      if (s.strict !== undefined) lines.push(`    strict: ${toYamlScalar(s.strict)}`);
      if (s.config) {
        lines.push("    config:");
        const keys = Object.keys(s.config);
        if (keys.length === 0) {
          lines.push("      {}");
        } else {
          for (const k of keys) {
            lines.push(`      ${k}: ${toYamlScalar(s.config[k])}`);
          }
        }
      }
      if (s.bindings) {
        lines.push("    bindings:");
        const keys = Object.keys(s.bindings);
        if (keys.length === 0) {
          lines.push("      {}");
        } else {
          for (const k of keys) {
            lines.push(`      ${k}: ${toYamlScalar(s.bindings[k])}`);
          }
        }
      }
      if (s.outputs) {
        lines.push("    outputs:");
        for (const o of s.outputs) {
          lines.push(`      - key: ${toYamlScalar(o.key)}`);
          lines.push(`        type: ${toYamlScalar(o.type)}`);
          lines.push(`        guaranteed: ${toYamlScalar(o.guaranteed)}`);
        }
      }
    }
  }

  lines.push("");
  lines.push("links:");
  if (flow.links.length === 0) {
    lines.push("  []");
  } else {
    for (const l of flow.links) {
      lines.push(`  - from: ${toYamlScalar(l.from)}`);
      lines.push(`    via: ${toYamlScalar(l.via)}`);
      lines.push(`    to: ${toYamlScalar(l.to)}`);
      lines.push(`    into: ${toYamlScalar(l.into)}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function convertFile(xmlFilePath) {
  const xml = fs.readFileSync(xmlFilePath, "utf8");
  const name = decodeXml(readTag(xml, "name") || path.basename(xmlFilePath, ".xml"));
  const kind = decodeXml(readTag(xml, "type") || "process");
  const { entries, steps } = parseNodes(xml);
  const links = parseLinks(xml);
  return toYaml({ flow: name, kind, entries, steps, links });
}

function main() {
  if (!fs.existsSync(inputDir)) {
    console.error(`Input dir not found: ${inputDir}`);
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const files = fs
    .readdirSync(inputDir)
    .filter((f) => f.endsWith(".xml"))
    .sort((a, b) => a.localeCompare(b));

  let converted = 0;
  for (const file of files) {
    const inPath = path.join(inputDir, file);
    const outPath = path.join(outputDir, `${path.basename(file, ".xml")}.flow.yaml`);
    const yaml = convertFile(inPath);
    fs.writeFileSync(outPath, yaml, "utf8");
    converted += 1;
  }

  const indexPath = path.join(outputDir, "_index.txt");
  fs.writeFileSync(indexPath, files.map((f) => `${f} -> ${path.basename(f, ".xml")}.flow.yaml`).join("\n") + "\n", "utf8");

  console.log(`Converted ${converted} files into ${outputDir}`);
}

main();
