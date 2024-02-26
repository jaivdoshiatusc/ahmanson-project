require('dotenv').config();

const SocialBot = require('./bot.js'); // Import your SocialBot class from a separate file if needed.

// Your persona data for each bot
const personas = [
                "I'm a 67-year-old grandfather from Montgomery, Alabama, deeply rooted in conservative values and skeptical of progressive changes, yet privately worried about climate change's impact on my family's farm. Although I firmly support Republican ideals and resist 'wokeness,' my commitment is challenged by my underlying concern for my grandchildren's future in a changing world.", 
                "I'm a swing state soccer mom, conservative yet socially liberal except on marijuana, who believes in the power of strong moms and often relates everything back to my two children or motherhood. I enjoy yacht rock, red wine, and staying trendy with teenage slang, all while harboring a secret crush on Jake, whose opinions I tend to echo.", 
                ];

// Changing system prompts.

// Create an array to store the SocialBot instances
const bots = [];

// Manually Initialize Bots
const Paul = new SocialBot(
    "paul",
    process.env.PAUL_CLIENT_KEY,
    process.env.PAUL_CLIENT_SECRET,
    process.env.PAUL_ACC_TOKEN,
    process.env.PAUL_API_KEY,
    personas[0]
);

bots.push(Paul);

const Martha = new SocialBot(
    "martha",
    process.env.MARTHA_CLIENT_KEY,
    process.env.MARTHA_CLIENT_SECRET,
    process.env.MARTHA_ACC_TOKEN,
    process.env.MARTHA_API_KEY,
    personas[1]
);

bots.push(Martha);

const Richard = new SocialBot(
    "richard",
    process.env.RICHARD_CLIENT_KEY,
    process.env.RICHARD_CLIENT_SECRET,
    process.env.RICHARD_ACC_TOKEN,
    process.env.RICHARD_API_KEY,
    personas[2]
);

bots.push(Richard);

const Kennedy = new SocialBot(
    "kennedy",
    process.env.KENNEDY_CLIENT_KEY,
    process.env.KENNEDY_CLIENT_SECRET,
    process.env.KENNEDY_ACC_TOKEN,
    process.env.KENNEDY_API_KEY,
    personas[3]
);

bots.push(Kennedy);

const Jamiesmom = new SocialBot(
    "jamiesmom",
    process.env.JAMIESMOM_CLIENT_KEY,
    process.env.JAMIESMOM_CLIENT_SECRET,
    process.env.JAMIESMOM_ACC_TOKEN,
    process.env.JAMIESMOM_API_KEY,
    personas[4]
);

bots.push(Jamiesmom);
  
async function initializeBots(bots) {
    // Wait for all bots to complete their initialization
    await Promise.all(bots.map(bot => bot.initialize()));
    console.log("All bots have been initialized.");
}

// Utility functions
const getRandomInt = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

const chooseRandomBots = (bots, numBots) => {
    const shuffled = bots.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, numBots);
};

const performRandomActions = async (selectedBots) => {
    for (const bot of selectedBots) {
        setTimeout(async () => {
            await bot.runConversation().then(console.log).catch(console.error);
        }, getRandomInt(1000, 20000)); // Random delay between 1s and 20s for each bot within the burst
    }
};

const scheduleBotActivity = () => {
    // Determine the number of bots to be active in this burst
    const numBots = getRandomInt(1, bots.length);
    const selectedBots = chooseRandomBots(bots, numBots);

    performRandomActions(selectedBots);

    // Schedule next burst
    const nextBurstInMilliseconds = getRandomInt(1 * 60 * 1000, 3 * 60 * 60 * 1000); // Random delay between 1 minute and 3 hours for the next burst
    setTimeout(scheduleBotActivity, nextBurstInMilliseconds);
};

async function initializeBots(bots) {
    // Wait for all bots to complete their initialization
    await Promise.all(bots.map(bot => bot.initialize()));
    console.log("All bots have been initialized.");
}

// Start the bot activity scheduling
initializeBots(bots).then(() => {
    scheduleBotActivity();
    console.log("Bots activity scheduling started...");
}).catch(console.error);