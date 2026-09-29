import 'dotenv/config';
import {loadBooks} from './content.js';
import {createBot} from './bot.js';
import {createStats} from './stats.js';
import {createQuizProgress,loadQuizzes} from './quiz.js';
async function main(){
 const token=process.env.BOT_TOKEN;
 if(!token){console.error('BOT_TOKEN yo‘q. .env.example asosida .env faylini to‘ldiring.');process.exitCode=1;return;}
 const adminUserId=process.env.ADMIN_USER_ID;
 if(adminUserId && !/^\d+$/.test(adminUserId))throw new Error('ADMIN_USER_ID raqamlardan iborat bo‘lishi kerak.');
 const books=loadBooks();
 const bot=createBot(token,books,{stats:createStats(),adminUserId,quizzes:loadQuizzes(books),quizProgress:createQuizProgress()});
 for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{if(bot.isRunning())void bot.stop();});
 await bot.api.setMyCommands([{command:'start',description:'Boshlash'},{command:'books',description:'Kitoblar'},{command:'help',description:'Yordam'},{command:'myid',description:'Telegram ID ni ko‘rish'}]);
 await bot.start({onStart:()=>console.log('Bot ishga tushdi. To‘xtatish: Ctrl+C.')});
}
main().catch(()=>{console.error('Bot ishga tushmadi. Token, JSON fayllar va internet ulanishini tekshiring.');process.exitCode=1;});
