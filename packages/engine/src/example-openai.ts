import { OpenAIProvider } from './providers/openai.ts';

// Example showing how to use the OpenAI provider directly
async function main() {
  try {
    // Create an instance of the OpenAI provider - using environment variable for API key
    // Make sure to set OPENAI_API_KEY environment variable before running this example
    const provider = new OpenAIProvider();

    // Prepare a simple request
    const request = {
      systemMessage:
        'You are a helpful assistant that provides concise responses.',
      messages: [
        {
          role: 'user' as const,
          content: 'Tell me about the loom of time concept in 2-3 sentences.'
        }
      ],
      model: 'gpt-3.5-turbo', // Use a less expensive model for testing
      parameters: {
        max_tokens: 100,
        temperature: 0.7
      }
    };

    // Generate a response
    console.log('Sending request to OpenAI API...');
    const response = await provider.generate(request);

    // Display the result
    console.log('\nResponse from OpenAI:');
    console.log(`[${response.message.role}]: ${response.message.content}`);

    // Display usage information
    if (response.usage) {
      console.log('\nToken usage:');
      console.log(`- Input tokens: ${response.usage.input_tokens}`);
      console.log(`- Output tokens: ${response.usage.output_tokens}`);
      console.log(
        `- Total tokens: ${(response.usage.input_tokens || 0) + (response.usage.output_tokens || 0)}`
      );
    }

    console.log(`\nFinish reason: ${response.finish_reason}`);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the example
main().catch(console.error);
