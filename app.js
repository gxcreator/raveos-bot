const { Telegraf } = require('telegraf')
const https = require('https')
const assert = require('assert');
require('dotenv').config();

const botToken = process.env.BOT_TOKEN;
const chatId = process.env.BOT_CHAT_ID;
const raveOSToken = process.env.RAVEOS_TOKEN;
const poolWallet = process.env.POOL_WALLET


//Sanity check for env variables
assert(/^[0-9]+:[a-zA-Z0-9_-]{35}$/.test(botToken), "Telergam bot token is invalid: \"" + botToken + "\" Check BOT_TOKEN env.");
assert(/^-?\d+$/.test(chatId), "Chat id is invalid." + chatId + "Check BOT_CHAT_ID env.");
assert(/^[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}$$/.test(raveOSToken), "RaveOS token is invalid. Check RAVEOS_TOKEN env.");

const bot = new Telegraf(botToken)

async function raveOSApiRequest(apiPath) {
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

async function poolApiRequest(apiPath) {
    var optionsGet = {
        headers: {},
        host: "eth.2miners.com",
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

async function currencyApiRequest(apiPath) {
    var optionsGet = {
        headers: {},
        host: "min-api.cryptocompare.com",
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

async function getCurrencyInfo() {
    let rsp = await currencyApiRequest("/data/price?fsym=ETH&tsyms=USD,RUB");

    return rsp;
}

async function getAccountInfo(wallet) {
    let rsp = await poolApiRequest("/api/accounts/" + wallet);

    return rsp;
}

async function getWorkerInfo(workerId) {
    let rsp = await raveOSApiRequest("/v1/get_worker_info/" + workerId);

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
    let rsp = await raveOSApiRequest("/v1/get_workers/");
    console.log(rsp);
    let workerDescrList = rsp.workers;

    workerDescrList.forEach(async (workerDescr) => {
        let worker = await getWorkerInfo(workerDescr.id);
        //console.log(workerToStr(worker));
        let uptimeH = Math.floor(workerDescr.uptime / (60 * 60));
        let uptimeM = Math.floor((workerDescr.uptime - uptimeH * 60 * 60) / 60);
        let uptimeStr = " " + uptimeH + "h " + uptimeM + "m ";
        bot.telegram.sendMessage(chatId,
            (workerDescr.hashrate / 1000000).toFixed(1) + "MH/s " + uptimeStr + workerToStr(worker),
            { disable_web_page_preview: true, parse_mode: "Markdown" });
    });

}

async function getPoolInfo() {
    const REWARD_24H = 2;
    const REWARD_1H = 0;
    let rsp = await getAccountInfo(poolWallet);
    let currencyRsp = await getCurrencyInfo();
    //console.dir(currRsp);
    let stats = rsp.stats;
    let ethToStr = (eth) => { return (eth / 1000000000).toFixed(6) };
    let workers = rsp.workers;

    let workersStr = "Workers: \n";

    for (var worker in workers) {
        if (workers.hasOwnProperty(worker)) {
            workersStr += `💎${(workers[worker].hr / 1000000).toFixed(1)} ${worker}\n`;
        }
    }

    let currencyStr = `ETH = $${currencyRsp.USD.toFixed(0)} = ₽${currencyRsp.RUB.toFixed(0)}\n`;

    bot.telegram.sendMessage(chatId,
        `💰⏳${ethToStr(stats.balance)} = $${((stats.balance / 1000000000) * currencyRsp.USD).toFixed(1)} \n\n` +
        `⏳1h:  ${ethToStr(rsp.sumrewards[REWARD_1H].reward)}\n` +
        `⏳24h: ${ethToStr(rsp.sumrewards[REWARD_24H].reward)}\n` +
        `💎 ${(rsp.hashrate / 1000000).toFixed(1)}MH/s\n\n` +
        workersStr + "\n" +
        currencyStr,
        { disable_web_page_preview: true, parse_mode: "Markdown" });
}



/* Bot commands */
bot.command('rave', (ctx) => {
    getWorkers()
});

bot.command('pool', (ctx) => {
    getPoolInfo();
});

bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))


//https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD,RUB
