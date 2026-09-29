import { Bot, GrammyError, type Context, type InlineKeyboard } from 'grammy';
import type { Book } from './content.js';
import { booksKeyboard,tocKeyboard,unitKeyboard } from './keyboards.js';
import { esc,topic,render,sectionNames,type Section } from './render.js';
import type { UserStats } from './stats.js';
import { quizKey, progressKey, type QuizBank, type QuizProgress, type Quiz } from './quiz.js';
import { quizIntro,quizIntroKeyboard,quizQuestion,quizQuestionKeyboard,quizFeedback,quizFeedbackKeyboard,quizResult,quizResultKeyboard,quizReview,wrongIndices } from './quiz-ui.js';
type BotOptions = { stats?: UserStats; adminUserId?: string; quizzes?: QuizBank; quizProgress?: QuizProgress };
export function createBot(token:string,books:Book[],options: BotOptions = {}) {
 const bot=new Bot(token);
 bot.use(async(ctx,next)=>{
  if(ctx.chat?.type==='private' && ctx.from && options.stats){
   try{options.stats.record(ctx.from.id);}catch{console.error('Foydalanuvchi statistikasi saqlanmadi.');}
  }
  await next();
 });
 async function show(ctx:Context,text:string,keyboard:InlineKeyboard){
  const options={parse_mode:'HTML' as const,reply_markup:keyboard};
  if(ctx.callbackQuery?.message){
   try{await ctx.editMessageText(text,options);}catch(e){
    if(e instanceof GrammyError && e.description.includes('message is not modified'))return;
    if(e instanceof GrammyError && /message to edit not found|message can't be edited/i.test(e.description)){await ctx.reply(text,options);return;}
    throw e;
   }
  }else await ctx.reply(text,options);
 }
 const welcome=(ctx:Context)=>show(ctx,'🇰🇷 Koreys tilini o‘zbekcha o‘rganamiz!\n\n📚 Kitobni tanlang:',booksKeyboard(books));
 bot.command(['start','books'],welcome);
 bot.command('help',ctx=>ctx.reply('Kitob → dars → bo‘limni tanlang. ◀️ ▶️ bilan sahifalarni almashtiring. Yashirin tarjimani bosib oching. 🧠 belgisi bor darslarda 10 savollik testni ishlang.\n\n/books — kitoblar\n/start — boshlash\n/myid — Telegram ID'));
 bot.command('myid',ctx=>ctx.chat.type==='private'&&ctx.from?ctx.reply(`Telegram ID: ${ctx.from.id}`):ctx.reply('ID ni ko‘rish uchun botga shaxsiy chatda /myid yuboring.'));
 bot.command('stats',ctx=>{
  if(ctx.chat.type!=='private' || !ctx.from || !options.adminUserId || String(ctx.from.id)!==options.adminUserId || !options.stats)
   return ctx.reply('Bu buyruq faqat bot egasi uchun.');
  const s=options.stats.snapshot();
  return ctx.reply(`📊 Bot foydalanuvchilari\n\nJami: ${s.total}\nOxirgi 24 soat: ${s.last24Hours}\nOxirgi 7 kun: ${s.last7Days}\nOxirgi 30 kun: ${s.last30Days}\n\nHisob faqat statistika yoqilgandan keyin botni shaxsiy chatda ishlatganlarni qamrab oladi.`);
 });
 bot.on('callback_query:data',async ctx=>{
  const data=ctx.callbackQuery.data;
  if(data==='noop'){await ctx.answerCallbackQuery();return;}
  if(data==='books'){await ctx.answerCallbackQuery();await welcome(ctx);return;}
  const parts=data.split(':');const [action,bookId,unitId,section,pageRaw]=parts;
  const book=books.find(b=>b.book.id===bookId);
  if(!book){await ctx.answerCallbackQuery({text:'Kitob topilmadi. /books ni bosing.'});return;}
  if(action==='b'&&parts.length===2){await ctx.answerCallbackQuery();await show(ctx,`${esc(book.book.title)}\n${esc(book.book.level_uz)}\n\nDarsni tanlang:`,tocKeyboard(book));return;}
  const unit=book.units.find(u=>u.id===unitId);
  if(!unit){await ctx.answerCallbackQuery({text:'Tugma eskirgan. /books ni bosing.'});return;}
  if(!unit.available){await ctx.answerCallbackQuery({text:'Tez orada qo‘shiladi'});return;}
  const quiz=options.quizzes?.get(quizKey(bookId,unitId));
  const hasQuiz=Boolean(quiz && options.quizProgress);
  if(['q','qs','qn','qa','qres','qr'].includes(action)){
   if(!quiz || !options.quizProgress){await ctx.answerCallbackQuery({text:'Bu dars testi hali tayyor emas.'});return;}
   if(ctx.chat?.type!=='private'){await ctx.answerCallbackQuery({text:'Testni bot bilan shaxsiy chatda ishlang.'});return;}
   const progress=options.quizProgress;
   const userId=ctx.from.id;
   const key=progressKey(quiz);
   const entry=progress.get(userId,key);
   const showCurrent=async(q:Quiz,token:string)=>{
    const current=progress.get(userId,key).active;
    if(!current || current.token!==token){await ctx.answerCallbackQuery({text:'Bu urinish eskirgan. Testni qayta oching.'});return;}
    await ctx.answerCallbackQuery();
    await show(ctx,quizQuestion(q,current.answers.length),quizQuestionKeyboard(q,token,current.answers.length));
   };
   if(action==='q'&&parts.length===3){await ctx.answerCallbackQuery();await show(ctx,quizIntro(quiz,entry),quizIntroKeyboard(quiz,entry));return;}
   if(action==='qs'&&parts.length===3){const active=progress.begin(userId,key);await showCurrent(quiz,active.token);return;}
   if(action==='qn'&&parts.length===4&&/^[a-f0-9]{8}$/.test(section)){await showCurrent(quiz,section);return;}
   if(action==='qa'&&parts.length===6&&/^[a-f0-9]{8}$/.test(section)&&/^\d{1,2}$/.test(pageRaw)&&/^[0-3]$/.test(parts[5])){
    const index=Number(pageRaw),choice=Number(parts[5]);
    const result=progress.answer(userId,quiz,section,index,choice);
    if(result.kind==='stale'){await ctx.answerCallbackQuery({text:'Bu javob eskirgan. Testni qayta oching.'});return;}
    await ctx.answerCallbackQuery();await show(ctx,quizFeedback(quiz,index,choice),quizFeedbackKeyboard(quiz,section,result.finished));return;
   }
   if(action==='qres'&&parts.length===3&&entry.lastAnswers){await ctx.answerCallbackQuery();await show(ctx,quizResult(quiz,entry),quizResultKeyboard(quiz,entry));return;}
   if(action==='qr'&&parts.length===4&&/^\d{1,2}$/.test(section)&&entry.lastAnswers&&Number(section)<wrongIndices(quiz,entry.lastAnswers).length){
    const review=quizReview(quiz,entry,Number(section));await ctx.answerCallbackQuery();await show(ctx,review.text,review.keyboard);return;
   }
   await ctx.answerCallbackQuery({text:'Test sahifasi topilmadi. Darsni qayta oching.'});return;
  }
  if(action==='u'&&parts.length===3){await ctx.answerCallbackQuery();await show(ctx,topic(unit),unitKeyboard(book,unit,undefined,0,1,hasQuiz));return;}
  if(action==='p'&&parts.length===5&&Object.hasOwn(sectionNames,section)&&/^\d{1,5}$/.test(pageRaw)){
   const selected=section as Section;const pages=render(unit,selected);const page=Number(pageRaw);
   if(page<pages.length){await ctx.answerCallbackQuery();await show(ctx,pages[page],unitKeyboard(book,unit,selected,page,pages.length,hasQuiz));return;}
  }
  await ctx.answerCallbackQuery({text:'Sahifa topilmadi. Darsni qayta oching.'});
 });
 // Never log error objects: transport errors may contain token-bearing URLs.
 bot.catch(()=>{console.error('So‘rov bajarilmadi. Keyinroq qayta urinib ko‘ring.');});
 return bot;
}
