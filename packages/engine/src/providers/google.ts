import type { Logger } from '../log.ts';
import type { IProvider, ProviderRequest, ProviderResponse } from './types.ts';
import { GoogleGenAI, type Content } from '@google/genai';

/**
 * Implements IProvider for Google's Gemini API.
 * Requires the GoogleGenerativeAI SDK: npm install @google/genai
 */
export class GoogleProvider implements IProvider {
  private apiKey: string | undefined;
  private logger: Logger;

  private ai: GoogleGenAI;

  /**
   * Creates a new Google provider.
   *
   * @param apiKey - The Google API key. If not provided, will try to use process.env.GOOGLE_API_KEY
   */
  constructor(logger: Logger, apiKey?: string) {
    // Use provided API key or fall back to environment variable
    this.apiKey = apiKey || process.env.GOOGLE_API_KEY;
    this.logger = logger;
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
  }

  /**
   * Generates a completion from Google's Gemini API.
   *
   * @param request - The request parameters
   * @returns A Promise resolving to the provider's response
   */
  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'Google API key is required. Provide it explicitly or set GOOGLE_API_KEY environment variable.'
      );
    }

    try {
      // Prepare messages, including system message if provided
      const messages: Content[] = [];

      // Add conversation history
      for (const msg of request.messages) {
        // Skip tool messages as Google doesn't support them directly
        if (msg.role === 'tool') {
          continue;
        }

        // Skip messages with null content
        if (msg.content == null) {
          continue;
        }

        const role: 'user' | 'model' = msg.role === 'user' ? 'user' : 'model';
        messages.push({
          role,
          parts: [{ text: msg.content }]
        });
      }

      // Extract specific parameters for Gemini
      const {
        temperature = 1.0,
        max_tokens = 1024,
        top_p,
        top_k
      } = request.parameters;

      if (top_p !== undefined && typeof top_p !== 'number') {
        throw new Error('top_p must be a number');
      }
      if (top_k !== undefined && typeof top_k !== 'number') {
        throw new Error('top_k must be a number');
      }

      const req = {
        model: request.model,
        contents: messages,
        config: {
          temperature,
          maxOutputTokens: max_tokens,
          topP: top_p,
          topK: top_k,
          systemInstruction: request.systemMessage
        }
      };
      this.logger.log('Google request:\n' + JSON.stringify(req, null, 2));
      const response = await this.ai.models.generateContent(req);
      this.logger.log('Google response:\n' + JSON.stringify(response, null, 2));

      return {
        message: {
          role: 'assistant',
          content: response.text ?? ''
        },
        usage: {
          input_tokens: response.usageMetadata?.promptTokenCount,
          output_tokens: response.usageMetadata?.candidatesTokenCount,
          raw: response.usageMetadata
        },
        rawResponse: response
      };
    } catch (error) {
      // Handle API errors
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error occurred when calling Google API';

      console.error('Google API error:', error);
      throw new Error(`Google provider error: ${errorMessage}`);
    }
  }
}
