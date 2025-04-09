import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { coalesceMessages } from './coalesce-messages.ts';
import type { Message } from './types.ts';

describe('coalesceMessages', () => {
  it('should return an empty array when given an empty array', () => {
    const result = coalesceMessages([]);
    assert.deepEqual(result, []);
  });

  it('should return the original message array when there are no adjacent messages with the same role', () => {
    const messages: Message[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
      { role: 'assistant', content: 'How can I help you?' },
      { role: 'user', content: 'Tell me about message coalescing.' }
    ];

    const result = coalesceMessages(messages);

    assert.equal(result.length, 4);
    assert.deepEqual(result, [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
      { role: 'assistant', content: 'How can I help you?' },
      { role: 'user', content: 'Tell me about message coalescing.' }
    ]);
  });

  it('should coalesce adjacent messages with the same role', () => {
    const messages: Message[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
      { role: 'user', content: 'How are you?' },
      { role: 'assistant', content: 'I am doing well.' },
      { role: 'assistant', content: 'How can I help you today?' },
      { role: 'user', content: 'Tell me about message coalescing.' }
    ];

    const result = coalesceMessages(messages);

    assert.equal(result.length, 4);
    assert.deepEqual(result, [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!How are you?' },
      {
        role: 'assistant',
        content: 'I am doing well.How can I help you today?'
      },
      { role: 'user', content: 'Tell me about message coalescing.' }
    ]);
  });

  it('should coalesce multiple adjacent messages with the same role', () => {
    const messages: Message[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Part 1' },
      { role: 'user', content: 'Part 2' },
      { role: 'user', content: 'Part 3' },
      { role: 'assistant', content: 'Response' }
    ];

    const result = coalesceMessages(messages);

    assert.equal(result.length, 3);
    assert.deepEqual(result, [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Part 1Part 2Part 3' },
      { role: 'assistant', content: 'Response' }
    ]);
  });

  it('should use the provided separator', () => {
    const messages: Message[] = [
      { role: 'user', content: 'First message' },
      { role: 'user', content: 'Second message' }
    ];

    const result = coalesceMessages(messages, ' --- ');

    assert.equal(result.length, 1);
    assert.deepEqual(result, [
      { role: 'user', content: 'First message --- Second message' }
    ]);
  });

  it('should handle all message role types', () => {
    const messages: Message[] = [
      { role: 'system', content: 'System instruction' },
      { role: 'system', content: 'Additional instruction' },
      { role: 'user', content: 'User request' },
      { role: 'assistant', content: 'Assistant response' },
      { role: 'user', content: 'Follow-up' }
    ];

    const result = coalesceMessages(messages);

    assert.equal(result.length, 5);
    assert.deepEqual(result, [
      { role: 'system', content: 'System instructionAdditional instruction' },
      { role: 'user', content: 'User request' },
      { role: 'assistant', content: 'Assistant response' },
      { role: 'user', content: 'Follow-up' }
    ]);
  });

  it('should create a new array rather than modifying the original', () => {
    const originalMessages: Message[] = [
      { role: 'user', content: 'Message 1' },
      { role: 'user', content: 'Message 2' }
    ];

    const copiedMessages = [...originalMessages];
    const result = coalesceMessages(originalMessages);

    // Ensure the original array wasn't modified
    assert.deepEqual(originalMessages, copiedMessages);
    // Ensure the result is different
    assert.notDeepEqual(result, originalMessages);
  });
});
