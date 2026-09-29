import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { Book } from './content.js';

const text = z.string().min(1);
export function quizCounts(bookId: string) {
  const level = Number(bookId[0]);
  if (level === 1) return { vocab: 4, grammar: 4, context: 2 };
  if (level === 2 || level === 3) return { vocab: 5, grammar: 6, context: 4 };
  if (level >= 4 && level <= 6) return { vocab: 6, grammar: 8, context: 6 };
  throw new Error(`Unknown quiz level: ${bookId}`);
}
const question = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,12}$/),
  topic: z.enum(['vocab', 'grammar', 'context']),
  prompt: text,
  options: z.tuple([text, text, text, text]),
  correctIndex: z.number().int().min(0).max(3),
  explanation: text,
  reviewSection: z.enum(['v', 'g', 'd', 's'])
}).refine(q => new Set(q.options.map(option => option.trim().toLocaleLowerCase())).size === 4,
  'Answer options must be distinct');
export const quizSchema = z.object({
  bookId: z.string().regex(/^[a-z0-9_-]{1,12}$/),
  unitId: z.string().regex(/^[a-z0-9_-]{1,12}$/),
  version: z.number().int().positive(),
  questions: z.array(question).min(10).max(20)
}).superRefine((quiz, ctx) => {
  if (new Set(quiz.questions.map(q => q.id)).size !== quiz.questions.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate question IDs' });
  let counts: ReturnType<typeof quizCounts>;
  try { counts = quizCounts(quiz.bookId); }
  catch { ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Unsupported book level' }); return; }
  if (quiz.questions.length !== counts.vocab + counts.grammar + counts.context)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Wrong question count for this level' });
  for (const [topic, count] of Object.entries(counts))
    if (quiz.questions.filter(q => q.topic === topic).length !== count)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Expected ${count} ${topic} questions` });
});
export type Quiz = z.infer<typeof quizSchema>;
export type QuizQuestion = Quiz['questions'][number];
export type Assessment = { bookId: string; unitId: string; version: number; questions: QuizQuestion[] };
export type QuizBank = Map<string, Quiz>;
export const quizKey = (bookId: string, unitId: string) => `${bookId}:${unitId}`;
export const progressKey = (quiz: Assessment) => `${quizKey(quiz.bookId, quiz.unitId)}:v${quiz.version}`;

export function loadQuizzes(books: Book[], directory = 'data/quizzes'): QuizBank {
  const quizzes: QuizBank = new Map();
  for (const file of readdirSync(directory).filter(name => name.endsWith('.json'))) {
    const quiz = quizSchema.parse(JSON.parse(readFileSync(`${directory}/${file}`, 'utf8')));
    const book = books.find(item => item.book.id === quiz.bookId);
    if (!book?.units.some(unit => unit.id === quiz.unitId && unit.available))
      throw new Error(`Quiz does not match a ready unit: ${file}`);
    const key = quizKey(quiz.bookId, quiz.unitId);
    if (quizzes.has(key)) throw new Error(`Duplicate quiz: ${key}`);
    quizzes.set(key, quiz);
  }
  for (const book of books) for (const unit of book.units)
    if (unit.available && !quizzes.has(quizKey(book.book.id, unit.id)))
      throw new Error(`Missing quiz: ${quizKey(book.book.id, unit.id)}`);
  return quizzes;
}

const activeSchema = z.object({ token: z.string().regex(/^[a-f0-9]{8}$/), answers: z.array(z.number().int().min(0).max(3)).max(23), startedAt: z.string().datetime() });
const entrySchema = z.object({ completed: z.number().int().nonnegative(), best: z.number().int().min(0).max(24), lastAnswers: z.array(z.number().int().min(0).max(3)).min(10).max(24).optional(), active: activeSchema.optional() });
const progressSchema = z.object({ version: z.literal(1), users: z.record(z.string().regex(/^\d+$/), z.record(entrySchema)) });
const userProgressSchema = z.record(entrySchema);
type UserProgress = z.infer<typeof userProgressSchema>;
type Entry = z.infer<typeof entrySchema>;
export type QuizEntry = Entry;
const emptyEntry = (): Entry => ({ completed: 0, best: 0 });

export function createQuizProgress(legacyFile = 'state/quizzes.json') {
  const directory = join(dirname(legacyFile), 'quiz-users');
  const cache = new Map<string, UserProgress>();
  const idFor = (userId: number) => {
    if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('Invalid Telegram user ID');
    return String(userId);
  };
  const pathFor = (id: string) => join(directory, `${id}.json`);
  function writeUser(id: string, data: UserProgress) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = pathFor(id),temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(data), { mode: 0o600 });
    renameSync(temporary, file);
    cache.set(id, data);
  }
  // Keep the pilot's old shared JSON as a backup while moving each user to an
  // independent file. A later restart skips files already migrated or updated.
  if (existsSync(legacyFile)) {
    const legacy = progressSchema.parse(JSON.parse(readFileSync(legacyFile, 'utf8')));
    for (const [id, data] of Object.entries(legacy.users))
      if (!existsSync(pathFor(id))) writeUser(id, data);
  }
  function userData(id: string): UserProgress {
    if (!cache.has(id)) {
      const file = pathFor(id);
      cache.set(id, existsSync(file) ? userProgressSchema.parse(JSON.parse(readFileSync(file, 'utf8'))) : {});
    }
    return cache.get(id)!;
  }
  function save(userId: number, key: string, entry: Entry) {
    const id = idFor(userId);
    writeUser(id, { ...userData(id), [key]: entry });
  }
  function get(userId: number, key: string): Entry {
    return structuredClone(userData(idFor(userId))[key] ?? emptyEntry());
  }

  function begin(userId: number, key: string) {
    const entry = get(userId, key);
    if (entry.active) return entry.active;
    const active = { token: randomBytes(4).toString('hex'), answers: [], startedAt: new Date().toISOString() };
    save(userId, key, { ...entry, active });
    return active;
  }

  function answer(userId: number, quiz: Assessment, token: string, index: number, choice: number) {
    const key = progressKey(quiz);
    const entry = get(userId, key);
    if (!entry.active || entry.active.token !== token || entry.active.answers.length !== index ||
      index < 0 || index >= quiz.questions.length || choice < 0 || choice > 3 || !Number.isInteger(choice))
      return { kind: 'stale' as const };
    const answers = [...entry.active.answers, choice];
    const finished = answers.length === quiz.questions.length;
    const score = answers.reduce((total, selected, i) => total + Number(selected === quiz.questions[i].correctIndex), 0);
    if (finished) {
      const { active: _unused, ...rest } = entry;
      save(userId, key, { ...rest, completed: entry.completed + 1, best: Math.max(entry.best, score), lastAnswers: answers });
    } else save(userId, key, { ...entry, active: { ...entry.active, answers } });
    return { kind: 'accepted' as const, finished, correct: choice === quiz.questions[index].correctIndex, score };
  }

  return { get, begin, answer };
}
export type QuizProgress = ReturnType<typeof createQuizProgress>;
