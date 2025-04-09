import { LoomEngine } from './index.ts';

// This is a simple example of how to use the loom-engine library
async function main() {
  // Create a data directory for storing conversation trees
  const dataDir = './data';

  // Initialize the loom engine
  const loom = new LoomEngine(dataDir);

  // Create a new conversation root using OpenAI
  const rootConfig = {
    providerType: 'openai' as const,
    model: 'gpt-4',
    parameters: {
      temperature: 0.7,
      max_tokens: 500
    },
    systemPrompt: 'You are a helpful assistant that provides concise responses.'
  };

  try {
    // This would generate a response in a real scenario, but we'll skip the API call
    // console.log('Generating a response...');
    // const responseNode = await loom.generateNext(rootNode.uuid, 'Tell me about the loom of time concept.');
    // console.log(`Response received: ${responseNode.messages[0].content}`);

    // Instead, let's manually append messages
    console.log('Appending messages...');
    const userMessage = {
      role: 'user' as const,
      content: 'Tell me about the loom of time concept.'
    };
    const assistantMessage = {
      role: 'assistant' as const,
      content:
        'The "loom of time" concept is a metaphor representing how conversational interactions with AI can be seen as threads that can branch into multiple simultaneous timelines. Like a loom weaves threads, this framework allows for managing branching conversations where users can explore different paths from any point in a dialogue history. You can return to previous points and branch off in new directions, creating a non-linear tree-like structure of interactions rather than a single linear thread.'
    };

    const responseNode = await loom.generate(rootConfig, [userMessage]);
    console.log(`Response message appended with node ID: ${responseNode.id}`);

    // Get the full conversation history
    console.log('Retrieving conversation history...');
    const { messages } = await loom.getMessages(responseNode.id);

    console.log('\nFull conversation:');
    messages.forEach(msg => {
      console.log(`[${msg.role}]: ${msg.content.substring(0, 50)}...`);
    });
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the example
main().catch(console.error);
