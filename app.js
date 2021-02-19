const { Telegraf } = require('telegraf')
const https = require('https')
const assert = require('assert');
require('dotenv').config();

const botToken = process.env.BOT_TOKEN;
const chatId = process.env.BOT_CHAT_ID;
const raveOSToken = process.env.RAVEOS_TOKEN;

//Sanity check for env variables
assert(/^[0-9]+:[a-zA-Z0-9_-]{35}$/.test(botToken), "Telergam bot token is invalid: \"" + botToken + "\" Check BOT_TOKEN env.");
assert(/^-?\d+$/.test(chatId), "Chat id is invalid." + chatId + "Check BOT_CHAT_ID env.");
assert(/^[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}$$/.test(raveOSToken), "RaveOS token is invalid. Check RAVEOS_TOKEN env.");

const bot = new Telegraf(botToken)

async function requestPath(apiPath) {
    var optionsGet = {
        headers: {
            "X-Auth-Token": raveOSToken,
        },
        host: "oapi.raveos.com",
        path: apiPath,
        method: 'GET'
    };
    return new Promise(function (resolve, reject) {
        https
            .get(optionsGet, response => {
                let str = '';
                response.on('data', function (chunk) {
                    str += chunk;
                });
                response.on('end', function () {
                    resolve(JSON.parse(str));
                });
                response.on("error", () => {
                    reject();
                })
            });
    });

}

async function getWorkerInfo(workerId) {
    let rsp = await requestPath("/v1/get_worker_info/" + workerId);

    return rsp;
}

function workerToStr(worker) {
    msgText = `${worker.online_status ? "🟢" : "🔴"} ${worker.name} ${worker.description} \n\n`;
    //`Online: ${worker.online_status ? "🟢" : "🔴"}\n`;
    var mpuList = worker.mpu_list;
    mpuList.forEach((mpu) => {
        //console.log(mpu)

        //Curently this parameter is buggy at server side.
        //let isEnabledIcon = mpu.is_enabled ? "🟢" : "🔴"; 
        msgText += `${mpu.id} 💎${mpu.hashrate / 1000000}` +
            `🌬️${mpu.fan_percent}% 🌡️${mpu.temp}ºC ⚡${mpu.power}W ` +
            `\n🧱(${mpu.shares.accepted}/${mpu.shares.invalid}/${mpu.shares.rejected}) ` +
            `[${mpu.name}]\n\n`;
        console.log(mpu.shares);
    });
    return msgText;
}

async function getWorkers() {
    let rsp = await requestPath("/v1/get_workers/");
    console.log(rsp);
    let workerDescrList = rsp.workers;

    workerDescrList.forEach(async (workerDescr) => {
        let worker = await getWorkerInfo(workerDescr.id);
        //console.log(workerToStr(worker));
        let uptimeH = Math.floor(workerDescr.uptime/(60*60));
        let uptimeM = Math.floor((workerDescr.uptime - uptimeH*60*60)/60);
        let uptimeStr = " " + uptimeH + "h " +  uptimeM + "m ";
        bot.telegram.sendMessage(chatId, (workerDescr.hashrate / 1000000).toFixed(1) + "MH/s " + uptimeStr + workerToStr(worker), { disable_web_page_preview: true, parse_mode: "Markdown" });
    });

}

bot.command('rave', (ctx) => {
    getWorkers()
});

bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
