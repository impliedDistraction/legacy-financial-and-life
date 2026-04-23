#!/usr/bin/env node

/**
 * Legacy Financial & Life — Facebook Comment Draft Generator
 *
 * Reads Facebook comments (from a JSON file or stdin) and generates
 * draft replies using the local Qwen3:30b model via Ollama.
 *
 * Usage:
 *   node generate-comment-drafts.js --file comments.json
 *   echo '{"comments":["Great post!"]}' | node generate-comment-drafts.js
 *   node generate-comment-drafts.js --interactive
 */

import { readFileSync } from 'fs';
import { readFile } from 'fs/promises';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'legacy-messenger';

const SYSTEM_PROMPT = `You are a social media assistant for Legacy Financial & Life, an insurance agency run by Tim and Beth Byrd in Luthersville, Georgia.

Your job is to draft reply comments to Facebook posts and ads for Tim and Beth to review before posting. Your drafts should sound like they come from Tim or Beth personally.

About Legacy Financial & Life:
- Tim and Beth Byrd, Luthersville, Georgia
- 15+ years combined experience, 300+ policies sold in 2 years
- Products: Term Life, Whole Life, Universal Life, Final Expense, IUL, Annuities, Estate Planning
- Licensed in: GA, OH, OK, SC, MS, MI, TX, UT, AL, LA
- Carriers: Mutual of Omaha, Transamerica, Aflac
- Booking: https://app.ringy.com/book/legacy
- Phone: (706) 333-5641

Rules:
- Keep replies to 2-4 sentences
- Write as Tim, Beth, or "we"
- Warm, personal tone — like a knowledgeable neighbor
- Soft call-to-action when appropriate (not every reply)
- NEVER quote premiums, rates, or dollar amounts
- NEVER disparage competitors
- NEVER make guaranteed return claims

For each comment, output ONLY:
DRAFT REPLY: [your reply text]
TONE: [one word: empathetic/encouraging/informative/redirect]
CTA: [yes/no]`;

async function generateReply(comment) {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3:30b',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Draft a reply to this Facebook comment:\n\n"${comment}"` }
      ],
      stream: false,
      options: {
        temperature: 0.7,
        top_p: 0.9,
        num_predict: 2048,
      },
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  let content = data.message?.content || 'Error: No response generated';

  // Qwen3 models may emit thinking in <think>...</think> tags or as prefixed reasoning.
  // Strip everything before </think> if present.
  const thinkEnd = content.indexOf('</think>');
  if (thinkEnd !== -1) {
    content = content.substring(thinkEnd + 8).trim();
  }

  // Also strip any leading reasoning that doesn't have think tags
  // (Qwen3 30B sometimes reasons inline before the actual reply)
  const draftMatch = content.match(/(?:DRAFT REPLY:|Hi |Hello|Hey |Great |Thank |We |So glad|That's|Absolutely)/);
  if (draftMatch && draftMatch.index > 200) {
    // If the actual reply starts far into the content, strip the preamble
    content = content.substring(draftMatch.index);
  }

  return content;
}

async function processComments(comments) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('Legacy Financial & Life — Comment Draft Generator');
  console.log(`Model: ${MODEL} | Ollama: ${OLLAMA_URL}`);
  console.log(`${'='.repeat(60)}\n`);

  for (let i = 0; i < comments.length; i++) {
    const comment = comments[i];
    console.log(`--- Comment ${i + 1} of ${comments.length} ---`);
    console.log(`ORIGINAL: "${comment}"\n`);

    try {
      const reply = await generateReply(comment);
      console.log(reply);
    } catch (err) {
      console.error(`Error generating reply: ${err.message}`);
    }

    console.log(`\n${'─'.repeat(60)}\n`);
  }

  console.log('All drafts generated. Review before posting!\n');
}

async function interactiveMode() {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log('Legacy Financial & Life — Interactive Comment Drafter');
  console.log(`Model: ${MODEL}`);
  console.log('Type a Facebook comment to generate a draft reply.');
  console.log('Type "quit" or "exit" to stop.');
  console.log(`${'='.repeat(60)}\n`);

  const askQuestion = () => {
    rl.question('Comment> ', async (input) => {
      const trimmed = input.trim();
      if (!trimmed || trimmed === 'quit' || trimmed === 'exit') {
        console.log('Goodbye!');
        rl.close();
        return;
      }

      console.log('\nGenerating draft...\n');
      try {
        const reply = await generateReply(trimmed);
        console.log(reply);
      } catch (err) {
        console.error(`Error: ${err.message}`);
      }
      console.log(`\n${'─'.repeat(40)}\n`);
      askQuestion();
    });
  };

  askQuestion();
}

// --- Main ---
const args = process.argv.slice(2);

if (args.includes('--interactive') || args.includes('-i')) {
  interactiveMode();
} else if (args.includes('--file') || args.includes('-f')) {
  const fileIndex = args.indexOf('--file') !== -1 ? args.indexOf('--file') : args.indexOf('-f');
  const filePath = args[fileIndex + 1];
  if (!filePath) {
    console.error('Error: --file requires a path argument');
    process.exit(1);
  }
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    const comments = data.comments || data;
    if (!Array.isArray(comments)) {
      console.error('Error: JSON must contain a "comments" array or be an array');
      process.exit(1);
    }
    processComments(comments);
  } catch (err) {
    console.error(`Error reading file: ${err.message}`);
    process.exit(1);
  }
} else if (!process.stdin.isTTY) {
  // Read from stdin
  let input = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const comments = data.comments || data;
      processComments(comments);
    } catch {
      // Treat as a single comment
      processComments([input.trim()]);
    }
  });
} else {
  // Default: interactive mode
  interactiveMode();
}
