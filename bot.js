require('dotenv').config();
const fs = require('fs');
const path = require('path');

const Mastodon = require('mastodon-api');
const OpenAI = require('openai').default;

const tools = [
    {
    type: "function",
    function: {
        name: "set_post",
        description: "Write a post for a social media website.",
        parameters: {
            type: "object",
            properties: {
                content: {
                    type: "string",
                    description: "Content of the post.",
                },
            },
            required: ["content"],
        },
    },
    },
    {
    type: "function",
    function: {
        name: "set_reply",
        description: "Write a reply for a social media website.",
        parameters: {
            type: "object",
            properties: {
                content: {
                    type: "string",
                    description: "Content of the reply.",
                },
                reply_acct_name: {
                    type: "string",
                    description: "Username of the post you want to reply to.",
                },   
                post_id: {
                    type: "string",
                    description: "Post ID of the post you want to reply to.",
                },    
            }, 
            required: ["content", "reply_acct_name", "post_id"],
        },
    },
    },
];
class SocialBot {
    constructor(acct_name, clientKey, clientSecret, accessToken, apiKey, personaFilePath, systemFilePath, viewpointFilePath) {
        // Initialize the Mastodon API client.
        this.M = new Mastodon({
            client_key: clientKey,
            client_secret: clientSecret,
            access_token: accessToken,
            timeout_ms: 60*1000,  // optional HTTP request timeout to apply to all requests.
            api_url: 'https://ahlab.masto.host/api/v1/',
        });

        // Initialize the OpenAI client.
        this.openai = new OpenAI({
            apiKey: apiKey,
        });
        
        this.init_logging(acct_name);

        // Store the persona data for AI responses.
        this.acct_name = acct_name;
        this.publicTimelineData = null;

        // Read and set persona, viewpoint, and system from their respective files
        this.readFromFile(personaFilePath, 'persona');
        this.readFromFile(systemFilePath, 'system');
        this.readFromFile(viewpointFilePath, 'viewpoint');
        

        this.messages = [
            { role: "system", content: `${this.persona} ${this.system} ${this.viewpoint}`},    
        ];

        this.latestPostId = null; // Store the highest post ID seen
        this.latestPostTimestamp = null;
        this.timelineUpdates = []; // List to store timeline updates

        this.postLimit = 15;

        // Log initial parameters
        this.log(`Initial parameters: acct_name: ${this.acct_name}, personaFilePath: ${personaFilePath}, systemFilePath: ${systemFilePath}, viewpointFilePath: ${viewpointFilePath}`);
    }

    init_logging(acct_name) {
        const logFolder = path.join(__dirname, 'logs');
        if (!fs.existsSync(logFolder)) {
            fs.mkdirSync(logFolder);
        }
        const date = new Date();
        const formattedDate = `${date.getDate()}-${date.getMonth() + 1}-${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}`;
        this.logFilePath = path.join(logFolder, `${acct_name}-${formattedDate}.log`);
        this.log(`Bot initialized with account name: ${acct_name}`);
    }

    readFromFile(filePath, property) {
        try {
            const fileContents = fs.readFileSync(filePath, 'utf8');
            this[property] = fileContents.trim(); // Assuming the file contains plain text
            this.log(`${property} set from file: ${filePath}`);
        } catch (error) {
            console.error(`Failed to read ${property} from file: ${error}`);
            this.log(`Failed to read ${property} from file: ${error}`);
        }
    }

