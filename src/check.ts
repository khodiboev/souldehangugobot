import { loadBooks } from './content.js';
import { render,topic,sectionNames,type Section } from './render.js';
import { booksKeyboard,tocKeyboard,unitKeyboard } from './keyboards.js';
import { loadQuizzes,quizKey } from './quiz.js';
import { quizIntro,quizQuestion,quizFeedback,quizResult,quizReview,quizIntroKeyboard,quizQuestionKeyboard,quizFeedbackKeyboard,quizResultKeyboard } from './quiz-ui.js';
const books=loadBooks();
const quizzes=loadQuizzes(books);
function checkButtons(keyboard:ReturnType<typeof booksKeyboard>){for(const row of keyboard.inline_keyboard)for(const button of row)if('callback_data'in button && Buffer.byteLength(button.callback_data)>64)throw new Error('Callback too long');}
checkButtons(booksKeyboard(books));
for(const book of books){checkButtons(tocKeyboard(book));for(const unit of book.units){if(!unit.available)continue;
 if(topic(unit).length>4096)throw new Error('Topic too long');
 const hasQuiz=quizzes.has(quizKey(book.book.id,unit.id));
 checkButtons(unitKeyboard(book,unit,undefined,0,1,hasQuiz));
 for(const key of Object.keys(sectionNames) as Section[]){const pages=render(unit,key);for(const [i,page]of pages.entries()){if(!page||page.length>4096)throw new Error('Invalid page size');checkButtons(unitKeyboard(book,unit,key,i,pages.length,hasQuiz));}console.log(`${book.book.id}/${unit.id}/${key}: ${pages.length} sahifa`);}
}}
for(const quiz of quizzes.values()){
 const empty={completed:0,best:0};const wrong={completed:1,best:0,lastAnswers:quiz.questions.map(q=>(q.correctIndex+1)%4)};
 const texts=[quizIntro(quiz,empty),quizResult(quiz,wrong),...quiz.questions.flatMap((_,i)=>[quizQuestion(quiz,i),quizFeedback(quiz,i,wrong.lastAnswers[i])]),...quiz.questions.map((_,i)=>quizReview(quiz,wrong,i).text)];
 if(texts.some(t=>!t||t.length>4096))throw new Error(`Invalid quiz message size: ${quizKey(quiz.bookId,quiz.unitId)}`);
 const token='ffffffff';const keyboards=[quizIntroKeyboard(quiz,empty),quizIntroKeyboard(quiz,{...empty,active:{token,answers:[],startedAt:new Date().toISOString()}}),quizResultKeyboard(quiz,wrong),...quiz.questions.flatMap((_,i)=>[quizQuestionKeyboard(quiz,token,i),quizFeedbackKeyboard(quiz,token,i===9),quizReview(quiz,wrong,i).keyboard])];
 keyboards.forEach(checkButtons);
 console.log(`${quizKey(quiz.bookId,quiz.unitId)}: ${quiz.questions.length} test savoli`);
}
console.log('Mazmun va tugmalar tekshirildi.');
