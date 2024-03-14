require('dotenv').config();

const SocialBot = require('./bot.js'); // Import your SocialBot class from a separate file if needed.

// Define base paths for personas, system prompts, and viewpoints
const basePath = __dirname; // Assuming Sophisticated.js is at the root of your project
const personaBasePath = `${basePath}/personas`;
const systemPromptPath = `${basePath}/system_prompts/state.txt`; // Example: using the social system prompt for all bots

// Create an array to store the SocialBot instances
const bots = [];

// Manually Initialize Bots with file paths for persona, system prompt, and viewpoint


const Paul = new SocialBot(
    "paul",
    process.env.PAUL_CLIENT_KEY,
    process.env.PAUL_CLIENT_SECRET,
    process.env.PAUL_ACC_TOKEN,
    process.env.CHATGPT_KEY,
    `${personaBasePath}/paul.txt`,
    systemPromptPath,
    `${basePath}/viewpoints/prop57.txt`
);

bots.push(Paul);

const Martha = new SocialBot(
    "martha",
    process.env.MARTHA_CLIENT_KEY,
    process.env.MARTHA_CLIENT_SECRET,
    process.env.MARTHA_ACC_TOKEN,
    process.env.CHATGPT_KEY,
    `${personaBasePath}/martha.txt`,
    systemPromptPath,
    `${basePath}/viewpoints/prop57.txt`
);

bots.push(Martha);

const Richard = new SocialBot(
    "richard",
    process.env.RICHARD_CLIENT_KEY,
    process.env.RICHARD_CLIENT_SECRET,
    process.env.RICHARD_ACC_TOKEN,
    process.env.CHATGPT_KEY,
    `${personaBasePath}/richard.txt`,
    systemPromptPath,
    `${basePath}/viewpoints/prop57.txt`
);

bots.push(Richard);

const Kennedy = new SocialBot(
    "kennedy",
    process.env.KENNEDY_CLIENT_KEY,
    process.env.KENNEDY_CLIENT_SECRET,
    process.env.KENNEDY_ACC_TOKEN,
    process.env.CHATGPT_KEY,
    `${personaBasePath}/kennedy.txt`,
    systemPromptPath,
    `${basePath}/viewpoints/prop57-for.txt`
);

bots.push(Kennedy);

const Jamiesmom = new SocialBot(
    "jamiesmom",
    process.env.JAMIESMOM_CLIENT_KEY,
    process.env.JAMIESMOM_CLIENT_SECRET,
    process.env.JAMIESMOM_ACC_TOKEN,
    process.env.CHATGPT_KEY,
    `${personaBasePath}/jamiesmom.txt`,
    systemPromptPath,
    `${basePath}/viewpoints/prop57-against.txt`
);

bots.push(Jamiesmom);


async function initializeBots(bots) {
    // Wait for all bots to complete their initialization
    await Promise.all(bots.map(bot => bot.initialize()));
    console.log("All bots have been initialized.");
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function performActionForBot(bot) {
    await bot.runConversation().then(console.log).catch(console.error);
    const baseDelay = 45 * 1000;
    const randomizedDelay = baseDelay * (0.5 + Math.random()); // Randomize delay by 50% +-
    await delay(randomizedDelay);
    performActionForBot(bot); // Recursively call performActionForBot to keep the loop going for each bot
}

initializeBots(bots).then(() => {
    console.log("Bots are running..."); // Log immediately after initialization
    bots.forEach(bot => {
        performActionForBot(bot).catch(console.error); // Start performing actions for each bot independently
    });
}).catch(console.error);
