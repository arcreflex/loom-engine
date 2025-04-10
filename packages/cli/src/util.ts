import type { Message } from '@ankhdt/loom-engine';
import chalk from 'chalk';

export function formatError(err: unknown, debug: boolean) {
  let message = err instanceof Error ? err.message : String(err);
  if (!message.trim()) {
    message = 'An unknown error occurred.';
  }
  if (debug && err instanceof Error) {
    message += '\n' + err.stack;
  }
  return message;
}

export const formatMessage = (message: Message): string => {
  const content = message.content.trim();

  switch (message.role) {
    case 'user':
      return chalk.green(`[User] ${content}`);
    case 'assistant':
      return chalk.cyan(`[Assistant] ${content}`);
    default:
      return chalk.white(`[${message.role}] ${content}`);
  }
};
