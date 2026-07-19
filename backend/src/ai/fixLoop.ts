import { createPatch } from 'diff';
import OpenAI from 'openai';
import { config } from '../config';
import { openai } from './client';
import { FIX_LOOP_SYSTEM_PROMPT } from './prompts/fixLoopPrompt';
import { DiagnosisResult, FixLoopResult, Reflection, ToolExecutors } from './types';

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ToolCall = OpenAI.Chat.Completions.ChatCompletionMessageToolCall;

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: "Read a file's contents, relative to the project root.",
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File path relative to the project root' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Overwrite a file with new contents, relative to the project root.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to the project root' },
          content: { type: 'string', description: 'The full new contents of the file' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run a shell command in the project root (e.g. reinstall dependencies, re-run the start command).',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string', description: 'The shell command to run' } },
        required: ['command'],
      },
    },
  },
];

function diagnosisContextBlock(diagnosis: DiagnosisResult): string {
  const lines = [`Diagnosis category: ${diagnosis.category}`, `Explanation: ${diagnosis.explanation}`];
  if (diagnosis.affectedPackage) lines.push(`Affected package: ${diagnosis.affectedPackage}`);
  lines.push(`Suggested direction: ${diagnosis.suggestedFix}`);
  if (diagnosis.suggestedUpgrade) {
    const u = diagnosis.suggestedUpgrade;
    lines.push(`Suggested upgrade: ${u.fromPackage}@${u.fromVersion} -> ${u.toPackage}@${u.toVersion} (${u.reason})`);
  }
  return lines.join('\n');
}

/**
 * Turns the previous attempt's reflection into explicit steering for this
 * attempt. This is what makes the loop's prompt evolve across attempts:
 * instead of just re-sending the error, we tell the fixer why the last fix
 * didn't work and which direction to try instead.
 */
function reflectionContextBlock(reflection: Reflection): string {
  return [
    'A previous automated fix attempt did NOT resolve the failure. Learn from it — do not repeat the same approach.',
    `Why the last change didn't work: ${reflection.failureReason}`,
    `What the last attempt changed: ${reflection.whatChanged}`,
    `Direction to try now instead: ${reflection.nextStrategy}`,
  ].join('\n');
}

/**
 * Runs one bounded tool-calling session against a live container, trying to
 * fix the reported error. Never touches Docker directly — all container
 * access goes through the injected ToolExecutors, which pipeline.ts (the
 * only module allowed to import dockerode) implements.
 *
 * When a priorReflection is supplied (every attempt after the first), its
 * reasoning is injected into the system prompt so this attempt is informed
 * by the last one rather than blind.
 */
export async function runFixAttempt(
  errorLog: string,
  diagnosis: DiagnosisResult,
  tools: ToolExecutors,
  priorReflection?: Reflection | null
): Promise<FixLoopResult> {
  let systemPrompt = `${FIX_LOOP_SYSTEM_PROMPT}\n\n--- Diagnosis for this failure ---\n${diagnosisContextBlock(diagnosis)}`;
  if (priorReflection) {
    systemPrompt += `\n\n--- Reflection on the previous fix attempt ---\n${reflectionContextBlock(priorReflection)}`;
  }
  const changedFiles = new Map<string, { before: string | null; after: string }>();

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `The project failed with this error:\n\n${errorLog.slice(-4000)}\n\nInvestigate and fix it.` },
  ];

  let explanation = '';

  try {
    for (let round = 0; round < config.ai.maxToolRoundsPerAttempt; round++) {
      const response = await openai.chat.completions.create({
        model: config.ai.model,
        messages,
        tools: TOOLS,
      });

      const message = response.choices[0]?.message;
      if (!message) break;
      messages.push(message);

      if (!message.tool_calls || message.tool_calls.length === 0) {
        explanation = message.content?.trim() || 'The model made changes without providing a summary.';
        break;
      }

      for (const call of message.tool_calls) {
        const output = await runTool(call, tools, changedFiles);
        messages.push({ role: 'tool', tool_call_id: call.id, content: output });
      }
    }
  } catch (err) {
    explanation = `The fix attempt stopped early due to an error calling the AI model: ${
      err instanceof Error ? err.message : String(err)
    }`;
  }

  return {
    filesChanged: [...changedFiles.keys()],
    diff: buildDiff(changedFiles),
    explanation: explanation || 'The model ran out of tool-call rounds before confirming a fix.',
  };
}

async function runTool(
  call: ToolCall,
  tools: ToolExecutors,
  changedFiles: Map<string, { before: string | null; after: string }>
): Promise<string> {
  if (call.type !== 'function') return 'unsupported tool call type';

  try {
    const args = JSON.parse(call.function.arguments || '{}');
    switch (call.function.name) {
      case 'read_file':
        return await tools.readFile(args.path);

      case 'write_file': {
        const before = await tools.readFile(args.path).catch(() => null);
        await tools.writeFile(args.path, args.content);
        changedFiles.set(args.path, { before, after: args.content });
        return `wrote ${args.path}`;
      }

      case 'run_command': {
        const result = await tools.runCommand(args.command);
        return `exit code: ${result.timedOut ? 'timeout' : result.exitCode}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
      }

      default:
        return `unknown tool: ${call.function.name}`;
    }
  } catch (err) {
    return `tool error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function buildDiff(changedFiles: Map<string, { before: string | null; after: string }>): string {
  if (changedFiles.size === 0) return '';
  const patches = [...changedFiles.entries()].map(([path, { before, after }]) =>
    createPatch(path, before ?? '', after, before === null ? 'new file' : 'before', 'after')
  );
  return patches.join('\n');
}
