import 'dotenv/config';
import {loadBooks} from './content.js';
import {createBot} from './bot.js';
async function main(){
 const token=process.env.BOT_TOKEN;
 if(!token){console.error('BOT_TOKEN yo‘q. .env.example asosida .env faylini to‘ldiring.');process.exitCode=1;return;}
 const bot=createBot(token,loadBooks());
 for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{if(bot.isRunning())void bot.stop();});
 await bot.api.setMyCommands([{command:'start',description:'Boshlash'},{command:'books',description:'Kitoblar'},{command:'help',description:'Yordam'}]);
 await bot.start({onStart:()=>console.log('Bot ishga tushdi. To‘xtatish: Ctrl+C.')});
}
main().catch(()=>{console.error('Bot ishga tushmadi. Token, JSON fayllar va internet ulanishini tekshiring.');process.exitCode=1;});
