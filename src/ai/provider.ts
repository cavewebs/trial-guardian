// Vendor-agnostic AI provider interface

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AICompletionOptions {
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export interface AICompletionResult {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface AIProvider {
  name: string;
  complete(options: AICompletionOptions): Promise<AICompletionResult>;
}

// ============================================
// ANTHROPIC PROVIDER
// ============================================
export class AnthropicProvider implements AIProvider {
  name = 'anthropic';
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(options?: { apiKey?: string; model?: string; baseUrl?: string }) {
    this.apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
    this.model = options?.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514';
    this.baseUrl = options?.baseUrl ?? 'https://api.anthropic.com';
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    const systemMessage = options.messages.find((m) => m.role === 'system');
    const otherMessages = options.messages.filter((m) => m.role !== 'system');

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature,
        system: systemMessage?.content,
        messages: otherMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${error}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };

    return {
      content: data.content[0]?.text ?? '',
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      },
    };
  }
}

// ============================================
// OPENAI PROVIDER (OpenAI, Azure, OpenRouter, etc.)
// ============================================
export class OpenAIProvider implements AIProvider {
  name = 'openai';
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(options?: { apiKey?: string; model?: string; baseUrl?: string }) {
    this.apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.model = options?.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o';
    this.baseUrl = options?.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.7,
      messages: options.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (options.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    return {
      content: data.choices[0]?.message?.content ?? '',
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      },
    };
  }
}

// ============================================
// OLLAMA PROVIDER (Local models)
// ============================================
export class OllamaProvider implements AIProvider {
  name = 'ollama';
  private model: string;
  private baseUrl: string;

  constructor(options?: { model?: string; baseUrl?: string }) {
    this.model = options?.model ?? process.env.OLLAMA_MODEL ?? 'llama3.2';
    this.baseUrl = options?.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: options.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? 1024,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} ${error}`);
    }

    const data = await response.json() as {
      message: { content: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };

    return {
      content: data.message?.content ?? '',
      usage: {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
      },
    };
  }
}

// ============================================
// GOOGLE GEMINI PROVIDER
// ============================================
export class GeminiProvider implements AIProvider {
  name = 'gemini';
  private apiKey: string;
  private model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    this.apiKey = options?.apiKey ?? process.env.GOOGLE_AI_API_KEY ?? '';
    this.model = options?.model ?? process.env.GEMINI_MODEL ?? 'gemini-1.5-flash';
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    const systemMessage = options.messages.find((m) => m.role === 'system');
    const otherMessages = options.messages.filter((m) => m.role !== 'system');

    const contents = otherMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.7,
      },
    };

    if (systemMessage) {
      body.systemInstruction = { parts: [{ text: systemMessage.content }] };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${error}`);
    }

    const data = await response.json() as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
    };

    return {
      content: data.candidates[0]?.content?.parts[0]?.text ?? '',
      usage: data.usageMetadata ? {
        inputTokens: data.usageMetadata.promptTokenCount,
        outputTokens: data.usageMetadata.candidatesTokenCount,
      } : undefined,
    };
  }
}

// ============================================
// GROQ PROVIDER (Fast inference)
// ============================================
export class GroqProvider implements AIProvider {
  name = 'groq';
  private apiKey: string;
  private model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    this.apiKey = options?.apiKey ?? process.env.GROQ_API_KEY ?? '';
    this.model = options?.model ?? process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.7,
        messages: options.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error: ${response.status} ${error}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    return {
      content: data.choices[0]?.message?.content ?? '',
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      },
    };
  }
}

// ============================================
// PROVIDER FACTORY
// ============================================
export type ProviderName = 'anthropic' | 'openai' | 'ollama' | 'gemini' | 'groq' | 'custom';

export interface ProviderConfig {
  provider: ProviderName;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

let defaultProvider: AIProvider | null = null;

export function createProvider(config: ProviderConfig): AIProvider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    case 'ollama':
      return new OllamaProvider(config);
    case 'gemini':
      return new GeminiProvider(config);
    case 'groq':
      return new GroqProvider(config);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

export function setDefaultProvider(provider: AIProvider): void {
  defaultProvider = provider;
}

export function getDefaultProvider(): AIProvider {
  if (defaultProvider) {
    return defaultProvider;
  }

  // Auto-detect based on available environment variables
  if (process.env.ANTHROPIC_API_KEY) {
    defaultProvider = new AnthropicProvider();
  } else if (process.env.OPENAI_API_KEY) {
    defaultProvider = new OpenAIProvider();
  } else if (process.env.GROQ_API_KEY) {
    defaultProvider = new GroqProvider();
  } else if (process.env.GOOGLE_AI_API_KEY) {
    defaultProvider = new GeminiProvider();
  } else if (process.env.OLLAMA_MODEL || process.env.OLLAMA_BASE_URL) {
    defaultProvider = new OllamaProvider();
  } else {
    throw new Error(
      'No AI provider configured. Set one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, GROQ_API_KEY, GOOGLE_AI_API_KEY, or OLLAMA_MODEL'
    );
  }

  return defaultProvider;
}

/**
 * Simple completion helper using default provider
 */
export async function complete(
  prompt: string,
  options?: { maxTokens?: number; systemPrompt?: string }
): Promise<string> {
  const provider = getDefaultProvider();

  const messages: AIMessage[] = [];
  if (options?.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const result = await provider.complete({
    messages,
    maxTokens: options?.maxTokens,
  });

  return result.content;
}

/**
 * JSON completion helper - parses response as JSON
 */
export async function completeJSON<T = unknown>(
  prompt: string,
  options?: { maxTokens?: number; systemPrompt?: string }
): Promise<T> {
  const content = await complete(prompt, options);

  // Extract JSON from response (handles markdown code blocks)
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) ?? content.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch?.[1] ?? content;

  try {
    return JSON.parse(jsonStr.trim()) as T;
  } catch {
    throw new Error(`Failed to parse AI response as JSON: ${content.slice(0, 200)}`);
  }
}
