import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Creates reviewable static question files. By default existing files are not
// overwritten. --refresh rebuilds generated files but preserves pilot originals.
const root = new URL('../', import.meta.url).pathname;
const dataDir = join(root, 'data');
const outputDir = join(dataDir, 'quizzes');
const refresh = process.argv.includes('--refresh');
const handWritten = new Set(['1a-hangul.json', '1a-1.json']);
mkdirSync(outputDir, { recursive: true });

const books = readdirSync(dataDir).filter(name => /^[1-6][ab]\.json$/.test(name)).sort()
  .map(name => JSON.parse(readFileSync(join(dataDir, name), 'utf8')));
const counts = bookId => Number(bookId[0]) === 1 ? { vocab: 4, grammar: 4, context: 2 }
  : Number(bookId[0]) <= 3 ? { vocab: 5, grammar: 6, context: 4 }
    : { vocab: 6, grammar: 8, context: 6 };
const normalized = value => value.trim().toLocaleLowerCase('uz');
const unique = (items, key) => [...new Map(items.map(item => [normalized(key(item)), item])).values()];
const hash = value => [...value].reduce((h, char) => Math.imul(h ^ char.codePointAt(0), 16777619) >>> 0, 2166136261);
const spread = (items, count) => Array.from({ length: count }, (_, i) => items[Math.floor((i + .5) * items.length / count)]);

function optionsFor(correct, primary, fallback, seed) {
  const different = value => normalized(value) !== normalized(correct)
    && !normalized(value).includes(normalized(correct)) && !normalized(correct).includes(normalized(value));
  const local = unique(primary.filter(different), value => value)
    .sort((a, b) => hash(`${seed}:${a}`) - hash(`${seed}:${b}`));
  const wider = unique(fallback.filter(different), value => value)
    .filter(value => !local.some(item => normalized(item) === normalized(value)))
    .sort((a, b) => hash(`${seed}:${a}`) - hash(`${seed}:${b}`));
  const pool = [...local, ...wider];
  if (pool.length < 3) throw new Error(`Not enough distinct answer options: ${seed}`);
  const options = [correct, ...pool.slice(0, 3)].sort((a, b) => hash(`${seed}:position:${a}`) - hash(`${seed}:position:${b}`));
  return { options, correctIndex: options.indexOf(correct) };
}

