const Docx = require('html-docx-js');
const fs = require('fs');
const readlineSync = require('readline-sync');
const path = require('path');
const puppeteer = require('puppeteer');

//compile pkg -t linux --out-path dist index.js
//copy chromium cp -R node_modules/puppeteer/.local-chromium dist/puppeteer

// Support for pkg
// const executablePath =
//     process.env.PUPPETEER_EXECUTABLE_PATH ||
//     (process.pkg
//         ? path.join(
//             path.dirname(process.execPath),
//             'puppeteer',
//             ...puppeteer
//                 .executablePath()
//                 .split(path.sep)
//                 .slice(6), // /snapshot/project/node_modules/puppeteer/.local-chromium
//         )
//         : puppeteer.executablePath());
//
// const browser = puppeteer.launch({
//     executablePath,
// });

//example
//https://ov.ihned.cz/vyhledavani?sections=17&publish_date_from=2020-03-02

const RESULT_SITE = "https://ov.ihned.cz/zapis/";
const SITE = "https://ov.ihned.cz/vysledky?";
const SECTION_ATR = "sections=17";
const DATE_ATR = "publish_date_from=";

const getSite = (date) => {
    return SITE + SECTION_ATR + "&" + DATE_ATR + date;
};

const chooseDate = () => {
    let result;
    while (true) {
        result = readlineSync.question("Vyberte datum ve tvaru YYYY-MM-DD (rok-mesic-den) napr. 2015-01-23: ");
        if (/^\d{4}-\d{2}-\d{2}$/.test(result)) {
            let date = result.split("-");
            let enterDate = {
                day: parseInt(date[2]),
                month: parseInt(date[1]),
                year: parseInt(date[0]),
            };
            if (enterDate.day > 0 && enterDate.day < 32 && enterDate.month < 13 && enterDate.month > 0 && enterDate.year <= new Date().getFullYear()) {
                return result;
            }
        }
        console.log("Zadali jste neplatný datum, prosím zadejte znovu");
    }
};

const scrapeData = async(browser, data) => {
    const page = await browser.newPage();
    let scrapedData = [];
    for (let i = 0; i < data.length; i++) {
        await page.waitFor(1000);
        await Promise.all([
            page.waitForNavigation(),
            await page.goto(RESULT_SITE + data[i])
        ]);
        scrapedData.push(await page.$eval('article.document', e => e.innerText));
    }
    return scrapedData;
};

const getData = async(browser, site, filter) => {
    let data = [];
    let pageNumber = 1;
    const page = await browser.newPage();
    while (true) {
        await Promise.all([
            page.waitForNavigation(),
            await page.goto(site + "&page=" + pageNumber)
        ]);
        await page.waitFor(1000);
        if (await page.$('div.alert.alert-warning') === null) {
            data.push(...await page.$$eval('#results-table > tbody > tr', (trs, filter) => {
                let webData = [];
                trs.forEach(tr => {
                    let isValid = false;
                    let address = /\s?\d{3}\s\d{2}\s(.*)/.exec(tr.querySelector('td:nth-child(4)').innerText.split(',')[tr.querySelector('td:nth-child(4)').innerText.split(',').length - 1])[1].toLowerCase();
                    filter.forEach(town => {
                        if (town === address) {
                            isValid = true;
                        }
                    });
                    if (isValid) {
                        webData.push(/\d+/.exec(tr.querySelector("td:nth-child(1) a").href)[0]);
                    }
                });
                return webData;
            }, filter));
            pageNumber++;
        } else {
            await page.close();
            return data;
        }
    }
};

const loadTowns = (filename) => {
    return fs.readFileSync(filename, 'utf-8').split('\r\n');
};

const setupData = (data) => {
    let text = "";
    data.forEach(companyDesc => {
        text += `<p>${companyDesc}</p>\n\n`
    });
    return text.replace(/\n/g, '<br/>');
};

const saveToDocx = (text) => {
    let isDone = false;
    while (!isDone) {
        let docx = Docx.asBlob(text);
        try {
            fs.writeFileSync("DATA.docx", docx);
            isDone = true;
        } catch {
            readlineSync.question("Prosim zavrete soubor DATA.docx nez budete pokracovat (pro pokracovaní zmacknete enter)");
        }
    }
};

(async() => {
    const browser = await puppeteer.launch();
    let date = chooseDate();
    console.log("Načítám města z mesta.txt...");
    let filter = loadTowns("mesta.txt");
    console.log("kompiluji stránku...");
    let SITE = getSite(date)
    console.log("hledám záznamy z webu...");
    let data = await getData(browser, site, filter);
    console.log("sbírám data z webu...");
    let scrapedData = await scrapeData(browser, data);
    console.log("upravuji data...")
    let outputData = setupData(scrapedData);
    console.log("ukládám data do wordu - DATA.docx");
    saveToDocx(outputData);
    await browser.close();
    console.log("vše proběhlo úspěšně! zmáčkněte jakékoliv tlačítko pro ukončení");
})();