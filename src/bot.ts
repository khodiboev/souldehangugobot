import { Bot, GrammyError, type Context, type InlineKeyboard } from 'grammy';
import type { Book } from './content.js';
import { booksKeyboard,tocKeyboard,unitKeyboard } from './keyboards.js';
import { esc,topic,render,sectionNames,type Section } from './render.js';
export function createBot(token:string,books:Book[]) {
 const bot=new Bot(token);
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
 bot.command('help',ctx=>ctx.reply('Kitob → dars → bo‘limni tanlang. ◀️ ▶️ bilan sahifalarni almashtiring. Yashirin tarjimani bosib oching. ⏳ — dars hali tayyor emas.\n\n/books — kitoblar\n/start — boshlash'));
 bot.on('callback_query:data',async ctx=>{
  const data=ctx.callbackQuery.data;
  if(data==='noop'){await ctx.answerCallbackQuery();return;}
  if(data==='books'){await ctx.answerCallbackQuery();await welcome(ctx);return;}
  const parts=data.split(':');const [action,bookId,unitId,section,pageRaw]=parts;
  const book=books.find(b=>b.book.id===bookId);
  if(!book){await ctx.answerCallbackQuery({text:'Kitob topilmadi. /books ni bosing.'});return;}
  if(action==='b'&&parts.length===2){await ctx.answerCallbackQuery();await show(ctx,`${esc(book.book.title)}\n${esc(book.book.level_uz)}\n\nDarsni tanlang:`,tocKeyboard(book));return;}
  const unit=book.units.find(u=>u.id===unitId);
  if(!unit || !['u','p'].includes(action)){await ctx.answerCallbackQuery({text:'Tugma eskirgan. /books ni bosing.'});return;}
  if(!unit.available){await ctx.answerCallbackQuery({text:'Tez orada qo‘shiladi'});return;}
  if(action==='u'&&parts.length===3){await ctx.answerCallbackQuery();await show(ctx,topic(unit),unitKeyboard(book,unit));return;}
  if(action==='p'&&parts.length===5&&Object.hasOwn(sectionNames,section)&&/^\d{1,5}$/.test(pageRaw)){
   const selected=section as Section;const pages=render(unit,selected);const page=Number(pageRaw);
   if(page<pages.length){await ctx.answerCallbackQuery();await show(ctx,pages[page],unitKeyboard(book,unit,selected,page,pages.length));return;}
  }
  await ctx.answerCallbackQuery({text:'Sahifa topilmadi. Darsni qayta oching.'});
 });
 // Never log error objects: transport errors may contain token-bearing URLs.
 bot.catch(()=>{console.error('So‘rov bajarilmadi. Keyinroq qayta urinib ko‘ring.');});
 return bot;
}
