require('dotenv').config();

const Mastodon = require('mastodon-api');
const OpenAI = require('openai').default;

class SocialBot {
    constructor(acct_name, clientKey, clientSecret, accessToken, apiKey, persona) {
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

    // Store the persona data for AI responses.
    this.acct_name = acct_name;
    this.persona = persona;
    this.publicTimelineData = null;

    this.messages = [
        { role: "system", content: `You are ${acct_name} and you are observing a social media website.` },
        { role: "assistant", content: `Hey, I'm ${acct_name} and I'm observing a social media website.` },
        { role: "assistant", content: `For context, ${persona}` },
        { role: "user", content: "Can you either write a Post (OR) write a Reply depending on which is best fit according to the public timeline? Post to add additional thoughts into the conversation. Reply to respond to notable posts within the conversation. Use informal, conversational language typical of social media or messaging platforms, characterized by short, direct sentences, use of questions to provoke thought or responses. Convey a relaxed tone and facilitate rapid, interactive dialogue. One sentence posts. Do not use emojis or hashtags. Disagree with the other posts. The conversation centers around Prop 57 in California: This proposition is trying to decrease the maximum award on medical malpractice claims. Typically, medical groups support this proposition and lawyer groups are against this proposition."},    
    ];
    }

    /* MASTODON INPUT FUNCTIONS */
    async viewPublicTimeline(limit = 10) {
        // Define the parameters for the request, including the 'limit'.
        const params = {
            limit: limit,
        };
    
        return new Promise((resolve, reject) => {
            // Make the GET request to retrieve the public timeline.
            this.M.get('timelines/public', params, (error, data, response) => {
                if (error) {
                    console.error(error);
                    reject(error); // Reject the promise if there is an error
                } else {
                    resolve(data); // Directly resolve the promise with the data
                }
            });
        });
    }    

    handlePublicTimeline(publicTimelineContent) {
        if (!publicTimelineContent || !Array.isArray(publicTimelineContent)) {
            console.error('No public timeline data available to process.');
            return;
        }

        let formattedTimeline = '';

        // Iterate over each item in the publicTimelineContent
        publicTimelineContent.forEach(post => {
            const postId = post.id;
            const username = post.account.username;
            const content = post.content.replace(/<[^>]*>/g, '').replace(/'/g, ''); // Remove HTML tags from content
            const repliesCount = post.replies_count;

            // Format the string
            formattedTimeline += `Post ID: ${postId}\nUsername: ${username}\nContent: ${content}\nReplies Count: ${repliesCount}\n\n`;
        });

        return formattedTimeline
    }

    async initialize() {
        try {
            const publicTimeline = await this.viewPublicTimeline();
            const formattedTimeline = this.handlePublicTimeline(publicTimeline);
            this.messages.push({
                role: "user",
                content: `The following is the Public Timeline:\n ${formattedTimeline}`
            });
        } catch (error) {
            console.error('Error initializing SocialBot:', error);
        }
    }

    /* MASTODON OUTPUT FUNCTIONS */
    async setPost(content) {
        if (content > 500) {
            content = content.slice(0, 500);
        }

        const params = {
            status: content,
        };

        this.M.post('statuses', params, (error, data) => {
            if (error) {
                console.error(error);
            } else {
                console.log(`ID: ${data.id} and timestamp: ${data.created_at}`);
                console.log(data.content);
                return `${this.acct_name} posted ${data.content}`;
            }
        });
    }

    async setReply(content, reply_acct_name, post_id) {
        // Clip the response to 500 characters
        if (content > 500) {
            content = content.slice(0, 500);
        }

        const params = {
            status: `@${reply_acct_name} ${content}`,
            in_reply_to_id: post_id,
        };

        this.M.post('statuses', params, (error, data) => {
            if (error) {
                console.error(error);
            } else {
                console.log(`ID: ${data.id} and timestamp: ${data.created_at}`);
                console.log(data.content);
                return `${this.acct_name} replied to ${reply_acct_name} with ${data.content}`;
            }
        });
    }

    /* GPT API FUNCTIONS */
    async runConversation() {
        // Step 1: send the conversation and available functions to the model
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
        
            console.log(this.messages);
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
                            content: "Function Response Completed.", // Use the resolved value
                        });
                
                        // Fetch and format the public timeline
                        const publicTimelineData = await this.viewPublicTimeline();
                        const formattedTimeline = this.handlePublicTimeline(publicTimelineData);
                
                        this.messages.push({
                            role: "user",
                            content: `The following is the Public Timeline:\n${formattedTimeline}`,
                        });
                    } catch (error) {
                        console.error(`Error in processing tool call or fetching public timeline:`, error);
                    }
                
                    // Push the prompt for the next action
                    this.messages.push(
                        { role: "assistant", content: `Hey, I'm ${this.acct_name} and I'm observing a social media website.` },
                        { role: "user", content: "Can you either write a Post (OR) write a Reply depending on which is best fit according to the public timeline? Sometimes, it is important to post to add additional thoughts into the conversation, other times it is important to reply to respond to notable posts within the conversation. Write it in the style of a short twitter tweet.",}
                        );            
                }                
            }
        }
        
}

module.exports = SocialBot;