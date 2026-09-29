import { InlineKeyboard } from 'grammy';
import { esc } from './render.js';
import { type Quiz, type QuizEntry } from './quiz.js';

const letters = ['A', 'B', 'C', 'D'] as const;
const title = (quiz: Quiz) => `${quiz.bookId.toUpperCase()} · ${quiz.unitId === 'hangul' ? '한글' : quiz.unitId + '과'}`;
const back = (quiz: Quiz) => `u:${quiz.bookId}:${quiz.unitId}`;
const questionList = (quiz: Quiz, index: number) => quiz.questions[index].options.map((option, i) => `${letters[i]}) ${esc(option)}`).join('\n');

export function quizIntro(quiz: Quiz, entry: QuizEntry) {
  const progress = entry.active ? `\n⏸ Tugallanmagan test: ${entry.active.answers.length + 1}-savoldan davom etasiz.` : '';
  const history = entry.completed ? `\nOldingi urinishlar: ${entry.completed} · Eng yaxshi natija: ${entry.best}/10` : '';
  return `🧠 <b>${esc(title(quiz))} · 10 savollik test</b>\n\n4 ta so‘z, 4 ta grammatika va 2 ta vaziyat savoli. Har javobdan keyin qisqa izoh ko‘rasiz. Testni qayta ishlashingiz mumkin.${progress}${history}\n\nBoshlaymizmi?`;
}
export function quizIntroKeyboard(quiz: Quiz, entry: QuizEntry) {
  const k = new InlineKeyboard();
  if (entry.active) k.text('▶️ Davom etish', `qn:${quiz.bookId}:${quiz.unitId}:${entry.active.token}`).row();
  else k.text('🧠 Testni boshlash', `qs:${quiz.bookId}:${quiz.unitId}`).row();
  if (entry.lastAnswers) k.text('📊 Oxirgi natija', `qres:${quiz.bookId}:${quiz.unitId}`).row();
  return k.text('🎯 Darsga qaytish', back(quiz));
}
export function quizQuestion(quiz: Quiz, index: number) {
  const q = quiz.questions[index];
  return `🧠 <b>${esc(title(quiz))} · ${index + 1}/10</b>\n\n<b>${esc(q.prompt)}</b>\n\n${questionList(quiz, index)}\n\nJavobni tanlang:`;
}
export function quizQuestionKeyboard(quiz: Quiz, token: string, index: number) {
  const k = new InlineKeyboard();
  for (let choice = 0; choice < 4; choice++) k.text(letters[choice], `qa:${quiz.bookId}:${quiz.unitId}:${token}:${index}:${choice}`);
  return k.row().text('🎯 Darsga qaytish', back(quiz));
}
export function quizFeedback(quiz: Quiz, index: number, choice: number) {
  const q = quiz.questions[index];
  const correct = choice === q.correctIndex;
  return `🧠 <b>${esc(title(quiz))} · ${index + 1}/10</b>\n\n<b>${esc(q.prompt)}</b>\n\n${questionList(quiz, index)}\n\n${correct ? '✅ To‘g‘ri!' : `❌ Siz: ${letters[choice]}. To‘g‘ri javob: ${letters[q.correctIndex]}.`}\n💡 ${esc(q.explanation)}`;
}
export function quizFeedbackKeyboard(quiz: Quiz, token: string, finished: boolean) {
  return new InlineKeyboard()
    .text(finished ? '📊 Natijani ko‘rish' : '➡️ Keyingi savol',
      finished ? `qres:${quiz.bookId}:${quiz.unitId}` : `qn:${quiz.bookId}:${quiz.unitId}:${token}`)
    .row().text('🎯 Darsga qaytish', back(quiz));
}
export function wrongIndices(quiz: Quiz, answers: number[]) {
  return quiz.questions.flatMap((q, i) => answers[i] === q.correctIndex ? [] : [i]);
}
export function quizResult(quiz: Quiz, entry: QuizEntry) {
  if (!entry.lastAnswers) throw new Error('No completed quiz');
  const wrong = wrongIndices(quiz, entry.lastAnswers);
  const score = 10 - wrong.length;
  const advice = score >= 8 ? 'Ajoyib! Keyingi darsga o‘tishingiz mumkin.' : score >= 5 ? 'Yaxshi urinish. Xatolarni ko‘rib, qoidalarni mustahkamlang.' : 'Darsni yana bir bor o‘qib, testni qayta ishlang.';
  const mistakes = wrong.length ? `\n\nQayta ko‘rish kerak:\n${wrong.map(i => `• ${i + 1}-savol — ${esc(quiz.questions[i].options[quiz.questions[i].correctIndex])}`).join('\n')}` : '\n\nBarcha javoblar to‘g‘ri!';
  return `📊 <b>${esc(title(quiz))} · Natija</b>\n\nNatija: <b>${score}/10</b>\nEng yaxshi natija: ${entry.best}/10\nUrinishlar: ${entry.completed}\n\n${advice}${mistakes}`;
}
export function quizResultKeyboard(quiz: Quiz, entry: QuizEntry) {
  const k = new InlineKeyboard();
  if (entry.lastAnswers && wrongIndices(quiz, entry.lastAnswers).length)
    k.text('🔎 Xatolarni ko‘rish', `qr:${quiz.bookId}:${quiz.unitId}:0`).row();
  return k.text('🔁 Qayta ishlash', `qs:${quiz.bookId}:${quiz.unitId}`).row()
    .text('🎯 Darsga qaytish', back(quiz));
}
export function quizReview(quiz: Quiz, entry: QuizEntry, position: number) {
  if (!entry.lastAnswers) throw new Error('No completed quiz');
  const wrong = wrongIndices(quiz, entry.lastAnswers);
  const index = wrong[position];
  if (index === undefined) throw new Error('No mistake at this position');
  const q = quiz.questions[index];
  const choice = entry.lastAnswers[index];
  const text = `🔎 <b>Xato ${position + 1}/${wrong.length} · ${index + 1}-savol</b>\n\n<b>${esc(q.prompt)}</b>\n\nSiz tanlagan javob: ${letters[choice]}) ${esc(q.options[choice])}\nTo‘g‘ri javob: ${letters[q.correctIndex]}) ${esc(q.options[q.correctIndex])}\n\n💡 ${esc(q.explanation)}`;
  const k = new InlineKeyboard();
  if (position > 0) k.text('◀️', `qr:${quiz.bookId}:${quiz.unitId}:${position - 1}`);
  if (position + 1 < wrong.length) k.text('▶️', `qr:${quiz.bookId}:${quiz.unitId}:${position + 1}`);
  k.row().text('📚 Bo‘limni qayta o‘qish', `p:${quiz.bookId}:${quiz.unitId}:${q.reviewSection}:0`).row()
    .text('📊 Natija', `qres:${quiz.bookId}:${quiz.unitId}`);
  return { text, keyboard: k };
}