    log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        fs.appendFileSync(this.logFilePath, logMessage);
    }

    /* MASTODON INPUT FUNCTIONS */
    async viewPublicTimeline(limit = 10) {
        // Define the parameters for the request, including the 'limit'.
        const params = {
            limit: limit,
        };

        if (this.latestPostId) {
            params.since_id = this.latestPostId;
        }
    
        return new Promise((resolve, reject) => {
            this.M.get('timelines/public', params, (error, data, response) => {
                if (error) {
                    console.error(error);
                    reject(error);
                    this.log(`Error fetching public timeline: ${error}`);
                } else {
                    console.log("Latest public timeline message:", data[0]);
                    this.log(`Fetched public timeline with limit: ${limit}`);
                    if (data.length > 0) {
                        this.timelineUpdates = data.concat(this.timelineUpdates);
                    }
                    resolve(this.timelineUpdates);
                }
            });
        });
    }
    

    handlePublicTimeline(timelineUpdates, limit = 10) {
        if (!timelineUpdates || !Array.isArray(timelineUpdates) || timelineUpdates.length === 0) {
            console.error('No public timeline data available to process.');
            this.log('No public timeline data available to process.');
            return '';
        }

        // Limit the number of posts to format to limit
        let count = 0;
        let formattedTimeline = '';

        // Iterate over each item in the limited publicTimelineContent
        timelineUpdates.reverse().forEach((post) => {
            const postId = post.id;
            const username = post.account.username;
            const content = post.content.replace(/<[^>]*>/g, '').replace(/'/g, ''); // Remove HTML tags and single quotes from content
            const repliesCount = post.replies_count;
            const created_at = post.created_at;

            console.log("Latest Post ID: ", this.latestPostId);
            console.log("Current Post ID: ", postId);
            
            if (!this.latestPostTimestamp || new Date(created_at) > new Date(this.latestPostTimestamp)) {
                this.latestPostId = postId;
                this.latestPostTimestamp = created_at;
                console.log(`Updated latestPostId to ${this.latestPostId} and latestPostTimestamp to ${this.latestPostTimestamp}`);
                this.log(`Updated latestPostId to ${this.latestPostId} and latestPostTimestamp to ${this.latestPostTimestamp}`);
            } else {
                return; // Stop the loop when the latest post is reached
            }
            
            if (count >= limit) {
                return; // Stop the loop if the limit is reached
            }
            count+=1;

            console.log("Adding to formatted timeline", postId);

            // Format the string
            formattedTimeline += `Post ID: ${postId}\nUsername: ${username}\nContent: ${content}\nReplies Count: ${repliesCount}\n\n`;
            this.log(`Adding to formatted timeline: Post ID: ${postId}, Username: ${username}, Content: ${content}, Replies Count: ${repliesCount}`);
        });

        if (formattedTimeline === '') {
            return 'No new posts in the public timeline.';
        }

        return formattedTimeline;
    }

    async initialize() {
        try {
            const timelineUpdates = await this.viewPublicTimeline(this.postLimit);
            const formattedTimeline = this.handlePublicTimeline(timelineUpdates, this.postLimit);
            this.messages.push({
                role: "user",
                content: `The following is the Public Timeline from oldest to newest:\n ${formattedTimeline}`
            });
            this.log(`Initialized with Public Timeline: ${formattedTimeline}`);
        } catch (error) {
            console.error('Error initializing SocialBot:', error);
            this.log(`Error initializing SocialBot: ${error}`);
        }
    }

    /* MASTODON OUTPUT FUNCTIONS */
    async setPost(content) {
        if (content.length > 500) {
            content = content.slice(0, 500);
        }

        const params = {
            status: content,
        };

        let text_content = content;

        return new Promise((resolve, reject) => {
            this.M.post('statuses', params, (error, data) => {
                if (error) {
                    console.error(error);
                    reject(error);
                    this.log(`Error posting status: ${error}`);
                } else {
                    console.log(`ID: ${data.id} and timestamp: ${data.created_at}`);
                    console.log(`${this.acct_name} posted ${text_content}`);
                    this.log(`${this.acct_name} posted: ${text_content}`);
                    resolve(`${this.acct_name} posted ${text_content}`);
                }
            });
        });
    }

    async setReply(content, reply_acct_name, post_id) {
        // Clip the response to 500 characters
        if (content.length > 500) {
            content = content.slice(0, 500);
        }

        const params = {
            status: `@${reply_acct_name} ${content}`,
            in_reply_to_id: post_id,
        };

        let text_content = `@${reply_acct_name} ${content}`;

        return new Promise((resolve, reject) => {
            this.M.post('statuses', params, (error, data) => {
                if (error) {
                    console.error(error);
                    reject(error);
                    this.log(`Error replying to post: ${error}`);
                } else {
                    console.log(`ID: ${data.id} and timestamp: ${data.created_at}`);
                    console.log(`${this.acct_name} replied to ${reply_acct_name} with ${text_content}`);
                    this.log(`${this.acct_name} replied to ${reply_acct_name} with ${text_content}`);
                    resolve(`${this.acct_name} replied to ${reply_acct_name} with ${text_content}`);
                }
            });
        });
    }

    /* GPT API FUNCTIONS */
    async runConversation() {
        // Fetch and format the public timeline
        const timelineUpdates = await this.viewPublicTimeline(this.postLimit);
        const formattedTimeline = this.handlePublicTimeline(timelineUpdates, this.postLimit);
        this.messages.push({
            role: "user",
            content: `The following is the Public Timeline from oldest to newest:\n${formattedTimeline}`,
        }); 


        // Step 1: send the conversation and available functions to the model

        console.log("Messages:", this.messages);

        const response = await this.openai.chat.completions.create({
            model: "gpt-4-1106-preview",
            messages: this.messages,
            tools: tools,
            tool_choice: "auto", // auto is default, but we'll be explicit
        });
        const responseMessage = response.choices[0].message;
    
        // Step 2: check if the model wanted to call a function
        const toolCalls = responseMessage.tool_calls;
        if (responseMessage.tool_calls) {
            // Step 3: call the function
            // Note: the JSON response may not always be valid; be sure to handle errors
            const availableFunctions = {
                set_post: this.setPost.bind(this),
                set_reply: this.setReply.bind(this),
            }; // only one function in this example, but you can have multiple
            this.messages.push(responseMessage); // extend conversation with assistant's reply
            for (const toolCall of toolCalls) {
                const functionName = toolCall.function.name;
                const functionToCall = availableFunctions[functionName];
                const functionArgs = JSON.parse(toolCall.function.arguments);
            
                try {
                    // Declare a variable to store the resolved value
                    let functionResponseValue;
            
                    switch (functionName) {
                        case 'set_post':
                            // Await the Promise and get the actual response
                            functionResponseValue = await functionToCall(functionArgs.content);
                            break;
                        case 'set_reply':
                            // Await the Promise and get the actual response
                            functionResponseValue = await functionToCall(functionArgs.content, functionArgs.reply_acct_name, functionArgs.post_id);
                            break;
                    }
            
                    this.messages.push({
                        tool_call_id: toolCall.id,
                        role: "tool",
                        name: functionName,
                        content: functionResponseValue, // Use the resolved value
                    });
                    this.log(`Function called successfully: ${functionName}`);
            
                } catch (error) {
                    console.error(`Error in processing tool call or fetching public timeline:`, error);
                    this.log(`Error in processing tool call or fetching public timeline: ${error}`);
                }
            
            }  
             
        }
    }
        
}

module.exports = SocialBot;