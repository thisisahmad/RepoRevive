import { openai } from './client';
import { config } from '../config';
import { DIAGNOSIS_SYSTEM_PROMPT } from './prompts/diagnosisPrompt';
import { suggestUpgrade } from './upgradeSuggest';
import { DiagnosisCategory, DiagnosisResult } from './types';

const UPGRADE_ELIGIBLE_CATEGORIES: DiagnosisCategory[] = ['deprecated_package', 'major_version_breaking_change'];

const VALID_CATEGORIES = new Set<DiagnosisCategory>([
  'deprecated_package',
  'major_version_breaking_change',
  'native_build_failure',
  'missing_env_var',
  'version_mismatch',
  'unknown',
]);

function tail(text: string, maxChars = 4000): string {
  const trimmed = text.trim();
  return trimmed.length <= maxChars ? trimmed : trimmed.slice(-maxChars);
}

function fallbackClassification(): Omit<DiagnosisResult, 'suggestedUpgrade'> {
  return {
    category: 'unknown',
    explanation: 'The failure could not be automatically classified.',
    affectedPackage: null,
    suggestedFix: 'Inspect the error log and manifest file manually.',
  };
}

async function classifyFailure(errorLog: string, manifestContent: string): Promise<Omit<DiagnosisResult, 'suggestedUpgrade'>> {
  const fallback = fallbackClassification();

  try {
    const response = await openai.chat.completions.create({
      model: config.ai.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: DIAGNOSIS_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Error log (tail):\n${tail(errorLog)}\n\nManifest file:\n${tail(manifestContent, 3000)}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return fallback;

    const parsed = JSON.parse(raw);
    if (!VALID_CATEGORIES.has(parsed.category)) return fallback;

    return {
      category: parsed.category,
      explanation: typeof parsed.explanation === 'string' ? parsed.explanation : fallback.explanation,
      affectedPackage: typeof parsed.affectedPackage === 'string' ? parsed.affectedPackage : null,
      suggestedFix: typeof parsed.suggestedFix === 'string' ? parsed.suggestedFix : fallback.suggestedFix,
    };
  } catch (err) {
    console.warn('diagnosis classification failed, falling back to "unknown":', err instanceof Error ? err.message : err);
    return fallback;
  }
}

/**
 * Classifies why install/run failed and, for package-related failures,
 * suggests a specific upgrade path. Pure data in, data out — no Docker;
 * containerId is accepted only for log correlation, never used to reach
 * into the container.
 */
export async function diagnoseFailure(
  jobId: string,
  containerId: string,
  errorLog: string,
  manifestContent: string
): Promise<DiagnosisResult> {
  const classification = await classifyFailure(errorLog, manifestContent);

  const suggestedUpgrade = UPGRADE_ELIGIBLE_CATEGORIES.includes(classification.category)
    ? await suggestUpgrade(classification, errorLog, manifestContent)
    : null;

  console.log(`[diagnose] job=${jobId} container=${containerId.slice(0, 12)} category=${classification.category}`);

  return { ...classification, suggestedUpgrade };
}