function generate(book, unit) {
  const bookId = book.book.id, unitId = unit.id, target = counts(bookId);
  const key = `${bookId}:${unitId}`;
  const allWords = book.units.flatMap(u => u.vocab_groups.flatMap(g => g.items));
  const words = unique(unit.vocab_groups.flatMap(g => g.items.map(word => ({ ...word, group: g.title }))), word => word.kr);
  const selectedWords = spread(words, target.vocab);
  const questions = [];

  selectedWords.forEach((word, i) => {
    const toUzbek = i % 2 === 0;
    const correct = toUzbek ? word.uz : word.kr;
    const primary = words.filter(w => w.group === word.group).map(w => toUzbek ? w.uz : w.kr);
    const fallback = [...words, ...allWords].map(w => toUzbek ? w.uz : w.kr);
    const answer = optionsFor(correct, primary, fallback, `${key}:v:${i}`);
    questions.push({ id: `v${String(i + 1).padStart(2, '0')}`, topic: 'vocab',
      prompt: toUzbek ? `«${word.kr}» so‘zining ma’nosi qaysi?` : `«${word.uz}» koreyschada qaysi so‘z?`,
      ...answer,
      explanation: `«${word.kr}» — «${word.uz}». Bu so‘z darsdagi «${word.group}» guruhiga kiradi.`,
      reviewSection: 'v' });
  });

  const allGrammar = book.units.flatMap(u => u.grammar);
  const selectedPatterns = spread(unit.grammar, Math.min(unit.grammar.length, Math.floor(target.grammar / 2)));
  selectedPatterns.forEach((grammar, i) => {
    const answer = optionsFor(grammar.title_uz, unit.grammar.map(g => g.title_uz), allGrammar.map(g => g.title_uz), `${key}:g:pattern:${i}`);
    questions.push({ id: `g${String(i + 1).padStart(2, '0')}`, topic: 'grammar',
      prompt: `«${grammar.pattern}» qolipi qanday ma’noni bildiradi?`, ...answer,
      explanation: `«${grammar.pattern}» — ${grammar.title_uz}. ${grammar.analogy}`,
      reviewSection: 'g' });
  });
  const exampleCandidates = [];
  for (let i = 0; i < Math.max(...unit.grammar.map(g => g.examples.length)); i++)
    for (const grammar of unit.grammar) if (grammar.examples[i])
      exampleCandidates.push({ ...grammar.examples[i], grammar });
  const examples = unique(exampleCandidates, example => example.kr);
  const needed = target.grammar - selectedPatterns.length;
  if (examples.length < needed) throw new Error(`Not enough grammar examples: ${key}`);
  const selectedExamples = examples.slice(0, needed);
  const allExamples = book.units.flatMap(u => u.grammar.flatMap(g => g.examples));
  selectedExamples.forEach((example, i) => {
    const toUzbek = i % 2 === 0;
    const correct = toUzbek ? example.uz : example.kr;
    const primary = examples.map(e => toUzbek ? e.uz : e.kr);
    const fallback = allExamples.map(e => toUzbek ? e.uz : e.kr);
    const answer = optionsFor(correct, primary, fallback, `${key}:g:example:${i}`);
    questions.push({ id: `g${String(selectedPatterns.length + i + 1).padStart(2, '0')}`, topic: 'grammar',
      prompt: toUzbek ? `«${example.kr}» gapining o‘zbekcha ma’nosi qaysi?` : `«${example.uz}» ma’nosiga qaysi koreyscha gap mos?`,
      ...answer,
      explanation: `«${example.kr}» — «${example.uz}». Bu yerda «${example.grammar.pattern}» qolipi ishlatilgan: ${example.grammar.title_uz}.`,
      reviewSection: 'g' });
  });

  const story = unique(unit.story.lines.filter(line => line.kr && line.uz), line => line.kr);
  const speakerCount = target.context === 2 ? 0 : target.context === 4 ? 1 : 2;
  const meaningCount = target.context - speakerCount;
  if (story.length < meaningCount) throw new Error(`Not enough story lines: ${key}`);
  const selectedStory = spread(story, meaningCount);
  const allStory = book.units.flatMap(u => u.story.lines.filter(line => line.kr && line.uz));
  selectedStory.forEach((line, i) => {
    const answer = optionsFor(line.uz, story.map(item => item.uz), allStory.map(item => item.uz), `${key}:c:meaning:${i}`);
    questions.push({ id: `c${String(i + 1).padStart(2, '0')}`, topic: 'context',
      prompt: `Hikoyadagi «${line.kr}» gapining ma’nosi qaysi?`, ...answer,
      explanation: `Hikoyada ${line.speaker} «${line.kr}» deydi. Ma’nosi: «${line.uz}».`,
      reviewSection: 's' });
  });
  if (speakerCount) {
    const speakers = unique(story, line => line.speaker);
    const selected = spread(speakers.length >= speakerCount ? speakers : story, speakerCount);
    const allSpeakers = unique(book.units.flatMap(u => u.story.lines.filter(line => line.speaker).map(line => line.speaker)), value => value);
    selected.forEach((line, i) => {
      const answer = optionsFor(line.speaker, speakers.map(item => item.speaker), allSpeakers, `${key}:c:speaker:${i}`);
      questions.push({ id: `c${String(meaningCount + i + 1).padStart(2, '0')}`, topic: 'context',
        prompt: `Hikoyada «${line.kr}» gapini kim aytadi?`, ...answer,
        explanation: `Bu gapni ${line.speaker} aytadi. Ma’nosi: «${line.uz}».`, reviewSection: 's' });
    });
  }
  if (questions.length !== target.vocab + target.grammar + target.context) throw new Error(`Wrong count: ${key}`);
  return { bookId, unitId, version: 1, questions };
}

let created = 0, kept = 0, totalQuestions = 0;
for (const book of books) for (const unit of book.units) {
  if (!unit.available) continue;
  const file = join(outputDir, `${book.book.id}-${unit.id}.json`);
  if (existsSync(file) && (!refresh || handWritten.has(`${book.book.id}-${unit.id}.json`))) {
    kept++; totalQuestions += JSON.parse(readFileSync(file, 'utf8')).questions.length; continue;
  }
  const quiz = generate(book, unit);
  writeFileSync(file, JSON.stringify(quiz, null, 2) + '\n');
  created++; totalQuestions += quiz.questions.length;
}
console.log(`Quiz files: ${created} created, ${kept} preserved; ${totalQuestions} questions total.`);
