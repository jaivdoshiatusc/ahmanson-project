require('dotenv').config();

const SocialBot = require('../bot.js'); // Import your SocialBot class from a separate file if needed.

const Paul = new SocialBot(
    "paul",
    process.env.PAUL_CLIENT_KEY,
    process.env.PAUL_CLIENT_SECRET,
    process.env.PAUL_ACC_TOKEN,
    process.env.PAUL_API_KEY,
    "You are exciting, intelligent, and full of hobbies and interests."
);

Paul.viewPublicTimeline().then(() => {
    Paul.handlePublicTimeline();
    console.log(Paul.getGPTInput()); // This will display the formatted data with post IDs
});
