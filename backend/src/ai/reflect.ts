import { openai } from './client';
import { config } from '../config';
import { REFLECTION_SYSTEM_PROMPT } from './prompts/reflectionPrompt';
import { Reflection, ReflectionInput } from './types';

function tail(text: string, maxChars = 3000): string {
  const trimmed = text.trim();
  return trimmed.length <= maxChars ? trimmed : `…(truncated)…\n${trimmed.slice(-maxChars)}`;
}

function clamp01(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

/**
 * Used when the model can't be reached or returns garbage. Crucially, on a
 * *failed* attempt this defaults shouldRetry to true so a transient API hiccup
 * never masquerades as an "unfixable" verdict and cuts the loop short.
 */
function fallbackReflection(input: ReflectionInput): Reflection {
  const whatChanged = input.filesChanged.length
    ? `Modified: ${input.filesChanged.join(', ')}.`
    : input.explanation || 'No files were changed.';

  if (input.succeeded) {
    return {
      attemptFailed: false,
      failureReason: 'The change resolved the failure and the project re-tested successfully.',
      whatChanged,
      nextStrategy: 'No further action needed.',
      shouldRetry: false,
      confidence: 1,
    };
  }

  return {
    attemptFailed: true,
    failureReason: 'The reflection step could not be generated automatically; the previous change did not resolve the error.',
    whatChanged,
    nextStrategy: 'Re-examine the latest error and try a different, more targeted change than the last one.',
    shouldRetry: true,
    confidence: 0.3,
  };
}

/**
 * Post-mortem on a single fix attempt. Runs after the change was re-tested,
 * between "attempt result comes back" and "decide whether to retry". Pure
 * data in, data out — no Docker. Its shouldRetry verdict lets the fix loop
 * stop early instead of burning through attempts on an unfixable failure.
 */
export async function reflectOnAttempt(input: ReflectionInput): Promise<Reflection> {
  const fallback = fallbackReflection(input);

  try {
    const outcome = input.succeeded
      ? 'Outcome after the change: the project installed and ran successfully.'
      : `Outcome after the change: the project STILL failed. New error/outcome:\n${tail(input.outcomeError ?? 'unknown')}`;

    const userContent = [
      `Attempt number: ${input.attemptNumber}`,
      `Error before this attempt:\n${tail(input.errorBefore)}`,
      `Files changed in this attempt: ${input.filesChanged.length ? input.filesChanged.join(', ') : 'none'}`,
      `Diff of this attempt:\n${tail(input.diff) || '(no diff was produced)'}`,
      `The fixer's own summary of the change: ${input.explanation}`,
      `Command run to re-test: ${input.retestCommand}`,
      outcome,
    ].join('\n\n');

    const response = await openai.chat.completions.create({
      model: config.ai.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: REFLECTION_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return fallback;

    const parsed = JSON.parse(raw);

    const reflection: Reflection = {
      attemptFailed: typeof parsed.attemptFailed === 'boolean' ? parsed.attemptFailed : fallback.attemptFailed,
      failureReason: typeof parsed.failureReason === 'string' ? parsed.failureReason : fallback.failureReason,
      whatChanged: typeof parsed.whatChanged === 'string' ? parsed.whatChanged : fallback.whatChanged,
      nextStrategy: typeof parsed.nextStrategy === 'string' ? parsed.nextStrategy : fallback.nextStrategy,
      shouldRetry: typeof parsed.shouldRetry === 'boolean' ? parsed.shouldRetry : fallback.shouldRetry,
      confidence: clamp01(parsed.confidence, fallback.confidence),
    };

    // A successful re-test is terminal regardless of what the model says.
    if (input.succeeded) {
      reflection.attemptFailed = false;
      reflection.shouldRetry = false;
    }

    return reflection;
  } catch (err) {
    console.warn('reflection failed, falling back:', err instanceof Error ? err.message : err);
    return fallback;
  }
}
