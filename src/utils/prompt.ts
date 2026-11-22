// Interactive terminal prompts

import { createInterface } from 'readline';

export function promptText(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

const CTRL_C = 3;
const CTRL_D = 4;
const BACKSPACE = 8;
const DEL = 127;

/**
 * Prompt for a secret without echoing it to the terminal.
 * Falls back to visible input when stdin is not a TTY (e.g. piped).
 */
export function promptHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return promptText(question);
  }

  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.resume();
    stdin.setRawMode(true);

    let input = '';
    const onData = (chunk: Buffer) => {
      const char = chunk.toString('utf8');
      const code = char.charCodeAt(0);

      if (char === '\n' || char === '\r' || code === CTRL_D) {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('data', onData);
        process.stdout.write('\n');
        resolve(input);
      } else if (code === CTRL_C) {
        stdin.setRawMode(false);
        process.stdout.write('\n');
        process.exit(130);
      } else if (code === BACKSPACE || code === DEL) {
        input = input.slice(0, -1);
      } else {
        input += char;
      }
    };

    stdin.on('data', onData);
  });
}
