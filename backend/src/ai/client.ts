import OpenAI from 'openai';
import { config } from '../config';

/**
 * Every module under src/ai depends on this instance and plain data
 * arguments only — never on dockerode. pipeline.ts is the sole bridge
 * between Docker execution and these AI calls.
 */
export const openai = new OpenAI({ apiKey: config.openaiApiKey });
