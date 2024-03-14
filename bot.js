require('dotenv').config();
const fs = require('fs');
const path = require('path');

const Mastodon = require('mastodon-api');
const OpenAI = require('openai').default;

const tools = [
    {
        type: "function",
        function: {
            name: "post",
            description: "Write a post for a social media website. I need to think prior to posting.",
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
            name: "comment",
            description: "Write a comment for a post on the public timeline. I need to inspect prior to commenting.",
            parameters: {
                type: "object",
                properties: {
                    content: {
                        type: "string",
                        description: "Content of the comment.",
                    },
                    reply_acct_name: {
                        type: "string",
                        description: "User's username of the post I want to comment on.",
                    },   
                    post_id: {
                        type: "string",
                        description: "Post ID of the post I want to comment on.",
                    },    
                }, 
                required: ["content", "reply_acct_name", "post_id"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "response",
            description: "Write a reply for a response to me. Include notification id to dismiss that notification.  I need to think prior to responding.",
            parameters: {
                type: "object",
                properties: {
                    content: {
                        type: "string",
                        description: "Content of the reply.",
                    },
                    reply_acct_name: {
                        type: "string",
                        description: "User's username of the post I want to reply to.",
                    },   
                    post_id: {
                        type: "string",
                        description: "Post ID of the post I want to reply to.",
                    },
                    orig_post_id: {
                        type: "string",
                        description: "ID of my post the other user is replying to.",
                    },
                    notification_id: {
                        type: "string",
                        description: "The ID of the notification to reply to.",
                    },
                }, 
                required: ["content", "reply_acct_name", "post_id", "orig_post_id", "notification_id"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "inspect",
            description: "Get the context of a post, including all ancestors and descendants.",
            parameters: {
                type: "object",
                properties: {
                    post_id: {
                        type: "string",
                        description: "ID of the post.",
                    },
                },
                required: ["post_id"],
            },
        },
    },
{
    type: "function",
    function: {
        name: "think",
        description: "Critically think about the presented conversation and form an informed opinion. Can be for a specific post or reply.",
        parameters: {
            type: "object",
            properties: {
                post_id: {
                    type: "string",
                    description: "ID of the post to think about.",
                },
                content: { 
                    type: "string",
                    description: "The content of the thought.",
                },
            },
            required: ["content"],
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

        // Add an enum for operation states
        this.OperationState = {
            THINK: 'think',
            POST: 'post',
            INSPECT: 'inspect',
            COMMENT: 'comment',
            RESPONSE: 'response',
            INIT: 'init',
        };

        // Initialize the last state
        this.lastStates = [this.OperationState.INIT];
        this.hasThought = false;
        this.inspectedPosts = {};

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
            { role: "system", content: `${this.persona} \n\n ${this.viewpoint} \n\n ${this.system} `},
        ];

        this.latestPostId = null; // Store the highest post ID seen
        this.latestPostTimestamp = null;
        this.timelineUpdates = []; // List to store timeline updates

        this.postLimit = 5;
        this.notificationLimit = 2;

        this.availableFunctions = {
            post: this.setPost.bind(this),
            comment: this.setComment.bind(this),
            response: this.setResponse.bind(this),
            inspect: this.getContext.bind(this),
            think: this.doThink.bind(this),
        }; 

        // Log initial parameters
        this.log(`Initial parameters: acct_name: ${this.acct_name}, personaFilePath: ${personaFilePath}, systemFilePath: ${systemFilePath}, viewpointFilePath: ${viewpointFilePath}`);
    }

    init_logging(acct_name) {
        const logFolder = path.join(__dirname, 'logs');
        if (!fs.existsSync(logFolder)) {
            fs.mkdirSync(logFolder);
        }
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0'); // getMonth() is zero-based
        const day = String(date.getDate()).padStart(2, '0');
        const formattedDate = `${year}-${month}-${day}--${date.getHours()}-${date.getMinutes()}`;
        this.logFilePath = path.join(logFolder, `${formattedDate}-${acct_name}.log`);
        this.messagesLogFilePath = path.join(logFolder, `${formattedDate}-${acct_name}-messages.log`);
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
        console.log(message);
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        fs.appendFileSync(this.logFilePath, logMessage);
    }

    log_messages() {
        const formattedMessages = this.messages.map(msg => `[${msg.role}] ${msg.content}`).join('\n');
        fs.appendFileSync(this.messagesLogFilePath, formattedMessages + '\n');
    }

    /* MASTODON VIEWING FUNCTIONS */

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
                    this.log(`Fetched public timeline with limit: ${limit}`);
                    if (data.length > 0) {
                        this.timelineUpdates = data.concat(this.timelineUpdates);
                    }
                    resolve(this.timelineUpdates);
                }
            });
        });
    }

    async viewNotifications({max_id = null, since_id = null, min_id = null, limit = 5, types = [], exclude_types = [], account_id = null} = {}) {
        const params = {
            ...(max_id && {max_id}),
            ...(since_id && {since_id}),
            ...(min_id && {min_id}),
            limit,
            ...(types.length > 0 && {types: types.join(',')}),
            ...(exclude_types.length > 0 && {exclude_types: exclude_types.join(',')}),
            ...(account_id && {account_id}),
        };

        return new Promise((resolve, reject) => {
            this.M.get('notifications', params, (error, data) => {
                if (error) {
                    console.error(error);
                    reject(error);
                    this.log(`Error fetching notifications: ${error}`);
                } else {
                    console.log("Fetched notifications:", data);
                    resolve(data);
                }
            });
        });
    }

    async dismissAllNotifications() {
        return new Promise((resolve, reject) => {
            this.M.post('notifications/clear', {}, (error, data) => {
                if (error) {
                    console.error(error);
                    reject(error);
                    this.log(`Error clearing all notifications: ${error}`);
                } else {
                    this.log("All notifications cleared successfully");
                    resolve(data);
                }
            });
        });
    }

    async dismissNotification(notificationId) {
        return new Promise((resolve, reject) => {
            this.M.post(`notifications/${notificationId}/dismiss`, {}, (error, data) => {
                if (error) {
                    console.error(error);
                    reject(error);
                    this.log(`Error dismissing notification ${notificationId}: ${error}`);
                } else {
                    this.log(`Notification ${notificationId} dismissed successfully`);
                    resolve(data);
                }
            });
        });
    }

    async viewPostContext(statusId) {
        const endpoint = `statuses/${statusId}/context`;
        try {
            return new Promise((resolve, reject) => {
                this.M.get(endpoint, {}, (error, data) => {
                    if (error) {
                        console.error(error);
                        reject(error);
                        this.log(`Error fetching status context for ID ${statusId}: ${error}`);
                    } else {
                        this.log(`Fetched context for status ID ${statusId}`);
                        resolve(data);
                    }
                });
            });
        } catch (error) {
            console.error('Error fetching status context:', error);
            this.log(`Error fetching status context: ${error}`);
            return `Error fetching status context: ${error}`;
        }
    }
    /* END MASTODON VIEWING FUNCTIONS */

    /* FORMATTING */

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
            const content = post.content.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'); // Remove HTML tags and single quotes from content
            const repliesCount = post.replies_count;
            const created_at = post.created_at;

            console.log("Latest Post ID: ", this.latestPostId);
            console.log("Current Post ID: ", postId);
            
            if (!this.latestPostTimestamp || new Date(created_at) > new Date(this.latestPostTimestamp)) {
                this.latestPostId = postId;
                this.latestPostTimestamp = created_at;
                console.log(`Updated latestPostId to ${this.latestPostId} and latestPostTimestamp to ${this.latestPostTimestamp}`);
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
        });

        if (formattedTimeline === '') {
            return 'No new posts in the public timeline.';
        }

        return formattedTimeline;
    }

    handleNotifications(notifications) {
        if (!notifications || !Array.isArray(notifications) || notifications.length === 0) {
            console.error('No notifications available to process.');
            this.log('No notifications available to process.');
            return 'No new notifications.';
        }

        let formattedNotifications = '';

        notifications.forEach(notification => {
            const { id, type, created_at, account, status } = notification;
            const username = account.username;
            const postId = status ? status.id : 'N/A'; // Get the post ID if available
            const content = status ? status.content.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&') : 'N/A'; // Remove HTML tags and single quotes from content
            const timestamp = new Date(created_at).toLocaleString();
            const orig_post_id = status ? status.in_reply_to_id : 'N/A'; // Get the original post ID if available

            formattedNotifications += `Notification ID: ${id}\nPost ID: ${postId}\nUsername: ${username}\nContent: ${content}\nOriginal Post ID: ${orig_post_id}\n\n`;
        });

        if (formattedNotifications === '') {
            return 'No new notifications.';
        }

        return formattedNotifications;
    }

    handleStatusContext(context) {
        let formattedContext = 'Context:\n';

        if (context.ancestors.length > 0) {
            formattedContext += 'Ancestors:\n';
            context.ancestors.forEach((status) => {
                console.log("Ancestor: ", status);
                const username = status.account.username;
                const content = status.content.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'); // Remove HTML tags and single quotes from content
                formattedContext += `ID: ${status.id}, Username: ${username}, Content: ${content}\n`;
            });
        } else {
            formattedContext += 'No ancestors.\n';
        }

        if (context.descendants.length > 0) {
            formattedContext += 'Descendants:\n';
            context.descendants.forEach((status) => {
                console.log("Descendant: ", status);
                const username = status.account.username;
                const content = status.content.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'); // Remove HTML tags and single quotes from content
                formattedContext += `ID: ${status.id}, Username: ${username}, Content: ${content}\n`;
            });
        } else {
            formattedContext += 'No descendants.\n';
        }

        return formattedContext;
    }

    /* END FORMATTING */

    

    /* GPT ASSISTANT TOOLS */

    async setPost(content) {
        // if (!this.hasThought) {
        //     return new Promise((resolve, reject) => {
        //         reject(`Error: I must think before I post.`);
        //     });
        // }
        // this.hasThought = false;
        this.lastStates.push(this.OperationState.POST);

        if (content.length > 500) {
            content = content.slice(0, 499);
            this.log(`Clipped reply content to 499 characters.`);
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
                    this.log(`post: I (${this.acct_name}) posted: ${text_content}`);
                    resolve(`post: I (${this.acct_name}) posted: ${text_content}`);
                }
            });
        });
    }

    async setComment(content, reply_acct_name, post_id) {
        // if (!this.inspectedPosts[post_id]) {
        //     return new Promise((resolve, reject) => {
        //         reject(`Error: The post with ID ${post_id} must be inspected before I can comment.`);
        //     });
        // }
        this.lastStates.push(this.OperationState.COMMENT);
        // Clip the response to 500 characters
        if (content.length > 500) {
            content = content.slice(0, 499);
            this.log(`Clipped reply content to 499 characters.`);
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
                    this.log(`comment: I (${this.acct_name}) commented on post ${post_id} by ${reply_acct_name} with ${text_content}`);
                    resolve(`comment: I (${this.acct_name}) commented on post ${post_id} by ${reply_acct_name} with ${text_content}`);
                }
            });
        });
    }

    async setResponse(content, reply_acct_name, post_id, orig_post_id, notification_id) {
        // if (!this.inspectedPosts[post_id]) {
        //     return new Promise((resolve, reject) => {
        //         reject(`Error: The post with ID ${post_id} must be inspected before I can respond.`);
        //     });
        // }
        this.lastStates.push(this.OperationState.RESPONSE);

        if (notification_id) {
            await this.dismissNotification(notification_id);
        }

        if (content.length > 480) {
            content = content.slice(0, 480);
            this.log(`Clipped reply content to 480 characters.`);
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
                    const formatted_response = `response: I (${this.acct_name}) replied to ${reply_acct_name}'s response ${post_id} following my post ${orig_post_id} with ${text_content}`
                    this.log(formatted_response);
                    resolve(formatted_response);
                }
            });
        });
    }

    async getContext(post_id) {
        this.lastStates.push(this.OperationState.INSPECT);
        return new Promise(async (resolve, reject) => {
            try {
                if (this.inspectedPosts[post_id]) {
                    return this.inspectedPosts[post_id];
                }
                const raw_context = await this.viewPostContext(post_id);
                const formatted_context = this.handleStatusContext(raw_context);

                this.log(`inspect: Context for post ${post_id}: ${formatted_context}`);
                this.inspectedPosts[post_id] = formatted_context;
                resolve(`inspect: Context for post ${post_id}: ${formatted_context}`);
            } catch (error) {
                reject(error);
            }
        });
    }

    async doThink(content, post_id) { // this is just an empty function, a formality
        this.lastStates.push(this.OperationState.THINK);
        return new Promise((resolve, reject) => {
            this.hasThought = true;
            if (post_id) {
                resolve(`think: For post ${post_id}, I thought: ${content}`);
                this.log(`think: For post ${post_id}, I thought: ${content}`);
            } else {
                resolve(`think: I thought: ${content}`);
                this.log(`think: I thought: ${content}`);
            }
        });
    }

    /* END GPT ASSISTANT TOOLS */


    /* RUNTIME */

    async initialize() { // pass for now
        return new Promise((resolve, reject) => {
            resolve("pass");
        });

        // try {
        //     const timelineUpdates = await this.viewPublicTimeline(this.postLimit);
        //     const formattedTimeline = this.handlePublicTimeline(timelineUpdates, this.postLimit);
        //     this.messages.push({
        //         role: "user",
        //         content: `The following is the Public Timeline from oldest to newest:\n ${formattedTimeline}`
        //     });
        //     this.log(`Initialized with Public Timeline: ${formattedTimeline}`);

        //     // Fetch and format notifications
        //     const notifications = await this.viewNotifications({limit: this.notificationLimit});
        //     const formattedNotifications = this.handleNotifications(notifications);
        //     this.messages.push({
        //         role: "user",
        //         content: `The following are the latest notifications (replies to me):\n${formattedNotifications}`
        //     });
        //     this.log(`Initialized with Notifications: ${formattedNotifications}`);
        // } catch (error) {
        //     console.error('Error initializing SocialBot:', error);
        //     this.log(`Error initializing SocialBot: ${error}`);
        // }
    }

    async runConversation() {
        // Fetch and format the public timeline
        const timelineUpdates = await this.viewPublicTimeline(this.postLimit);
        const formattedTimeline = this.handlePublicTimeline(timelineUpdates, this.postLimit);
        const new_message = {
            role: "user",
            content: `The following is the Public Timeline from oldest to newest:\n${formattedTimeline}`,
        };
        this.messages.push(new_message); 
        this.log(new_message.content);
        const notifications = await this.viewNotifications({limit: this.notificationLimit});
        const formattedNotifications = this.handleNotifications(notifications);
        const new_notifications = {
            role: "user",
            content: `The following are the latest notifications (replies to I):\n${formattedNotifications}`
        };
        this.messages.push(new_notifications);
        this.log(new_notifications.content);
        this.log(`Last states: ${this.lastStates.join('->')}`);
        


        // Step 1: send the conversation and available functions to the model

        console.log("Messages:", this.messages);


        const response = await this.openai.chat.completions.create({
            model: "gpt-3.5-turbo-0125", // gpt-4-1106-preview
            messages: this.messages,
            tools: tools,
            tool_choice: "auto", // auto is default, but we'll be explicit
        });
        const responseMessage = response.choices[0].message;
        console.log("Response message:", responseMessage);
        this.messages.push(responseMessage);
        if (responseMessage.content) {
            this.log(`Assistant: ${responseMessage.content}`);
        } else {
            this.log(`Assistant: none`);
        }
    
        // Step 2: check if the model wanted to call a function
        const toolCalls = responseMessage.tool_calls;
        if (!toolCalls) {
            this.log_messages();
            return;
        } 
        // Step 3: call the function
        // Note: the JSON response may not always be valid; be sure to handle errors
        for (const toolCall of toolCalls) {
            const functionName = toolCall.function.name;

            const functionArgs = JSON.parse(toolCall.function.arguments);
        
            try {
                // Declare a variable to store the resolved value
                let functionResponseValue;
        
                switch (functionName) {
                    case 'post':
                        // Await the Promise and get the actual response
                        functionResponseValue = await this.setPost(functionArgs.content);
                        break;
                    case 'comment':
                        // Await the Promise and get the actual response
                        functionResponseValue = await this.setComment(functionArgs.content, functionArgs.reply_acct_name, functionArgs.post_id);
                        break;
                    case 'response':
                        functionResponseValue = await this.setResponse(functionArgs.content, functionArgs.reply_acct_name, functionArgs.post_id, functionArgs.orig_post_id, functionArgs.notification_id);
                        break;
                    case 'think':
                        functionResponseValue = await this.doThink(functionArgs.content, functionArgs.post_id);
                        break;
                    case 'inspect':
                        functionResponseValue = await this.getContext(functionArgs.post_id);
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
                this.messages.push({
                    tool_call_id: toolCall.id,
                    role: "tool",
                    name: functionName,
                    content: `Function failed, reason: ${error}. Adjust actions and try again.`,
                });
                this.log(`Function failed, reason: ${error}`);
            }
        
        }  

        this.log_messages();
        return;

    }

    /* END RUNTIME */

}

module.exports = SocialBot;