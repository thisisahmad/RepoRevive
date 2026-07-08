import { openai } from './client';
import { config } from '../config';
import { UPGRADE_SYSTEM_PROMPT } from './prompts/upgradePrompt';
import { DiagnosisResult, SuggestedUpgrade } from './types';

function tail(text: string, maxChars = 4000): string {
  const trimmed = text.trim();
  return trimmed.length <= maxChars ? trimmed : trimmed.slice(-maxChars);
}

/**
 * Only called for deprecated_package / major_version_breaking_change
 * diagnoses. A suggestion only — the fix loop's own tools make the actual
 * code changes.
 */
export async function suggestUpgrade(
  diagnosis: Pick<DiagnosisResult, 'category' | 'explanation' | 'affectedPackage'>,
  errorLog: string,
  manifestContent: string
): Promise<SuggestedUpgrade | null> {
  try {
    const response = await openai.chat.completions.create({
      model: config.ai.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: UPGRADE_SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            `Diagnosis category: ${diagnosis.category}\n` +
            `Explanation: ${diagnosis.explanation}\n` +
            `Affected package: ${diagnosis.affectedPackage ?? 'unknown'}\n\n` +
            `Error log (tail):\n${tail(errorLog)}\n\n` +
            `Manifest file:\n${tail(manifestContent, 3000)}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (
      typeof parsed.fromPackage !== 'string' ||
      typeof parsed.toPackage !== 'string' ||
      typeof parsed.toVersion !== 'string' ||
      typeof parsed.reason !== 'string'
    ) {
      return null;
    }

    return {
      fromPackage: parsed.fromPackage,
      fromVersion: typeof parsed.fromVersion === 'string' ? parsed.fromVersion : 'unknown',
      toPackage: parsed.toPackage,
      toVersion: parsed.toVersion,
      reason: parsed.reason,
    };
  } catch (err) {
    console.warn('upgrade suggestion failed, continuing without one:', err instanceof Error ? err.message : err);
    return null;
  }
}
