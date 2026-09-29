import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { Book } from './content.js';

const text = z.string().min(1);
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
  questions: z.array(question).length(10)
}).superRefine((quiz, ctx) => {
  if (new Set(quiz.questions.map(q => q.id)).size !== quiz.questions.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate question IDs' });
  for (const [topic, count] of [['vocab', 4], ['grammar', 4], ['context', 2]] as const)
    if (quiz.questions.filter(q => q.topic === topic).length !== count)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Expected ${count} ${topic} questions` });
});
export type Quiz = z.infer<typeof quizSchema>;
export type QuizBank = Map<string, Quiz>;
export const quizKey = (bookId: string, unitId: string) => `${bookId}:${unitId}`;
export const progressKey = (quiz: Quiz) => `${quizKey(quiz.bookId, quiz.unitId)}:v${quiz.version}`;

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
  return quizzes;
}

const activeSchema = z.object({ token: z.string().regex(/^[a-f0-9]{8}$/), answers: z.array(z.number().int().min(0).max(3)).max(9), startedAt: z.string().datetime() });
const entrySchema = z.object({ completed: z.number().int().nonnegative(), best: z.number().int().min(0).max(10), lastAnswers: z.array(z.number().int().min(0).max(3)).length(10).optional(), active: activeSchema.optional() });
const progressSchema = z.object({ version: z.literal(1), users: z.record(z.string().regex(/^\d+$/), z.record(entrySchema)) });
type Progress = z.infer<typeof progressSchema>;
type Entry = z.infer<typeof entrySchema>;
export type QuizEntry = Entry;
const emptyEntry = (): Entry => ({ completed: 0, best: 0 });

export function createQuizProgress(file = 'state/quizzes.json') {
  let state: Progress = { version: 1, users: {} };
  try {
    state = progressSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }

  function save(userId: number, key: string, entry: Entry) {
    const id = String(userId);
    const next: Progress = { version: 1, users: { ...state.users, [id]: { ...state.users[id], [key]: entry } } };
    mkdirSync(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(next), { mode: 0o600 });
    renameSync(temporary, file);
    state = next;
  }

  function get(userId: number, key: string): Entry {
    return structuredClone(state.users[String(userId)]?.[key] ?? emptyEntry());
  }

  function begin(userId: number, key: string) {
    const entry = get(userId, key);
    if (entry.active) return entry.active;
    const active = { token: randomBytes(4).toString('hex'), answers: [], startedAt: new Date().toISOString() };
    save(userId, key, { ...entry, active });
    return active;
  }

  function answer(userId: number, quiz: Quiz, token: string, index: number, choice: number) {
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
