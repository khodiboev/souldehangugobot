import { readFileSync } from 'node:fs';
import { InlineKeyboard } from 'grammy';
import { z } from 'zod';
import { esc } from './render.js';
import { quizKey, type Assessment, type QuizBank, type QuizEntry } from './quiz.js';

const pickSchema = z.object({ bookId: z.string().regex(/^[1-6][ab]$/), unitId: z.string().min(1), questionId: z.string().min(1) });
const placementSchema = z.object({ version: z.number().int().positive(), picks: z.array(pickSchema).length(24) }).superRefine((data, ctx) => {
  if (new Set(data.picks.map(p => `${p.bookId}:${p.unitId}:${p.questionId}`)).size !== 24)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate placement questions' });
  for (const bookId of ['1a','1b','2a','2b','3a','3b','4a','4b','5a','5b','6a','6b'])
    if (data.picks.filter(p => p.bookId === bookId).length !== 2)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Expected two questions from ${bookId}` });
});
export type Placement = { assessment: Assessment; picks: z.infer<typeof pickSchema>[] };

export function loadPlacement(quizzes: QuizBank, file = 'data/placement/selection.json'): Placement {
  const data = placementSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  const questions = data.picks.map((pick, index) => {
    const quiz = quizzes.get(quizKey(pick.bookId, pick.unitId));
    const question = quiz?.questions.find(q => q.id === pick.questionId);
    if (!question) throw new Error(`Placement question not found: ${pick.bookId}/${pick.unitId}/${pick.questionId}`);
    return { ...question, id: `p${String(index + 1).padStart(2, '0')}` };
  });
  return { assessment: { bookId: 'placement', unitId: 'start', version: data.version, questions }, picks: data.picks };
}

const letters = ['A','B','C','D'] as const;
export function placementIntro(entry: QuizEntry) {
  const progress = entry.active ? `\n⏸ ${entry.active.answers.length + 1}-savoldan davom etasiz.` : '';
  const history = entry.completed ? `\nOldingi urinishlar: ${entry.completed} · Eng yaxshi natija: ${entry.best}/24` : '';
  return `🧭 <b>Darajani aniqlash</b>\n\n1A dan 6B gacha 24 ta savol bor. Test ixtiyoriy: natija qaysi kitobdan boshlashni taxminan tavsiya qiladi, rasmiy til darajasi yoki sertifikat emas. Javoblar test oxirida baholanadi.${progress}${history}\n\nIstalgan payt kitoblarni o‘zingiz tanlashingiz mumkin.`;
}
export function placementIntroKeyboard(entry: QuizEntry) {
  const k = new InlineKeyboard();
  if (entry.active) k.text('▶️ Davom etish', `ptn:${entry.active.token}`).row();
  else k.text('🧭 Testni boshlash', 'pts').row();
  if (entry.lastAnswers) k.text('📊 Oxirgi natija', 'ptres').row();
  return k.text('📚 Kitoblarni tanlash', 'books');
}
export function placementQuestion(placement: Placement, index: number) {
  const q = placement.assessment.questions[index];
  return `🧭 <b>Daraja testi · ${index + 1}/24</b>\n\n<b>${esc(q.prompt)}</b>\n\n${q.options.map((option, i) => `${letters[i]}) ${esc(option)}`).join('\n')}\n\nJavobni tanlang:`;
}
export function placementQuestionKeyboard(token: string, index: number) {
  const k = new InlineKeyboard();
  for (let choice = 0; choice < 4; choice++) k.text(letters[choice], `pta:${token}:${index}:${choice}`);
  return k.row().text('📚 Kitoblar', 'books');
}
export function placementScore(placement: Placement, answers: number[]) {
  const byLevel = Array.from({ length: 6 }, () => 0);
  placement.assessment.questions.forEach((question, index) => {
    if (answers[index] === question.correctIndex) byLevel[Number(placement.picks[index].bookId[0]) - 1]++;
  });
  let level = 1;
  for (let i = 0; i < 6; i++) {
    if (byLevel[i] < 3) break;
    level = Math.min(i + 2, 6);
  }
  const bookId = level === 6 && byLevel[5] === 4 ? '6b' : `${level}a`;
  return { byLevel, total: byLevel.reduce((sum, count) => sum + count, 0), bookId };
}
export function placementResult(placement: Placement, entry: QuizEntry) {
  if (!entry.lastAnswers || entry.lastAnswers.length !== 24) throw new Error('No completed placement test');
  const score = placementScore(placement, entry.lastAnswers);
  const levels = score.byLevel.map((correct, i) => `${i + 1}-daraja (A+B): ${correct}/4`).join('\n');
  return `📊 <b>Daraja testi natijasi</b>\n\nJami: <b>${score.total}/24</b>\nEng yaxshi natija: ${entry.best}/24\n\n${levels}\n\n🎯 Boshlash uchun tavsiya: <b>${score.bookId.toUpperCase()}</b>\nBu taxminiy yo‘nalish. Istasangiz boshqa kitobni ham tanlashingiz yoki testni keyin qayta ishlashingiz mumkin.`;
}
export function placementResultKeyboard(placement: Placement, entry: QuizEntry) {
  if (!entry.lastAnswers) throw new Error('No completed placement test');
  const { bookId } = placementScore(placement, entry.lastAnswers);
  return new InlineKeyboard().text(`📚 ${bookId.toUpperCase()} dan boshlash`, `b:${bookId}`).row()
    .text('🔁 Qayta ishlash', 'pts').row().text('📚 Barcha kitoblar', 'books');
}
