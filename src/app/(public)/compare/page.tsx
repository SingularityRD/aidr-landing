import Link from "next/link";
import { Callout, DataTable, DocHeader, DocSection } from "@/components/site/Doc";
import { pageMetadata } from "@/lib/site/metadata";

export const metadata = pageMetadata({
  title: "Where AIDR fits",
  description:
    "How agent tool-call detection relates to other AI security controls such as prompt filtering, model scanning and output validation.",
  path: "/compare",
});

type Layer = { layer: string; typicalFocus: string; aidr: string };

const LAYERS: Layer[] = [
  {
    layer: "Prompt and response filtering",
    typicalFocus: "Screens text going to and from a model for injection, data leakage or policy violations.",
    aidr:
      "Not its job. AIDR looks at the actions an agent tries to take, and the rule set includes prompt-injection patterns that can appear in tool arguments and tool output.",
  },
  {
    layer: "Model and ML pipeline scanning",
    typicalFocus: "Checks model files, notebooks and training pipelines for tampering and unsafe components.",
    aidr: "Out of scope. AIDR does not scan models or training pipelines.",
  },
  {
    layer: "Output validation libraries",
    typicalFocus: "Enforces structure, schema and quality on what a model returns to an application.",
    aidr: "Out of scope. This is a reliability concern rather than a threat-detection one.",
  },
  {
    layer: "Agent tool-call detection and response",
    typicalFocus: "Inspects commands, file operations, web requests and MCP calls an agent makes on a machine.",
    aidr:
      "This is where AIDR sits. It evaluates a call before it runs, where the host provides a hook, and applies rules and policy.",
  },
  {
    layer: "Endpoint and network controls",
    typicalFocus: "Operating-system level monitoring, sandboxing and egress filtering that apply to every process.",
    aidr:
      "Complementary. AIDR is not an endpoint agent, a sandbox or a network filter, and it cannot see actions that bypass the host hook.",
  },
];

export default function ComparePage() {
  return (
    <>
      <DocHeader
        eyebrow="Where AIDR fits"
        title="Where AIDR fits among AI security controls"
        lead="Different tools protect different layers. AIDR focuses on one: the tool calls an AI coding agent makes. It is meant to sit alongside the other layers, not replace them."
      />

      <DocSection id="layers" title="Layers and where AIDR applies">
        <DataTable
          caption="Layers of AI security and AIDR's relationship to each"
          rows={LAYERS}
          rowKey={(row) => row.layer}
          columns={[
            { header: "Layer", render: (row) => row.layer, rowHeader: true },
            { header: "Typical focus", render: (row) => row.typicalFocus },
            { header: "AIDR", render: (row) => row.aidr },
          ]}
        />
      </DocSection>

      <DocSection id="honest" title="What this page does not claim">
        <ul>
          <li>It does not rank AIDR against named vendors, and it does not quote competitor pricing or funding.</li>
          <li>
            It does not claim that AIDR detects everything. Detection can miss attacks and can flag harmless actions, and
            efficacy has not been independently measured yet.
          </li>
          <li>
            It does not claim coverage for every host. See the <Link href="/install">per-connector limits</Link>.
          </li>
        </ul>
        <Callout tone="info" title="Evaluating tools?">
          Ask every vendor for their supported-host matrix, known bypasses and what has been independently tested. We will
          share ours in the <Link href="/trust">trust center</Link>.
        </Callout>
        <div className="btn-row">
          <Link className="btn" href="/pilot">
            Apply for a 14-day evaluation
          </Link>
          <Link className="btn btn-secondary" href="/pricing">
            Evaluation and pricing
          </Link>
        </div>
      </DocSection>
    </>
  );
}
