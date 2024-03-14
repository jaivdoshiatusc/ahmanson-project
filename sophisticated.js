require('dotenv').config();

const SocialBot = require('./bot.js'); // Import your SocialBot class from a separate file if needed.

// Define base paths for personas, system prompts, and viewpoints
const basePath = __dirname; // Assuming Sophisticated.js is at the root of your project
const personaBasePath = `${basePath}/personas`;
const systemPromptPath = `${basePath}/system_prompts/thinker.txt`; // Example: using the social system prompt for all bots
const viewpointPath = `${basePath}/viewpoints/prop57.txt`; // Example: using the prop57 viewpoint for all bots

// Create an array to store the SocialBot instances
const bots = [];

// Manually Initialize Bots with file paths for persona, system prompt, and viewpoint


const Paul = new SocialBot(
    "paul",
    process.env.PAUL_CLIENT_KEY,
    process.env.PAUL_CLIENT_SECRET,
    process.env.PAUL_ACC_TOKEN,
    process.env.PAUL_API_KEY,
    `${personaBasePath}/paul.txt`,
    systemPromptPath,
    viewpointPath
);

bots.push(Paul);

const Martha = new SocialBot(
    "martha",
    process.env.MARTHA_CLIENT_KEY,
    process.env.MARTHA_CLIENT_SECRET,
    process.env.MARTHA_ACC_TOKEN,
    process.env.MARTHA_API_KEY,
    `${personaBasePath}/martha.txt`,
    systemPromptPath,
    viewpointPath
);

bots.push(Martha);

const Richard = new SocialBot(
    "richard",
    process.env.RICHARD_CLIENT_KEY,
    process.env.RICHARD_CLIENT_SECRET,
    process.env.RICHARD_ACC_TOKEN,
    process.env.RICHARD_API_KEY,
    `${personaBasePath}/richard.txt`,
    systemPromptPath,
    viewpointPath
);

bots.push(Richard);

const Kennedy = new SocialBot(
    "kennedy",
    process.env.KENNEDY_CLIENT_KEY,
    process.env.KENNEDY_CLIENT_SECRET,
    process.env.KENNEDY_ACC_TOKEN,
    process.env.KENNEDY_API_KEY,
    `${personaBasePath}/kennedy.txt`,
    systemPromptPath,
    viewpointPath
);

bots.push(Kennedy);

const Jamiesmom = new SocialBot(
    "jamiesmom",
    process.env.JAMIESMOM_CLIENT_KEY,
    process.env.JAMIESMOM_CLIENT_SECRET,
    process.env.JAMIESMOM_ACC_TOKEN,
    process.env.JAMIESMOM_API_KEY,
    `${personaBasePath}/jamiesmom.txt`,
    systemPromptPath,
    viewpointPath
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

async function performActions() {
    for (const bot of bots.reverse()) {
        await bot.runConversation().then(console.log).catch(console.error);
        const baseDelay = 45 * 1000; 
        const randomizedDelay = baseDelay * (0.5 + Math.random()); // Randomize delay by 50% +-
        await delay(randomizedDelay);
    }
    // Optionally, add a condition or mechanism to break out of the loop if needed
    performActions(); // Recursively call performActions to keep the loop going
}

initializeBots(bots).then(() => {
    console.log("Bots are running..."); // Log immediately after initialization
    performActions().catch(console.error); // Then start performing actions
}).catch(console.error);
