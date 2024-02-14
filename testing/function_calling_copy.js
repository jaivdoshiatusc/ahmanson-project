const OpenAI = require('openai').default;
require('dotenv').config();

const openai = new OpenAI({
                apiKey: process.env.PAUL_API_KEY,
            });

const messages = [
    { role: "system", content: "You are Paul and you are observing a social media website." },
    { role: "assistant", content: "Hey, I'm Paul and I'm observing a social media website." },
    { role: "user", content: `The following is the Public Timeline:\n Post ID: 111496378697836796\nUsername: jamiesmom\nContent: Unions are the backbone of the working class! Big corps exploit us every day. We need total police reform NOW. Dems aint great but theyre all we got. #WorkersUnite #NoJusticeNoPeace\nReplies Count: 2`},
    { role: "user", content: "Can you either write a Post (OR) write a reply to a Post depending on which is best fit according to the public timeline?"},
];

function getPublicTimeline() {
    console.log("viewed Public Timeline");
    return 'Post ID: 111496378697836796\nUsername: jamiesmom\nContent: Unions are the backbone of the working class! Big corps exploit us every day. We need total police reform NOW. Dems aint great but theyre all we got. #WorkersUnite #NoJusticeNoPeace\nReplies Count: 2';
}

function setStatus(content) {
    console.log("Paul posted: " + content);
    return `Paul posted ${content}`;
}

function setReply(content, acct_name, post_id) {
    console.log(`Paul replied to ${acct_name} with ${content}`);
    return `Paul replied to ${acct_name} with ${content}`
}

// function chooseOption(content) {
// }

async function runConversation() {
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
            description: "Write a reply to a post for a social media website.",
            parameters: {
                type: "object",
                properties: {
                    content: {
                        type: "string",
                        description: "Content of the reply.",
                    },
                    acct_name: {
                        type: "string",
                        description: "Username of the post you want to reply to.",
                    },   
                    post_id: {
                        type: "string",
                        description: "Post ID of the post you want to reply to.",
                    },    
                }, 
                required: ["content", "acct_name", "post_id"],
            },
        },
        },
    ];

    const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo-1106",
        messages: messages,
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
            set_post: setStatus,
            set_reply: setReply,
        }; // only one function in this example, but you can have multiple
        messages.push(responseMessage); // extend conversation with assistant's reply
        for (const toolCall of toolCalls) {
            const functionName = toolCall.function.name;
            const functionToCall = availableFunctions[functionName];
            const functionArgs = JSON.parse(toolCall.function.arguments);

            let functionResponse;
            switch (functionName) {
                case 'set_post':
                    functionResponse = functionToCall(functionArgs.content);
                    break;
                case 'set_reply':
                    functionResponse = functionToCall(functionArgs.content, functionArgs.acct_name, functionArgs.post_id);
                    break;
            }

            messages.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: functionName,
                content: functionResponse,
            }); // extend conversation with function response
        }
        const secondResponse = await openai.chat.completions.create({
            model: "gpt-3.5-turbo-1106",
            messages: messages,
        }); // get a new response from the model where it can see the function response
        return secondResponse.choices;
    }
}

runConversation().then(console.log).catch(console.error);
